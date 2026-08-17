# Build context: REPO ROOT, not livekit/ — this service reads
# ../prompt-config/prompts.yaml relative to agent.py at runtime (see
# PROMPTS_YAML_PATH in agent.py), so the image mirrors the repo's layout
# (/app/livekit/ + /app/prompt-config/) instead of flattening everything
# into one directory, which would silently break that lookup.
#
# Build from repo root:
#   docker build -f livekit/Dockerfile -t medicall-agent .

FROM python:3.11-slim

ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1 \
    PIP_NO_CACHE_DIR=1

WORKDIR /app

# No system ffmpeg: unused (PyAV bundles its own) and its dep chain cost 420MB.
# If codecs are ever needed, add `libavcodec61 libavformat61`, not ffmpeg.
RUN apt-get update \
    && apt-get install -y --no-install-recommends \
        ca-certificates \
    && rm -rf /var/lib/apt/lists/*

COPY livekit/requirements.txt ./livekit/requirements.txt
RUN pip install --upgrade pip && pip install -r livekit/requirements.txt

COPY livekit/agent.py livekit/voicemail_detector.py ./livekit/
COPY prompt-config ./prompt-config

WORKDIR /app/livekit
ENTRYPOINT ["python", "agent.py", "start"]
