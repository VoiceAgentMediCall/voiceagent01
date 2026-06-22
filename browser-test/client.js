// Browser test client for the MediCall LiveKit voice agent.
// Connects to a LiveKit room, publishes mic, subscribes to agent audio + transcripts.

const connectBtn = document.getElementById('connectBtn');
const disconnectBtn = document.getElementById('disconnectBtn');
const muteBtn = document.getElementById('muteBtn');
const statusEl = document.getElementById('status');
const transcriptEl = document.getElementById('transcript');

let room = null;
let micMuted = false;

function setStatus(text, color = 'text-slate-500') {
  statusEl.className = `ml-auto text-sm ${color}`;
  statusEl.textContent = text;
}

function clearTranscript() {
  transcriptEl.innerHTML = '';
}

function appendTurn(speaker, text, isFinal = true) {
  const id = `turn-${speaker}-${isFinal ? 'final' : 'interim'}`;
  let row = isFinal ? null : document.getElementById(id);
  if (!row) {
    row = document.createElement('div');
    if (!isFinal) row.id = id;
    row.className = 'flex gap-2';
    const tag = document.createElement('span');
    tag.className = speaker === 'agent'
      ? 'font-semibold text-emerald-700 shrink-0'
      : 'font-semibold text-sky-700 shrink-0';
    tag.textContent = speaker === 'agent' ? 'Agent:' : 'You:';
    const body = document.createElement('span');
    body.className = isFinal ? 'text-slate-800' : 'text-slate-500 italic';
    body.textContent = text;
    row.appendChild(tag);
    row.appendChild(body);
    transcriptEl.appendChild(row);
  } else {
    row.querySelector('span:last-child').textContent = text;
  }
  transcriptEl.scrollTop = transcriptEl.scrollHeight;
}

async function fetchToken(roomName, identity) {
  const url = `/token?room=${encodeURIComponent(roomName)}&identity=${encodeURIComponent(identity)}`;
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Token fetch failed: ${res.status} ${await res.text()}`);
  return res.json();
}

async function connect() {
  try {
    connectBtn.disabled = true;
    setStatus('Fetching token…');

    const roomName = `medicall-test-${Date.now()}`;
    const identity = `browser-user-${Math.floor(Math.random() * 10000)}`;
    const { token, url } = await fetchToken(roomName, identity);

    setStatus('Connecting…');
    clearTranscript();

    room = new LivekitClient.Room({
      adaptiveStream: true,
      dynacast: true,
    });

    room.on(LivekitClient.RoomEvent.TrackSubscribed, (track) => {
      if (track.kind === 'audio') {
        const audioEl = track.attach();
        audioEl.autoplay = true;
        document.body.appendChild(audioEl);
      }
    });

    room.on(LivekitClient.RoomEvent.TrackUnsubscribed, (track) => {
      track.detach().forEach((el) => el.remove());
    });

    room.on(LivekitClient.RoomEvent.TranscriptionReceived, (segments, participant) => {
      const isAgent = participant?.identity !== identity;
      segments.forEach((seg) => {
        appendTurn(isAgent ? 'agent' : 'user', seg.text, seg.final);
      });
    });

    room.on(LivekitClient.RoomEvent.Disconnected, () => {
      setStatus('Disconnected', 'text-slate-500');
      connectBtn.disabled = false;
      disconnectBtn.disabled = true;
      muteBtn.disabled = true;
    });

    await room.connect(url, token);
    await room.localParticipant.setMicrophoneEnabled(true);

    setStatus('Connected • Mic live', 'text-emerald-600');
    disconnectBtn.disabled = false;
    muteBtn.disabled = false;
    appendTurn('agent', '(connected — waiting for agent to greet you)', true);
  } catch (err) {
    console.error(err);
    setStatus(`Error: ${err.message}`, 'text-rose-600');
    connectBtn.disabled = false;
  }
}

async function disconnect() {
  if (room) {
    await room.disconnect();
    room = null;
  }
}

async function toggleMute() {
  if (!room) return;
  micMuted = !micMuted;
  await room.localParticipant.setMicrophoneEnabled(!micMuted);
  muteBtn.textContent = micMuted ? 'Unmute Mic' : 'Mute Mic';
  muteBtn.className = micMuted
    ? 'px-4 py-2 bg-amber-500 hover:bg-amber-600 text-white rounded-md font-medium transition'
    : 'px-4 py-2 bg-slate-200 hover:bg-slate-300 text-slate-800 rounded-md font-medium transition';
}

connectBtn.addEventListener('click', connect);
disconnectBtn.addEventListener('click', disconnect);
muteBtn.addEventListener('click', toggleMute);
