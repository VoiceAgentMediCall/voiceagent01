# LiveKit + Twilio Elastic SIP — Outbound to Indian Mobiles

**Goal:** wire one Twilio US number (`+1 814 524 3223`) to LiveKit so a Python LiveKit Agent can dial Indian mobiles for Hindi voice calls.

**Architecture:** LiveKit Agent → LiveKit SIP service → Twilio Elastic SIP Trunk (Termination) → PSTN → Indian carrier (Jio / Airtel / Vi / BSNL).

Sources used throughout:
- [LiveKit — Create and configure a Twilio SIP trunk](https://docs.livekit.io/telephony/start/providers/twilio/)
- [LiveKit — Making outbound calls](https://docs.livekit.io/sip/making-calls/)
- [LiveKit — Outbound trunk reference](https://docs.livekit.io/sip/trunk-outbound/)
- [LiveKit — SIP participant fields](https://docs.livekit.io/sip/sip-participant/)
- [LiveKit — Webhooks](https://docs.livekit.io/home/server/webhooks/)
- [Twilio — Elastic SIP Trunking overview](https://www.twilio.com/docs/sip-trunking)
- [Twilio — Trunk setup walkthrough](https://www.twilio.com/en-us/blog/elastic-sip-trunking-step-by-step-setup)

---

## 1. Twilio Elastic SIP Trunking setup

In the Twilio Console: **Elastic SIP Trunking → Manage → Trunks → Create new Trunk** ([guide](https://www.twilio.com/en-us/blog/elastic-sip-trunking-step-by-step-setup)).

| Section | Field | Value for LiveKit outbound |
|---|---|---|
| **General** | Friendly Name | `livekit-out-india` |
| **General** | Recording | Off (you record in LiveKit) |
| **Termination** | Termination SIP URI | Twilio auto-generates, e.g. `livekit-out-india.pstn.twilio.com` — **copy this; it becomes `address` in the LiveKit trunk JSON** ([LiveKit](https://docs.livekit.io/telephony/start/providers/twilio/)) |
| **Termination → Authentication** | Credential Lists | Create at **Elastic SIP Trunking → Manage → Credential Lists**, then attach. Username/password are reused as `auth_username` / `auth_password` in the LiveKit trunk. |
| **Termination → Authentication** | IP Access Control Lists | Optional belt-and-suspenders. LiveKit Cloud egress IPs are listed at [LiveKit IP allowlist](https://docs.livekit.io/sip/secure-trunking/). For most setups, credential-list auth alone is sufficient and simpler. |
| **Origination** | Origination URI | **Not needed for outbound-only.** Only fill this if you ever want Twilio to deliver inbound DIDs to LiveKit (`sip:<project>.sip.livekit.cloud;transport=tcp`). |
| **Numbers** | Phone Numbers | Attach `+1 814 524 3223` here so it's a member of this trunk. |
| **Voice → International Permissions** | Enabled countries | **Must enable India (IN)** — Twilio blocks IDD to India by default. Without this, INVITEs to `+91…` get a `403 International calls not allowed`. ([Twilio international perms](https://www.twilio.com/docs/voice/international-dialing-restrictions)) |

**Auth choice:** Credential list is the right default. IP ACL is fragile because LiveKit Cloud egress IPs can change; if you do use it, run *both* (credential list AND IP ACL) so a rotated IP doesn't black-hole calls silently.

---

## 2. LiveKit SIP service config

### 2a. Outbound trunk JSON

Save as `outbound-trunk.json` and create with `lk sip outbound create outbound-trunk.json` ([LiveKit](https://docs.livekit.io/sip/trunk-outbound/)):

```json
{
  "trunk": {
    "name": "twilio-india-out",
    "address": "livekit-out-india.pstn.twilio.com",
    "numbers": ["+18145243223"],
    "auth_username": "$TWILIO_SIP_USER",
    "auth_password": "$TWILIO_SIP_PASS",
    "transport": "SIP_TRANSPORT_AUTO"
  }
}
```

The command returns a `sip_trunk_id` like `ST_xxxxxxxxxxxx` — store it in env as `LIVEKIT_OUTBOUND_TRUNK_ID`.

Field notes ([reference](https://docs.livekit.io/sip/trunk-outbound/)):

| Field | Notes |
|---|---|
| `address` | Exactly the Termination SIP URI host from Twilio. No `sip:` prefix, no port. |
| `numbers` | The CIDs you're allowed to present. Setting `["*"]` lets you pass any `sip_number` per-call, but trunk validation is looser. |
| `auth_username` / `auth_password` | Must match the Twilio credential list. |
| `transport` | `SIP_TRANSPORT_AUTO` resolves to TCP for Twilio's `*.pstn.twilio.com` endpoints. Use `SIP_TRANSPORT_TLS` if you also enable Secure Trunking on Twilio. |

### 2b. Dispatch rule (only needed if you ALSO want inbound)

Outbound calls don't need a dispatch rule — `create_sip_participant` is explicit. Dispatch rules route *inbound* INVITEs to rooms/agents ([LiveKit dispatch](https://docs.livekit.io/sip/dispatch-rule/)). Skip for now.

---

## 3. Python — create outbound call from a LiveKit Agent

Minimal pattern using `livekit.api.SipServiceClient.create_sip_participant` ([docs](https://docs.livekit.io/sip/making-calls/)):

```python
import asyncio, os, uuid
from livekit import api
from livekit.protocol.sip import CreateSIPParticipantRequest

LIVEKIT_URL = os.environ["LIVEKIT_URL"]            # wss://<proj>.livekit.cloud
TRUNK_ID    = os.environ["LIVEKIT_OUTBOUND_TRUNK_ID"]
CALLER_ID   = "+18145243223"                       # the Twilio number

async def dial(phone_e164: str, room: str | None = None) -> None:
    room = room or f"outbound-{uuid.uuid4().hex[:8]}"
    lkapi = api.LiveKitAPI()  # reads LIVEKIT_API_KEY / LIVEKIT_API_SECRET

    req = CreateSIPParticipantRequest(
        sip_trunk_id=TRUNK_ID,
        sip_call_to=phone_e164,          # "+91XXXXXXXXXX"
        sip_number=CALLER_ID,            # caller-ID presented to callee
        room_name=room,
        participant_identity=f"sip-{phone_e164}",
        participant_name="Hindi Agent",
        krisp_enabled=True,              # noise cancel on the SIP leg
        wait_until_answered=True,        # raises on busy/no-answer/SIP error
        # play_dialtone=False,
    )
    try:
        p = await lkapi.sip.create_sip_participant(req)
        print("connected:", p.participant_identity, "in room", room)
    except api.TwirpError as e:
        # SIP failures surface via metadata, e.g. 486 Busy, 480 Unavailable
        print("SIP error:", e.message, e.metadata.get("sip_status_code"))
    finally:
        await lkapi.aclose()

if __name__ == "__main__":
    asyncio.run(dial("+919876543210"))
```

**Inside an Agent worker**, dispatch the agent to the room *before* `create_sip_participant` so it's already listening when the callee picks up — see the [outbound-calls quickstart](https://docs.livekit.io/agents/quickstarts/outbound-calls/) for the `agent_dispatch.create_dispatch(...)` step.

---

## 4. Caller-ID — making `+1 814 524 3223` show up

Three things must all be true, or Twilio will rewrite or reject the CID:

1. **Number is on this trunk.** `+18145243223` must be attached under **Trunk → Numbers** (step 1).
2. **LiveKit asserts it.** Set it either as the sole entry in `trunk.numbers` (per-trunk default) or, for per-call override, pass `sip_number="+18145243223"` in the `CreateSIPParticipantRequest` ([trunk-outbound](https://docs.livekit.io/sip/trunk-outbound/)). The example in §3 uses both belts.
3. **India CLI reality check.** Indian operators frequently override or mask international CIDs — your `+1` US number may still display as **"International Call"** or **"Unknown"** on the callee's handset, especially on Jio. This is carrier behavior, not a LiveKit/Twilio bug. For verified, displayable Indian CID you'd need an Indian DID (which Twilio does not sell to non-Indian-registered businesses; use Plivo India, Exotel, or Knowlarity). See [Twilio India regulatory](https://www.twilio.com/en-us/guidelines/regulatory#india).

---

## 5. End-of-call hook (webhook)

LiveKit fires HTTP POST webhooks on room lifecycle events ([docs](https://docs.livekit.io/home/server/webhooks/)).

**Where configured:** LiveKit Cloud dashboard → **Project Settings → Webhooks → Add endpoint**. Pick the signing API key (LiveKit signs the body with a JWT in `Authorization`).

**Events that matter for end-of-call:**

| Event | When it fires | Use for |
|---|---|---|
| `participant_left` | SIP participant hangs up or call drops | Per-call cleanup, write transcript row |
| `room_finished` | Last participant gone, room torn down | Trigger post-call processing pipeline |
| `participant_connection_aborted` | Failed to connect at all | Mark dial as failed in CRM |

**Payload shape** (`Content-Type: application/webhook+json`):

```json
{
  "id": "EV_abc123...",
  "createdAt": 1750000000,
  "event": "room_finished",
  "room": {
    "sid": "RM_xxx",
    "name": "outbound-a1b2c3d4",
    "emptyTimeout": 300,
    "creationTime": 1749999900,
    "numParticipants": 0
  },
  "participant": {
    "identity": "sip-+919876543210",
    "name": "Hindi Agent",
    "metadata": "...",
    "attributes": {
      "sip.callID": "CA_xxx",
      "sip.callStatus": "hangup",
      "sip.phoneNumber": "+919876543210",
      "sip.trunkID": "ST_xxx",
      "sip.twilio.callSid": "CAxxxxxxxxxxxxxxxx"
    }
  }
}
```

`sip.twilio.callSid` lets you cross-reference Twilio billing/CDRs. Verify the JWT in `Authorization` against your project API secret before trusting payloads ([webhooks](https://docs.livekit.io/home/server/webhooks/)).

---

## 6. DTMF & codec for Indian GSM mobiles

| Concern | Twilio default | Notes for India |
|---|---|---|
| **Codec to PSTN** | PCMU (G.711 µ-law) negotiated to Twilio | Twilio transcodes to whatever Indian operator wants (almost always G.711 or AMR-NB on GSM, EVS on VoLTE). No knob to twist. |
| **LiveKit ↔ Twilio leg codec** | LiveKit prefers Opus; Twilio Termination negotiates G.711 PCMU. | Default works. Indian operators don't accept Opus end-to-end. Don't fight it. |
| **DTMF** | RFC 2833 (telephone-event), negotiated automatically | Send via [`room.local_participant.publish_dtmf(code, digit)`](https://docs.livekit.io/sip/dtmf/) — works for IVR navigation on Indian banks/utilities. |
| **Echo/jitter** | Twilio adjusts buffer to carrier. | Indian mobile RTT to nearest Twilio edge (Mumbai POP via Twilio India region) is ~30–80ms. Pin Twilio trunk to **Asia-Pacific (Singapore or Tokyo)** under **Trunk → General → Termination → Geographic Permissions** to minimize jitter ([Twilio regional trunks](https://www.twilio.com/docs/global-infrastructure/regional-sip-trunks)). |

**TL;DR:** leave the codec alone, DTMF works out of the box, just pin the Twilio region near India.

---

## 7. Latency vs Vapi's auto-Twilio import

Vapi (and similar telephony-wrapped agent platforms) bundle their own Twilio account and put the agent worker on the same VPC as their SIP service — call path is roughly:

```
Vapi:    Caller → Twilio → Vapi-SIP+Agent (co-located) → LLM/TTS
This:    Caller → Twilio → LiveKit SIP → LiveKit Agent → LLM/TTS
```

The extra hop is **LiveKit SIP → LiveKit Agent inside the same LiveKit region** — a WebRTC media path inside one cloud region. Realistic added one-way latency: **~20–50ms** vs a co-located stack, dominated by the Twilio→LiveKit-region RTT (Twilio Singapore → LiveKit `ap-southeast` is ~10–15ms; Twilio Singapore → LiveKit `us-west` is the killer at +180ms).

**Practical knobs to keep it under 50ms added:**

- Set LiveKit Cloud project region to **`ap-south-1`** (Mumbai) or **`ap-southeast-1`** (Singapore).
- Pin Twilio Termination region to **Singapore (`singapore`)** via the regional URI ([Twilio regional URIs](https://www.twilio.com/docs/global-infrastructure/localized-uris/elastic-sip-trunk-regional-migration-best-practices)).
- Co-locate the Agent worker (or LiveKit Cloud Agents) in the same region.

The remaining latency difference vs Vapi is **codec transcoding (PCMU↔Opus, one frame ≈20ms)** plus the second SIP signaling hop — neither is something you can engineer away while keeping the LiveKit Agent SDK. Net qualitative: noticeable on side-by-side A/B, invisible to a normal user.

---

## Verification checklist

- [ ] `lk sip outbound list` returns the trunk with the right `address`.
- [ ] `lk sip participant create --trunk ST_xxx --call +91… --identity test --room test-room` succeeds with `wait_until_answered`.
- [ ] Twilio Console → **Monitor → Logs → Calls** shows the call with status `completed` and `From: +18145243223`.
- [ ] Webhook endpoint receives `participant_left` then `room_finished` with `sip.twilio.callSid` populated.
- [ ] Hindi TTS audio is intelligible on a real Indian mobile (test on both 4G and a flaky 3G/Edge fallback).
