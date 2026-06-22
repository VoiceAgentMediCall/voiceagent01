# LiveKit Cloud — Pricing, India Region, and Self-Host Comparison

**Audience:** Non-tech PM choosing between LiveKit Cloud now vs self-host later for a Hindi voice-agent pilot (25 calls scaling to ~5,160 calls/month).
**As of:** 2026-06-15. Verify on [livekit.com/pricing](https://livekit.com/pricing) before committing — LiveKit changed its pricing model in mid-2025 and again with the Telnyx telephony partnership in April 2026.

---

## 1. TL;DR for the PM

| Question | Answer |
|---|---|
| Can I run the 25-call pilot free? | **Yes.** Free tier covers 1,000 agent minutes + 5,000 WebRTC minutes + 1,000 SIP minutes per month. ([pricing](https://livekit.com/pricing)) |
| Can I run 5,160 calls/month free? | **No.** Assuming 5-min avg calls = ~25,800 agent minutes. Need the **Ship** plan ($50/mo) at minimum. |
| Is India region available? | **Yes** — `india` region (Mumbai + Hyderabad) is GA for both agents and telephony. ([region docs](https://docs.livekit.io/telephony/features/region-pinning/)) |
| Will India calls be low latency? | **Yes if you pin to `india` region.** Default US routing adds 200ms+ RTT. ([deployment checklist](https://livekit.com/blog/checklist-for-regional-deployments)) |
| Should I self-host now? | **No.** At pilot scale, Cloud is cheaper than ops time. Reconsider at 50k+ minutes/month. |
| Is data residency (DPDP) clean? | **Partially.** Region pinning keeps media in India, but LiveKit has no published DPDP statement — flag for legal review before handling sensitive parent data. |

---

## 2. Free Tier ("Build" plan)

| Resource | Free Allowance | Overage |
|---|---|---|
| **Agent session minutes** | 1,000 / month | Must upgrade — no PAYG on Build |
| **WebRTC minutes** | 5,000 / month | Must upgrade |
| **SIP minutes** (PSTN bridge) | 1,000 / month | Must upgrade |
| **Concurrent agent sessions** | 5 | Hard cap |
| **Concurrent WebRTC connections** | 100 | Hard cap |
| **Agent deployments** | 1 | Hard cap |
| **LiveKit Inference credits** (STT/TTS/LLM) | $2.50 (~50 min) | Must upgrade |
| **Telephony** | 1 free US local number + 50 inbound min | US only on free tier |
| **Bandwidth / egress** | Bundled (not separately metered on Build) | n/a |
| **Support** | Community forum only | n/a |
| **Credit card required?** | **No** | n/a |

Source: [LiveKit Pricing](https://livekit.com/pricing), [LiveKit Pricing Guide via Voice-Mode docs](https://voice-mode.readthedocs.io/en/stable/livekit/pricing/).

**Catch for India pilot:** the free phone number is **US-only**. To accept calls from Indian parents on a +91 number, you must either (a) use a third-party SIP trunk (Plivo / Exotel / Twilio India) and route via LiveKit SIP, or (b) upgrade to a paid plan and add an Indian DID where available. The free 50 inbound minutes on the US number won't help a Hindi parent flow.

---

## 3. Paid Tiers (snapshot)

| Item | Build (Free) | Ship ($50/mo) | Scale ($500/mo) | Enterprise |
|---|---|---|---|---|
| Monthly fixed cost | $0 | $50 | $500 | Custom |
| Agent session min included | 1,000 | 5,000 | 50,000 | Custom |
| Agent overage | n/a | $0.01/min | $0.01/min | Volume |
| WebRTC min included | 5,000 | 150,000 | 1.5M | Custom |
| WebRTC overage | n/a | $0.0005/min | $0.0004/min | Volume |
| SIP min included | 1,000 | 5,000 | 50,000 | Custom |
| SIP overage | n/a | $0.004/min | $0.003/min | Volume |
| Data transfer (egress) | Bundled | 250 GB then $0.12/GB | 3 TB then $0.10/GB | Custom |
| Concurrent agent sessions | 5 | 20 | up to 600 | Custom |
| Concurrent WebRTC connections | 100 | 1,000 | 5,000 | Custom |
| Agent deployments | 1 | 2 | 4 | Custom |
| Inference credits | $2.50 | $5 | $50 | Volume |
| Telephony (inbound min on free number) | 50 | 100 | 1,000 | Custom |
| Custom voices | 0 | 20 | 50 | Custom |
| Support | Community | Email | Email | Dedicated Slack + SLA |
| SOC 2 Type II / HIPAA BAA | No | No | Yes | Yes |
| SSO / RBAC | No | No | RBAC | Both |

Source: [LiveKit Pricing](https://livekit.com/pricing) — extracted 2026-06-15.

### What "agent session minute" means
- Billed per **concurrent agent**, in **1-minute increments**, starting when the agent connects to a room and ending when room closes or agent disconnects. ([billing docs](https://docs.livekit.io/deploy/admin/billing/))
- So a 4-min 30-sec call → billed as **5 agent-minutes**.
- WebRTC minutes are a **separate line item** — they meter the participant-to-LiveKit media stream. SIP minutes are billed in addition when calls come in via PSTN.

**A typical Hindi parent call hits THREE meters at once:** 1 SIP minute (PSTN) + 1 WebRTC minute (media routing) + 1 Agent minute (agent runtime). Plan capacity against the **tightest** of the three buckets.

---

## 4. Voice-Agent-Specific Pricing

### How inbound and outbound differ

| Call type | Meters that fire | Notes |
|---|---|---|
| **Inbound PSTN → Agent** | SIP min + Agent min + Inference (STT/TTS/LLM) | If using LiveKit's bundled number, also burns "free inbound" pool. |
| **Outbound Agent → PSTN** | SIP min + Agent min + Inference | After April 2026 Telnyx partnership, outbound runs at sub-200ms PSTN latency at "~50% lower cost vs DIY trunking" per LiveKit. ([Telnyx blog](https://telnyx.com/resources/livekit-pricing-scale-voice-ai-costs)) |
| **Browser/app → Agent** (no PSTN) | WebRTC min + Agent min + Inference | No SIP cost. Best for in-app voice. |

**Key gotcha:** inbound and outbound **both** consume the SIP minute pool at the same rate ($0.004/min on Ship, $0.003/min on Scale). LiveKit does not publish separate inbound vs outbound rates — the cost difference comes from the underlying **carrier termination** fees, which are passed through.

### Inference (STT + TTS + LLM)
- LiveKit Inference is a separate add-on credit pool — it's NOT a markup-free passthrough.
- STT: $0.0025–$0.0117/min depending on provider/tier.
- TTS: $0.009–$0.18/min (huge range — ElevenLabs premium voices are ~20x cheaper Deepgram Aura).
- LLM: $0.0002–$0.0676/min — depends entirely on model + token volume.
- You can **bring your own keys** for OpenAI/Anthropic/Deepgram/ElevenLabs and skip Inference entirely. Recommended for the pilot — keeps cost line items legible.

Source: [LiveKit Pricing](https://livekit.com/pricing), [Voice-Mode pricing guide](https://voice-mode.readthedocs.io/en/stable/livekit/pricing/).

---

## 5. India Region — Availability & Latency

### Availability
LiveKit Cloud telephony and agent regions confirmed by [region pinning docs](https://docs.livekit.io/telephony/features/region-pinning/) (updated 2026-03-13):

| Region code | Locations |
|---|---|
| `india` | **Mumbai + Hyderabad** |
| `us` | US Central / East / West |
| `eu` | France, Germany, Zurich |
| `uk` | UK |
| `japan` | Japan |
| `aus` | Australia |
| `sa` | Saudi Arabia |

Outbound dialing into India (`destination_country=in`) is supported and routes via Mumbai/Hyderabad PoPs.

**Status note:** The docs do **not** explicitly mark `india` as beta — it's listed alongside `us` and `eu` without caveat. Status page ([status.livekit.io](https://status.livekit.io/)) shows Mumbai traffic serving normally. Treat as GA but worth a sanity check on the day you launch.

### Latency
LiveKit's own deployment checklist ([blog post](https://livekit.com/blog/checklist-for-regional-deployments)) states:
- **<150ms RTT** = feels real-time for voice
- **>200ms RTT** = perceptible lag
- **Mumbai parent → US East LiveKit node**: 200ms+ RTT typical, often 250-300ms
- **Mumbai parent → `india` region**: <50ms RTT typical

For Hindi voice flows where parents expect natural turn-taking, **pin to `india` region** is effectively mandatory. The US default will make the agent feel slow and "AI-like" — a known killer for non-tech-savvy users.

### How to pin (one-line config)
- **Inbound:** point SIP trunk to `{subdomain}.india.sip.livekit.cloud`
- **Outbound:** set `destination_country: "in"` in the SIP trunk config
- **Agent runtime:** deploy the agent to the India region in the LiveKit dashboard

### Companion regional services
Deepgram (STT) also offers a Mumbai hosting region — pair it with LiveKit India to keep STT round-trip inside the country. ([Deepgram regional hosting](https://livekit.com/products/agent-cloud-deployment))

### Known issue to watch
[GitHub issue #4053](https://github.com/livekit/agents/issues/4053) flags latency regressions when deploying to non-US regions — community reports occasional 100-150ms agent-startup delays in EU/India regions vs US. Doesn't affect steady-state call latency but does affect first-response time. Test before pilot launch.

---

## 6. Data Residency & DPDP Posture

| Concern | What LiveKit publishes | What's missing | Risk for MediCall |
|---|---|---|---|
| Where is media (audio) routed? | India region keeps media plane within Mumbai/Hyderabad PoPs when region-pinned | No explicit data-residency contract on Ship plan | Medium — config-level guarantee, not contractual |
| Where is metadata stored? | Control plane (room state, billing) appears US-hosted | Not documented for India tenants | Medium |
| Is audio recorded by default? | **No** — recordings are opt-in (Egress API) | n/a | Low if you don't enable Egress |
| DPDP Act 2023 compliance posture | **Not publicly stated** | No DPDP whitepaper, no India-specific DPA | **High** — get this in writing before storing parent voice data |
| HIPAA BAA | Available on Scale ($500/mo) and Enterprise | Not on Build or Ship | Medium — HIPAA is US-centric, but signals process maturity |
| SOC 2 Type II | Available on Scale and Enterprise | Not on lower tiers | Low for pilot, High for prod |

**Recommendation:** For the 25-call pilot, region-pin to India and **do not enable recording** until DPDP posture is verified with LiveKit sales. For the 5,160-call/month scale-up, request a written DPA referencing DPDP Act 2023 before processing real parent voice.

Sources: [LiveKit Pricing](https://livekit.com/pricing) (mentions SOC 2 / HIPAA on Scale tier), [region pinning docs](https://docs.livekit.io/telephony/features/region-pinning/). No DPDP-specific public docs found as of 2026-06-15.

---

## 7. Self-Host Cost Comparison

### Self-host the LiveKit OSS server yourself

| Component | Spec | Cost (approx) |
|---|---|---|
| LiveKit SFU/agent server (Hetzner AX41) | 16-core, 64GB RAM, dedicated | **€39/mo (~$42)** ([source](https://www.hetzner.com/dedicated-rootserver/ax41-nvme/)) |
| LiveKit SFU on DigitalOcean (general-purpose 4vCPU/8GB) | Comparable to LiveKit's "starter" sizing | ~$48/mo |
| LiveKit SFU on AWS Mumbai (c6i.xlarge) | 4-core, 8GB | ~$140/mo on-demand |
| Bandwidth egress (Hetzner) | unmetered up to ~20 TB | **~$0.001/GB effective** |
| Bandwidth egress (DigitalOcean) | 5 TB free, then $0.01/GB | Cheap |
| Bandwidth egress (AWS Mumbai) | $0.1093/GB after 100GB free | Expensive — kills the math |
| SIP trunk (Plivo India / Exotel) | inbound INR 0.25–0.40/min, outbound INR 0.60–1.20/min | Pass-through |
| TURN/STUN server (coturn) | Bundled on same VM | $0 |
| Inference (BYO keys) | Pay direct to Deepgram/OpenAI/ElevenLabs | Same as on Cloud |
| **Ops cost: setup + monitoring + on-call** | Hidden but real | **10–30 hrs/month engineering time** |

Sources: [LiveKit vs Agora cost analysis](https://www.forasoft.com/blog/article/livekit-vs-agora-cost-analysis), [LiveKit self-host docs](https://docs.livekit.io/deploy/custom/deployments/), [LiveKit community forum](https://community.livekit.io/t/best-platform-to-self-host/614).

### Capacity rule of thumb (self-host)
LiveKit recommends **4 cores + 8 GB RAM per agent server** as a starting point — handles **10–25 concurrent voice agent jobs** depending on noise cancellation, turn detection, and inference complexity.

For 5,160 calls/month at ~5 min avg = ~430 hours/month of agent runtime. Peak concurrency is the real driver. If calls are evenly spread over a 10-hour parent-friendly window, that's roughly 2-4 concurrent calls — comfortably one €39/mo Hetzner box. If they bunch (school dismissal, evening), spike could hit 10-15 concurrent, still well within one box.

### Side-by-side: 5,160 calls × 5 min = 25,800 minutes/month

| Line item | LiveKit Cloud (Ship $50) | LiveKit Cloud (Scale $500) | Self-host (Hetzner) |
|---|---|---|---|
| Base subscription | $50 | $500 | $42 |
| Agent minutes (25,800) | $208 overage (5k free, then $0.01 × 20,800) | $0 (within 50k) | $0 |
| WebRTC minutes (25,800) | $0 (within 150k) | $0 | $0 |
| SIP minutes (25,800) | $83 overage (5k free, then $0.004 × 20,800) | $0 (within 50k) | $0 (use Plivo trunk) |
| Bandwidth (~50GB/mo est) | $0 (within 250GB) | $0 | $0 |
| Inference (BYO keys) | ~$120 (Deepgram + OpenAI Realtime) | ~$120 | ~$120 |
| SIP trunk (Plivo India, ~25,800 min) | Bundled in SIP min above | Bundled | ~$80 (₹0.25/min × 25,800) |
| Engineering/ops time | ~2 hrs/mo @ $50/hr = $100 | ~2 hrs/mo = $100 | ~15 hrs/mo @ $50/hr = $750 |
| **Total estimated monthly** | **~$561** | **~$720** | **~$992** |

**Conflicting info flag:** [trtc.io's LiveKit comparison](https://trtc.io/blog/details/livekit-pricing-2026) argues self-host wins above 10k minutes/month. [Forasoft's analysis](https://www.forasoft.com/blog/article/livekit-vs-agora-cost-analysis) says crossover is closer to 100k minutes/month once ops are honestly accounted. **Recommendation: trust Forasoft for solo-founder math** — they include ops time, trtc.io doesn't.

---

## 8. Pilot Cost Walkthrough (25 calls, ~5 min each = 125 minutes)

| Line item | Cost on Build (Free) |
|---|---|
| Agent minutes (125) | $0 (within 1,000) |
| WebRTC minutes (125) | $0 (within 5,000) |
| SIP minutes (125) | $0 (within 1,000) |
| Inbound from Indian +91 number via Plivo/Exotel | ~$0.40 (₹0.25/min × 125) |
| Inference (Deepgram STT + GPT-4o-mini + ElevenLabs) | ~$0.60 |
| **Pilot total** | **~$1 + zero LiveKit charges** |

The free tier covers the pilot end-to-end. **The only real cost is the Indian SIP trunk and the inference passthrough.**

---

## 9. Recommendations for MediCall Pilot

- **Use LiveKit Cloud Build (free tier) for the 25-call pilot.** Zero infra cost, zero ops burden. Pin to `india` region from day 1 — don't let US-default latency taint your first user test.
- **Bring your own SIP trunk via Plivo or Exotel for the +91 number.** The free US number won't work for Hindi parents and Indian carriers have better deliverability than international routing.
- **BYO inference keys (Deepgram, OpenAI, ElevenLabs).** Skip LiveKit Inference credits — you get clearer cost attribution per provider, and no markup. Easier to swap STT engine if Hindi accuracy disappoints.
- **Do NOT enable Egress recording until DPDP posture is confirmed.** Get a written statement from LiveKit sales referencing DPDP Act 2023 before storing parent voice. For pilot, log transcripts only.
- **Plan the upgrade trigger now.** You'll outgrow Build around 1,000 agent minutes/month (~200 five-min calls). At that point, jump to **Ship ($50/mo)** — that buys headroom to ~50 parents. Don't jump to Scale ($500) until you genuinely hit 5k+ agent minutes/month.
- **Defer self-hosting until you have >50,000 minutes/month sustained AND a part-time engineer.** Below that, Cloud + your founder time beats VPS ops + your founder time. Forasoft's analysis backs this.
- **Latency test before launch.** Make 5 calls from a Mumbai phone, 5 from Delhi, 5 from Bangalore on the `india`-pinned setup. Time the first agent response. Anything >2 sec from "hello" to agent's first word → debug before pilot.

---

## Sources

- [LiveKit Pricing (official)](https://livekit.com/pricing)
- [LiveKit Cloud billing docs](https://docs.livekit.io/deploy/admin/billing/)
- [LiveKit telephony region pinning docs](https://docs.livekit.io/telephony/features/region-pinning/)
- [LiveKit self-host deployment docs](https://docs.livekit.io/deploy/custom/deployments/)
- [LiveKit Status page](https://status.livekit.io/)
- [LiveKit blog: regional deployment checklist](https://livekit.com/blog/checklist-for-regional-deployments)
- [LiveKit blog: future-aligned pricing model](https://blog.livekit.io/towards-a-future-aligned-pricing-model/)
- [LiveKit Agents Cloud Deployment](https://livekit.com/products/agent-cloud-deployment)
- [Voice-Mode docs — LiveKit pricing guide](https://voice-mode.readthedocs.io/en/stable/livekit/pricing/)
- [Forasoft: LiveKit vs Agora 2026 cost analysis](https://www.forasoft.com/blog/article/livekit-vs-agora-cost-analysis)
- [Telnyx: LiveKit pricing at scale](https://telnyx.com/resources/livekit-pricing-scale-voice-ai-costs)
- [LiveKit Community forum: best platform to self-host](https://community.livekit.io/t/best-platform-to-self-host/614)
- [LiveKit Agents GitHub issue #4053 — EU latency](https://github.com/livekit/agents/issues/4053)
- [trtc.io: LiveKit Pricing 2026 breakdown](https://trtc.io/blog/details/livekit-pricing-2026)
- [Hetzner AX41 dedicated server pricing](https://www.hetzner.com/dedicated-rootserver/ax41-nvme/)
