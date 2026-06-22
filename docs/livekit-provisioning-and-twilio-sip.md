# LiveKit Provisioning & Twilio SIP Trunk Setup

**Audience:** Operator setting up the Medicall pilot for the first time.
**Time:** ~45 minutes end-to-end.
**Outcome:** A LiveKit Cloud project, a Twilio Elastic SIP Trunk, and a working test call from your laptop to a real Indian mobile.

---

## 1. Prerequisites

Have these in hand **before starting**:

| Item | Where to get it | Notes |
|---|---|---|
| LiveKit Cloud account | https://cloud.livekit.io | Free tier OK for pilot |
| Twilio account | https://console.twilio.com | Must be **upgraded** (not trial) — trial blocks calls to unverified Indian numbers |
| Twilio US number (+1 814 524 3223) | Already provisioned | Verify under **Phone Numbers → Manage → Active numbers** |
| Credit card on Twilio | For trunk usage (~$0.013/min outbound to IN) | |
| Terminal / PowerShell access | Local machine | For `lk` CLI commands |
| Project repo cloned | `voiceagent/` | `.env` template at `voiceagent/livekit/.env.example` |

---

## 2. Part A — LiveKit Cloud Signup

| Step | Action |
|---|---|
| A1 | Go to **https://cloud.livekit.io** → click **Sign up** (use GitHub or email) |
| A2 | After login → **Create Project** → name it `medicall-pilot` → region **India (Mumbai)** if available, else **Singapore** |
| A3 | In the project, open **Settings → Keys** → click **Add new key** → label it `pilot-server` → copy the three values shown |
| A4 | Note your project subdomain shown at top of the dashboard (e.g. `medicall-pilot-abc123.livekit.cloud`) — you'll need it for SIP termination |
| A5 | Paste the three values into `voiceagent/livekit/.env`: |

```bash
# voiceagent/livekit/.env
LIVEKIT_URL=wss://medicall-pilot-abc123.livekit.cloud
LIVEKIT_API_KEY=APIxxxxxxxxxxxx
LIVEKIT_API_SECRET=secret_xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx
```

> Treat `LIVEKIT_API_SECRET` like a password. Never commit it. The `.env` is already in `.gitignore`.

---

## 3. Part B — Install LiveKit CLI (`lk`)

Pick the line for your OS and run it once.

| OS | Command |
|---|---|
| **Windows (Scoop)** | `scoop install livekit-cli` |
| **Windows (winget)** | `winget install LiveKit.LivekitCLI` |
| **macOS** | `brew install livekit-cli` |
| **Linux** | `curl -sSL https://get.livekit.io/cli \| bash` |

Verify:

```bash
lk --version
# expect: lk version 2.x.x
```

Authenticate the CLI to your project (one time):

```bash
lk cloud auth
# opens a browser, pick project "medicall-pilot", click Authorize
```

---

## 4. Part C — Create the Twilio Elastic SIP Trunk

