"""Local token + static server for the MediCall browser test client.

Serves:
  GET /           -> index.html
  GET /client.js  -> client.js
  GET /token      -> {"token": "...", "url": "wss://..."}

Run: python server.py
Open: http://localhost:3000
"""

import os
from pathlib import Path

from dotenv import load_dotenv
from fastapi import FastAPI, HTTPException, Query
from fastapi.responses import FileResponse, JSONResponse
from livekit import api

# Load .env from this directory, then fall back to parent (voiceagent/).
HERE = Path(__file__).resolve().parent
load_dotenv(HERE / ".env")
load_dotenv(HERE.parent / ".env")

LIVEKIT_API_KEY = os.getenv("LIVEKIT_API_KEY")
LIVEKIT_API_SECRET = os.getenv("LIVEKIT_API_SECRET")
LIVEKIT_URL = os.getenv("LIVEKIT_URL")

app = FastAPI(title="MediCall Browser Client")


@app.get("/")
def index():
    return FileResponse(HERE / "index.html")


@app.get("/client.js")
def client_js():
    return FileResponse(HERE / "client.js", media_type="application/javascript")


@app.get("/token")
def token(room: str = Query(...), identity: str = Query(...)):
    if not (LIVEKIT_API_KEY and LIVEKIT_API_SECRET and LIVEKIT_URL):
        raise HTTPException(
            status_code=500,
            detail="LIVEKIT_API_KEY, LIVEKIT_API_SECRET, and LIVEKIT_URL must be set in .env",
        )
    jwt = (
        api.AccessToken(LIVEKIT_API_KEY, LIVEKIT_API_SECRET)
        .with_identity(identity)
        .with_name(identity)
        .with_grants(
            api.VideoGrants(
                room_join=True,
                room=room,
                can_publish=True,
                can_subscribe=True,
                can_publish_data=True,
            )
        )
        .to_jwt()
    )
    return JSONResponse({"token": jwt, "url": LIVEKIT_URL})


if __name__ == "__main__":
    import uvicorn

    print("MediCall browser client -> http://localhost:3000")
    print("Make sure agent.py is running in another terminal: python agent.py dev")
    uvicorn.run(app, host="0.0.0.0", port=3000, log_level="info")
