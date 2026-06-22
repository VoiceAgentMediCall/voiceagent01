import { createServiceClient } from '@/lib/supabase/service'
import { NextResponse } from 'next/server'

type TranscriptTurn = { role: string; text: string }

type WebhookPayload = {
  call_id?: string
  phone?: string
  parent_name?: string
  drug_name?: string
  outcome?: string
  outcome_source?: string
  reason?: string | null
  transcript?: TranscriptTurn[] | null
  duration_sec?: number | null
  prompt_version?: number | null
  langfuse_trace_id?: string | null
  started_at?: string | null
  ended_at?: string | null
}

const VALID_OUTCOMES = new Set([
  'CONFIRMED',
  'DENIED',
  'ESCALATED',
  'NO_ANSWER',
  'ERROR',
])

const VALID_SOURCES = new Set([
  'tool_call',
  'json_trailer',
  'keyword_match',
  'watchdog',
  'voicemail_detector',
])

export async function POST(req: Request) {
  let payload: WebhookPayload
  try {
    payload = (await req.json()) as WebhookPayload
  } catch {
    return NextResponse.json({ error: 'invalid JSON' }, { status: 400 })
  }

  // Minimal contract validation
  if (!payload.call_id || typeof payload.call_id !== 'string') {
    return NextResponse.json({ error: 'call_id is required' }, { status: 400 })
  }
  if (!payload.phone || typeof payload.phone !== 'string') {
    return NextResponse.json({ error: 'phone is required' }, { status: 400 })
  }
  if (!payload.outcome || !VALID_OUTCOMES.has(payload.outcome)) {
    return NextResponse.json(
      {
        error: `outcome must be one of ${[...VALID_OUTCOMES].join(', ')}`,
      },
      { status: 400 },
    )
  }

  const supabase = createServiceClient()

  // Best-effort parent_id resolution from phone
  let parentId: string | null = null
  try {
    const { data: parent } = await supabase
      .from('parents')
      .select('id')
      .eq('phone', payload.phone)
      .maybeSingle()
    parentId = parent?.id ?? null
  } catch {
    // Non-fatal — proceed without parent_id
  }

  const row = {
    call_id: payload.call_id,
    parent_id: parentId,
    phone: payload.phone,
    outcome: payload.outcome,
    outcome_source:
      payload.outcome_source && VALID_SOURCES.has(payload.outcome_source)
        ? payload.outcome_source
        : null,
    reason: payload.reason ?? null,
    transcript: Array.isArray(payload.transcript) ? payload.transcript : null,
    duration_sec:
      typeof payload.duration_sec === 'number' ? payload.duration_sec : null,
    prompt_version:
      typeof payload.prompt_version === 'number' ? payload.prompt_version : null,
    stack: 'livekit' as const,
    raw_payload: payload,
    langfuse_trace_id: payload.langfuse_trace_id ?? null,
    started_at: payload.started_at ?? null,
    ended_at: payload.ended_at ?? null,
  }

  const { data, error } = await supabase
    .from('call_logs')
    .upsert(row, { onConflict: 'call_id' })
    .select('id')
    .single()

  if (error) {
    console.error('webhook upsert failed', { call_id: payload.call_id, error })
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  return NextResponse.json({ ok: true, id: data.id })
}
