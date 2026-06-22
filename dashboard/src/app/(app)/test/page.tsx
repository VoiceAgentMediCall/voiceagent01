'use client'

import { useMemo, useState } from 'react'
import {
  LiveKitRoom,
  RoomAudioRenderer,
  StartAudio,
  useTracks,
  useConnectionState,
  useVoiceAssistant,
  useTrackTranscription,
  useLocalParticipant,
  ControlBar,
} from '@livekit/components-react'
import '@livekit/components-styles'
import { Track, ConnectionState } from 'livekit-client'
import type { ReceivedTranscriptionSegment } from '@livekit/components-core'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { toast } from 'sonner'
import { Phone, PhoneOff, Mic } from 'lucide-react'

type TokenResponse = { token: string; url: string; room: string; identity: string }

export default function TestPage() {
  const [conn, setConn] = useState<TokenResponse | null>(null)
  const [connecting, setConnecting] = useState(false)

  const connect = async () => {
    setConnecting(true)
    try {
      const res = await fetch('/api/livekit-token')
      if (!res.ok) {
        const err = await res.json().catch(() => ({}))
        throw new Error(err.error ?? `HTTP ${res.status}`)
      }
      const data: TokenResponse = await res.json()
      setConn(data)
    } catch (e) {
      toast.error(`Failed to mint token: ${e instanceof Error ? e.message : 'unknown'}`)
    } finally {
      setConnecting(false)
    }
  }

  const disconnect = () => {
    setConn(null)
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold">Browser Test</h1>
          <p className="text-sm text-muted-foreground mt-1">
            Talk to the live agent over WebRTC. No phone, no Twilio cost.
            Make sure <code className="px-1 rounded bg-muted text-xs">python agent.py dev</code> is running locally.
          </p>
        </div>
        {!conn ? (
          <Button onClick={connect} disabled={connecting}>
            <Phone size={14} className="mr-1.5" />
            {connecting ? 'Connecting…' : 'Connect to agent'}
          </Button>
        ) : (
          <Button variant="destructive" onClick={disconnect}>
            <PhoneOff size={14} className="mr-1.5" />
            Disconnect
          </Button>
        )}
      </div>

      {!conn ? (
        <Card className="p-8 text-center text-sm text-muted-foreground">
          Not connected. Click <span className="font-medium text-foreground">Connect to agent</span> above to start a session.
        </Card>
      ) : (
        <Card className="p-0 overflow-hidden">
          <LiveKitRoom
            token={conn.token}
            serverUrl={conn.url}
            connect={true}
            audio={true}
            video={false}
            onDisconnected={disconnect}
            onError={(e) => toast.error(`LiveKit error: ${e.message}`)}
            className="bg-zinc-950 text-zinc-100"
            data-lk-theme="default"
          >
            <RoomActiveView identity={conn.identity} room={conn.room} />
            <RoomAudioRenderer />
            <StartAudio label="Click to enable audio" />
          </LiveKitRoom>
        </Card>
      )}
    </div>
  )
}

function RoomActiveView({ identity, room }: { identity: string; room: string }) {
  const state = useConnectionState()
  const tracks = useTracks([
    { source: Track.Source.Microphone, withPlaceholder: true },
  ])

  const stateLabel: Record<ConnectionState, { label: string; cls: string }> = {
    [ConnectionState.Disconnected]: { label: 'Disconnected', cls: 'bg-zinc-600' },
    [ConnectionState.Connecting]: { label: 'Connecting…', cls: 'bg-amber-600' },
    [ConnectionState.Connected]: { label: 'Connected', cls: 'bg-emerald-600' },
    [ConnectionState.Reconnecting]: { label: 'Reconnecting…', cls: 'bg-amber-600' },
    [ConnectionState.SignalReconnecting]: { label: 'Reconnecting signal…', cls: 'bg-amber-600' },
  }
  const indicator = stateLabel[state] ?? { label: state, cls: 'bg-zinc-600' }

  return (
    <div className="p-5 space-y-4">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2 text-sm">
          <Badge className={`${indicator.cls} text-white`}>{indicator.label}</Badge>
          <span className="text-zinc-400 text-xs">Room: <span className="font-mono">{room}</span></span>
          <span className="text-zinc-400 text-xs">As: <span className="font-mono">{identity}</span></span>
        </div>
        <div className="flex items-center gap-1.5 text-xs text-zinc-400">
          <Mic size={12} />
          {tracks.length > 0 ? `${tracks.length} track(s)` : 'no tracks yet'}
        </div>
      </div>

      <div className="border border-zinc-800 rounded-md">
        <ControlBar
          variation="minimal"
          controls={{ microphone: true, camera: false, screenShare: false, leave: false }}
        />
      </div>

      <TranscriptPanel />

      <p className="text-xs text-zinc-500">
        Speak in Hindi. The agent should greet you and ask about your medication.
        Transcript below is best-effort — the agent worker terminal is still the source of truth.
      </p>
    </div>
  )
}

type TranscriptLine = {
  id: string
  role: 'agent' | 'you'
  text: string
  ts: number
  final: boolean
}

function TranscriptPanel() {
  const { agentTranscriptions } = useVoiceAssistant()
  const { localParticipant } = useLocalParticipant()
  const micRef = useMemo(() => {
    const pub = localParticipant?.getTrackPublication(Track.Source.Microphone)
    if (!pub || !localParticipant) return undefined
    return {
      participant: localParticipant,
      publication: pub,
      source: Track.Source.Microphone,
    }
  }, [localParticipant])
  const { segments: userSegments } = useTrackTranscription(micRef)

  const lines = useMemo<TranscriptLine[]>(() => {
    const toLine = (
      role: 'agent' | 'you',
      seg: ReceivedTranscriptionSegment,
    ): TranscriptLine => ({
      id: `${role}-${seg.id}`,
      role,
      text: seg.text,
      ts: seg.receivedAt ?? seg.firstReceivedTime ?? 0,
      final: seg.final,
    })
    const merged = [
      ...(agentTranscriptions ?? []).map((s) => toLine('agent', s)),
      ...(userSegments ?? []).map((s) => toLine('you', s)),
    ]
    return merged.sort((a, b) => a.ts - b.ts)
  }, [agentTranscriptions, userSegments])

  return (
    <div className="border border-zinc-800 rounded-md bg-zinc-900/40">
      <div className="px-3 py-2 border-b border-zinc-800 text-xs uppercase tracking-wider text-zinc-500">
        Live transcript
      </div>
      <div className="max-h-72 overflow-y-auto p-3 space-y-2 text-sm">
        {lines.length === 0 ? (
          <div className="text-xs text-zinc-500">Waiting for speech…</div>
        ) : (
          lines.map((l) => (
            <div key={l.id} className="flex gap-2">
              <span
                className={
                  l.role === 'agent'
                    ? 'text-emerald-400 text-xs font-semibold uppercase shrink-0 mt-0.5'
                    : 'text-sky-400 text-xs font-semibold uppercase shrink-0 mt-0.5'
                }
              >
                {l.role === 'agent' ? 'Agent' : 'You'}
              </span>
              <span className={l.final ? 'text-zinc-100' : 'text-zinc-400 italic'}>
                {l.text}
              </span>
            </div>
          ))
        )}
      </div>
    </div>
  )
}
