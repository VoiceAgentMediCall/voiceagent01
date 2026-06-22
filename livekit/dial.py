"""Place an outbound SIP call from LiveKit to a PSTN number via Twilio.

Usage:
    python dial.py                        # dials PHONE from .env (default: +918104348262)
    python dial.py +919999999999          # dials a specific E.164 number
"""
from __future__ import annotations

import asyncio
import os
import sys
import time

from dotenv import load_dotenv
from livekit import api

load_dotenv()


async def main() -> None:
    to_number = sys.argv[1] if len(sys.argv) > 1 else os.getenv("PHONE", "+918104348262")
    trunk_id = os.getenv("SIP_TRUNK_ID", "")

    if not trunk_id:
        print("ERROR: SIP_TRUNK_ID not set in .env")
        sys.exit(1)

    room = f"medicall-live-{int(time.time())}"
    print(f"Placing call:")
    print(f"  to:        {to_number}")
    print(f"  trunk:     {trunk_id}")
    print(f"  room:      {room}")
    print(f"  livekit:   {os.getenv('LIVEKIT_URL')}")
    print()
    print("Your phone should ring within 10 seconds...")
    print()

    lkapi = api.LiveKitAPI()
    try:
        resp = await lkapi.sip.create_sip_participant(
            api.CreateSIPParticipantRequest(
                sip_trunk_id=trunk_id,
                sip_call_to=to_number,
                room_name=room,
                participant_identity="caller-shubh",
                participant_name="MediCall",
            )
        )
        print("SIP participant created:")
        print(f"  participant_id:  {resp.participant_id}")
        print(f"  sip_call_id:     {resp.sip_call_id}")
        print(f"  participant:     {resp.participant_identity}")
    finally:
        await lkapi.aclose()


if __name__ == "__main__":
    asyncio.run(main())
