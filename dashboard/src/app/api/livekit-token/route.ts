import { AccessToken } from 'livekit-server-sdk'
import { requireRole } from '@/lib/auth'
import { NextResponse } from 'next/server'

export async function GET(req: Request) {
  const auth = await requireRole('admin', 'editor')
  if (!auth.ok) return auth.response

  const url = new URL(req.url)
  const room = url.searchParams.get('room') ?? `medicall-test-${Date.now()}`
  const identity =
    url.searchParams.get('identity') ?? auth.email ?? `browser-${auth.userId.slice(0, 8)}`

  // Defense in depth: require the room name to start with 'medicall-' so this
  // token can't be used to join unrelated rooms.
  if (!room.startsWith('medicall-')) {
    return NextResponse.json(
      { error: 'room must start with medicall-' },
      { status: 400 },
    )
  }

  const apiKey = process.env.LIVEKIT_API_KEY
  const apiSecret = process.env.LIVEKIT_API_SECRET
  const livekitUrl = process.env.LIVEKIT_URL
  if (!apiKey || !apiSecret || !livekitUrl) {
    return NextResponse.json(
      { error: 'LiveKit env vars missing (LIVEKIT_URL/KEY/SECRET)' },
      { status: 500 },
    )
  }

  const at = new AccessToken(apiKey, apiSecret, { identity, ttl: '15m' })
  at.addGrant({
    room,
    roomJoin: true,
    canPublish: true,
    canSubscribe: true,
    canPublishData: true,
  })

  const token = await at.toJwt()
  return NextResponse.json({
    token,
    url: livekitUrl,
    room,
    identity,
  })
}