All steps inside the Twilio Console (https://console.twilio.com).

### C1. Create the trunk

| Step | Click path | Value |
|---|---|---|
| C1.1 | **Explore Products → Elastic SIP Trunking → Trunks → Create new SIP Trunk** | — |
| C1.2 | Friendly name | `livekit-medicall` |
| C1.3 | Click **Create** | — |

### C2. Termination (Twilio → LiveKit, **outbound** from Twilio's POV)

This is what Twilio uses to deliver inbound PSTN calls into LiveKit. For the pilot's **outbound** path (LiveKit places a call out via Twilio), termination is also where Twilio receives the SIP INVITE from LiveKit.

| Step | Click path | Value |
|---|---|---|
| C2.1 | Open trunk → **Termination** tab | — |
| C2.2 | **Termination SIP URI** | `medicall-pilot.pstn.twilio.com` (must be globally unique — Twilio shows green check when free) |
| C2.3 | **Authentication → Credential Lists → Create new** | Name: `livekit-creds` |
| C2.4 | Inside the credential list, click **Add a Credential** | Username: `livekit_medicall`, Password: a 24-char random string (save it!) |
| C2.5 | Back on trunk → attach the new credential list | — |
| C2.6 | **Save** | — |

> **Save these now** — you'll paste them into the LiveKit outbound trunk JSON in Part D:
> - Twilio termination URI: `medicall-pilot.pstn.twilio.com`
> - Username: `livekit_medicall`
> - Password: `<the 24-char string>`

### C3. Origination (Twilio → LiveKit, **inbound** to LiveKit)

Not used in the pilot (we only place outbound). Configure later when adding inbound IVR.

| Step | Click path | Value |
|---|---|---|
| C3.1 | Open trunk → **Origination** tab | — |
| C3.2 | **Add new Origination URI** | `sip:medicall-pilot.sip.livekit.cloud` (substitute your project subdomain) |
| C3.3 | Priority 10, weight 10, **Enabled** | — |

### C4. Associate the +1 number

| Step | Click path | Value |
|---|---|---|
| C4.1 | Trunk → **Numbers** tab → **Add an existing number** | — |
| C4.2 | Select **+1 (814) 524-3223** → **Add** | — |
| C4.3 | Confirm it appears under "Associated Numbers" | — |

---

## 5. Part D — Configure the LiveKit Outbound SIP Trunk

LiveKit needs to know "when I want to dial out, use this Twilio trunk."

### D1. Write the trunk spec

Create `voiceagent/livekit/sip/outbound-trunk.json`:

```json
{
  "trunk": {
    "name": "twilio-medicall-outbound",
    "address": "medicall-pilot.pstn.twilio.com",
    "numbers": ["+18145243223"],
    "auth_username": "livekit_medicall",
    "auth_password": "REPLACE_WITH_TWILIO_PASSWORD",
    "transport": "SIP_TRANSPORT_AUTO"
  }
}
```

### D2. Create it in LiveKit

```bash
cd voiceagent/livekit
lk sip outbound create sip/outbound-trunk.json
```

Expected output:

```
SIPTrunkID: ST_xxxxxxxxxxxx
Name:       twilio-medicall-outbound
Numbers:    [+18145243223]
```

**Save the `ST_...` ID** — you pass it as `sip_trunk_id` when placing calls. Add it to `.env`:

```bash
LIVEKIT_SIP_TRUNK_ID=ST_xxxxxxxxxxxx
```

### D3. List to confirm

```bash
lk sip outbound list
```

---

## 6. Part E — Place the First Test Call

A minimal Python script. Save as `voiceagent/livekit/scripts/test_call.py`:

```python
# voiceagent/livekit/scripts/test_call.py
import asyncio
import os
from dotenv import load_dotenv
from livekit import api

load_dotenv()

async def place_test_call():
    lkapi = api.LiveKitAPI(
        url=os.environ["LIVEKIT_URL"],
        api_key=os.environ["LIVEKIT_API_KEY"],
        api_secret=os.environ["LIVEKIT_API_SECRET"],
    )

    request = api.CreateSIPParticipantRequest(
        sip_trunk_id=os.environ["LIVEKIT_SIP_TRUNK_ID"],
        sip_call_to="+918104348262",          # target mobile (India)
        room_name="medicall-test-001",
        participant_identity="sip-callee",
        participant_name="Test Patient",
        dtmf_tone="",                          # no DTMF needed
        hide_phone_number=False,               # show caller ID
        wait_until_answered=True,
    )

    participant = await lkapi.sip.create_sip_participant(request)
    print(f"Call placed. Participant SID: {participant.participant_id}")
    print(f"Room: {participant.room_name}")
    await lkapi.aclose()

if __name__ == "__main__":
    asyncio.run(place_test_call())
```

Run:

```bash
cd voiceagent/livekit
pip install livekit-api python-dotenv          # one-time
python scripts/test_call.py
```

**What to expect:**
1. CLI prints `Call placed. Participant SID: PA_...` within ~2 seconds.
2. The Indian mobile rings, caller ID shows `+1 814 524 3223`.
3. Pick up → silence (no agent attached yet — that's Part G in the implementation plan).
4. Hang up → call ends, room auto-closes after 30s idle.

---

## 7. Part F — Verify End-of-Call Webhook

Wire LiveKit Cloud to your Apps Script logger so every call writes a row to the Google Sheet.

| Step | Click path | Value |
|---|---|---|
| F1 | LiveKit Cloud → **Settings → Webhooks → Add webhook** | — |
| F2 | **URL** | `https://script.google.com/macros/s/AKfycbx.../exec` (your Apps Script `/exec` URL) |
| F3 | **Event types** — check both | `room_finished`, `participant_disconnected` |
| F4 | **Signing key** | Auto-generated — copy into `.env` as `LIVEKIT_WEBHOOK_KEY` |
| F5 | Click **Save** | — |
| F6 | Click **Send test event** → check the Apps Script Sheet — a test row should appear within 5 seconds | — |

> If the test row doesn't show: open Apps Script → **Executions** tab → look for the failed run → check the error (most often: wrong sheet ID, missing `doPost`, or the `/exec` URL is the dev URL not the deployed `/exec`).

---

## 8. Troubleshooting

| Symptom | Likely cause | Fix |
|---|---|---|
| `401 Unauthorized` on outbound SIP INVITE | Twilio credential list password mismatch | Re-copy password from Twilio Console → paste into `outbound-trunk.json` → re-run `lk sip outbound update <ID> sip/outbound-trunk.json` |
| Call rings then drops after ~5s with no audio | Codec mismatch (Twilio expects PCMU/PCMA, LiveKit sending Opus) | In Twilio trunk → **Voice → Configurations** enable **OPUS** codec, or in LiveKit SIP set `media_encryption: SIP_MEDIA_ENCRYPT_NONE` |
| Caller ID shows "Blocked" or "Unknown" on the Indian mobile | Indian carriers strip non-IN caller IDs frequently | Expected on US→IN. Buy a Twilio Indian DID later (`+91`) for cleaner display, or set `hide_phone_number=True` and rely on outbound caller name configured at carrier level |
| `lk sip outbound create` returns `permission denied` | CLI not authed to the right project | Run `lk cloud auth` again, pick `medicall-pilot` |
| Webhook test event never reaches Apps Script | Apps Script deployment is "Anyone with link" but redirects through Google login | Re-deploy Apps Script as **Web App → Execute as: Me, Access: Anyone** (not "Anyone with Google account"). Use the new `/exec` URL. |
| Twilio rejects calls to `+91...` with `21215` (geo-permission) | International call permissions disabled by default | Twilio Console → **Voice → Settings → Geo permissions** → enable **India** under low-risk |
| Test call places but rings in agent room with no SIP participant | Trunk `numbers` array doesn't include the From number | Edit `outbound-trunk.json` → set `numbers: ["+18145243223"]` exactly → update via `lk sip outbound update` |

---

## What's next

Once the test call rings and the webhook fires, you're ready for **Part G** of the implementation plan (`docs/2026-06-15-medicall-implementation-plan.md`): attach the agent worker so the call has a real voice on the other end.