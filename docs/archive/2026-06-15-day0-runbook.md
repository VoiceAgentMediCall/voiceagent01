# MediCall Pilot — Day-0 Operator Runbook

**Date:** 2026-06-15
**Owner:** Shubh (sole operator)
**Parent spec:** `2026-06-15-medicall-pilot-mvp-design.md`
**Purpose:** Single source of truth for what the operator does before, during, and after each pilot day.

---

## 1. Pre-flight status

Tick each item as it is confirmed. Do not start Day 5 calls until every box is ticked.

### Already done (Day 0 close)
- [x] Twilio account created
- [x] Twilio +1 number bought: **+1 814 524 3223**
- [x] Twilio Account SID + Auth Token captured (stored in `voiceagent/twilio_credentials.txt`)
- [x] Shubh's own +91 verified as Twilio Caller ID: **+91 8104348262**
- [x] Vapi API key captured (`voiceagent/vapi_api_key.txt`)
- [x] Sarvam API key captured (`voiceagent/sarvam_api_key.txt`)

### Still to do (Days 1-4)
- [ ] Vapi assistant created with Sarvam STT/TTS/LLM plugged in (Step 6 of plan)
- [ ] Google Sheet `medicall-pilot-log` created with `schedule` + `call_logs` tabs (Step 9)
- [ ] Apps Script webhook deployed as Web App, `/exec` URL captured (Step 9)
- [ ] Vapi assistant webhook URL wired to the Apps Script `/exec` URL (Step 10)
- [ ] Test call to **+91 8104348262** succeeds end-to-end: ring -> dialogue -> outcome row written to `call_logs` (Step 11)
- [ ] All 5 caregivers pre-briefed over WhatsApp using the template in §3 (Day 4)
- [ ] All 5 parent numbers verified inside Twilio console as trial Caller IDs (Day 4)

**Gate:** Day 5 calls do not begin until every box above is checked.

---

## 2. Daily operating procedure (Days 5-9)

The pilot is deliberately hand-flown. Manual triggering is a feature: it lets the operator watch every call live and iterate the prompt between attempts.

| Time (IST) | Action |
|---|---|
| 08:50 | Open Vapi dashboard. Open the Google Sheet `schedule` tab in a second tab. |
| 08:55 | Confirm Twilio status page is green and assistant `webhook URL` field still points at the Apps Script `/exec`. |
| 09:00 onwards | For each scheduled row, click **Dial** in the Vapi dashboard at the row's `dose_time`. Do not batch — fire them one at a time. |
| During call | Listen live. Keep the failure-mode log (§6) open. Note any prompt issues, latency, dropouts, or guardrail near-misses verbatim. |
| Immediately after each call | Verify the call's row appears in the `call_logs` tab. If it does not appear within 30 seconds, check Apps Script execution log before moving to the next call. |
| 21:00 | Review all 5 transcripts in full. Tune the Vapi assistant system prompt if any call broke down. Commit prompt changes only between days, never mid-day. |
| 21:30 | Send WhatsApp recap to each of the 5 caregivers using the template in §4. |
| 22:00 | Update the failure-mode log (§6) with anything noteworthy from the day. |

---

## 3. Caregiver pre-brief WhatsApp template

Sent once, on Day 4 evening, to each of the 5 caregivers. Replace `[CAREGIVER_NAME]`, `[maa/papa]`, and `[TIME]` per recipient.

```
Namaste [CAREGIVER_NAME],

Kal subah [TIME] baje aapke [maa/papa] ko USA ke number +1 814 524 3223 se MediCall ka phone aayega. Yeh AI prototype hai, koi scam ya marketing call nahin hai — main test kar raha hoon.

Please [maa/papa] ko aaj raat bata dijiye:
1. Kal subah ek call aayega
2. Number +1 se aayega (USA), magar Hindi mein baat karega
3. AI puchhega "kya dawai le li?" — bas haan ya nahin bolna hai
4. Call sirf 30-60 second ki hogi

Aapki madad ke liye dhanyavaad.

— Shubh
```

---

## 4. Daily caregiver recap WhatsApp template

Sent at 21:30 IST every pilot day, to each caregiver whose parent had a call that day. Replace bracketed fields from `call_logs`.

```
Namaste [CAREGIVER_NAME],

Aaj [DATE] subah ke MediCall ka update:
- [maa/papa] ne dawai: [li hai / nahin li hai / phone nahin uthaya]
- Call duration: [X] second
- Koi side effect ya samasya: [haan / nahin]
[if symptom mentioned, append: "[Maa/papa] ne [SYMPTOM] ka mention kiya — please [doctor / hospital] se baat kar lijiye."]

Kal phir kal subah [TIME] baje call aayega.

— Shubh
```

---

## 5. Escalation matrix

| Trigger | Automatic behavior | Operator action |
|---|---|---|
| Parent reports any symptom / side effect during the call | Assistant ends the call automatically per guardrail in §Dialogue of the design spec | Within 5 minutes, WhatsApp the caregiver the symptom **verbatim** from the transcript. Do not paraphrase. Do not give medical advice. Append a line in §6 with failure type `SYMPTOM_REPORTED`. |
| Parent does not answer / silence > 8s | Call ends, outcome `NO_ANSWER` is written to `call_logs` | No retry in pilot scope. Mention the no-answer in that evening's caregiver recap (§4). |
| Transcript shows hallucination, gibberish, or guardrail violation (medical advice, dose alteration, drug-name invention) | None — Vapi will deliver whatever the LLM produced | **PAUSE the pilot immediately.** Do not place the next scheduled call. Fix the prompt. Log the failure verbatim in §6. Document the root cause. Resume calls only the next morning (never same-day) so prompt changes get a clean evaluation window. |
| Twilio call fails to connect at all (carrier reject, number unreachable) | Outcome `NO_ANSWER` is written | Check Twilio console for error code. If three calls in a single day fail at the carrier layer, pause for the day and investigate before resuming. |

---

## 6. Failure-mode log

Append one row per incident. Do not delete rows — even fixed issues stay in the log so the Day-10 synthesis writeup can reconstruct what happened.

| Date | Time (IST) | Parent | Failure type | Root cause | Fix applied |
|---|---|---|---|---|---|
| | | | | | |

**Failure-type vocabulary** (use these strings exactly so the Day-10 writeup can group cleanly):

- `NO_ANSWER` — parent did not pick up or went silent > 8s
- `CARRIER_FAIL` — Twilio reported the call never connected
- `STT_GARBLED` — Sarvam Saaras transcript was unintelligible or mis-mapped intent
- `TTS_ROBOTIC` — caregiver/parent reported the voice felt unnatural enough to hang up
- `LATENCY_BAD` — turn latency > 1.5s caused awkward pauses or talk-over
- `GUARDRAIL_VIOLATION` — assistant gave medical advice, altered dosage, or invented a drug name
- `SYMPTOM_REPORTED` — parent volunteered a symptom; call ended per guardrail; caregiver escalation sent
- `PROMPT_LOOP` — assistant got stuck in a clarification loop > 2 attempts
- `HALLUCINATION` — assistant produced content not present in the system prompt or schedule row

Anything that does not fit one of these gets logged as `OTHER` and a one-line description in `Root cause`.
