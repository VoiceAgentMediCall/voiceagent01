# MediCall Browser Test Client

The LiveKit equivalent of Vapi's "Test in browser" — chat with `agent.py` from your laptop, no phone call required.

## Prereqs

1. `agent.py` is set up and runnable from the parent folder.
2. `.env` exists in `voiceagent/` (or here) with:
   ```
   LIVEKIT_URL=wss://your-project.livekit.cloud
   LIVEKIT_API_KEY=APIxxxxxxxx
   LIVEKIT_API_SECRET=secretxxxxxxxx
   ```

## Setup (one time)

```powershell
cd "C:\Users\SHUBH SANKALP DAS\Desktop\Building\voiceagent\browser-test"
pip install -r requirements.txt
```

## Run (every time)

Open **two terminals**.

**Terminal 1 — the agent:**
```powershell
cd "C:\Users\SHUBH SANKALP DAS\Desktop\Building\voiceagent"
python agent.py dev
```

**Terminal 2 — the browser client:**
```powershell
cd "C:\Users\SHUBH SANKALP DAS\Desktop\Building\voiceagent\browser-test"
python server.py
```

Open <http://localhost:3000>, click **Connect**, allow mic access, and start talking.

## Troubleshooting

| Problem | Fix |
|---|---|
| "Mic blocked" / no audio in | Check browser address bar → allow microphone for `localhost`. Chrome/Edge required. |
| Token fetch fails with 500 | `.env` missing keys. Confirm `LIVEKIT_URL/API_KEY/API_SECRET` are set. |
| Connects but agent never speaks | `agent.py dev` isn't running, or it's pointed at a different LiveKit project. |
| "Failed to connect to room" | `LIVEKIT_URL` is wrong (should be `wss://...livekit.cloud`, not `https://`). |
| Port 3000 in use | Change the port in `server.py` (last line) and reload. |
| No transcript appears | Agent build doesn't emit transcriptions — audio still works; check agent logs. |

## What's happening under the hood

1. Browser hits `/token` on the local FastAPI server.
2. Server signs a LiveKit JWT with your API key + secret.
3. Browser connects to the LiveKit room with that token, publishing mic.
4. `agent.py dev` is already subscribed to new rooms → joins automatically, plays TTS back into the room.
5. Browser subscribes to the agent's audio track and renders transcripts as they stream.
