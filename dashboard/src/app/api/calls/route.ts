import { createClient } from '@/lib/supabase/server'
import { NextResponse } from 'next/server'

const VALID_OUTCOMES = new Set([
  'CONFIRMED', 'DENIED', 'ESCALATED', 'NO_ANSWER', 'ERROR',
])

export async function GET(req: Request) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 })
  }

  const url = new URL(req.url)
  const rawLimit = url.searchParams.get('limit') ?? '50'
  const limit = Math.min(Math.max(parseInt(rawLimit, 10) || 50, 1), 500)
  const outcome = url.searchParams.get('outcome')

  let q = supabase
    .from('call_logs')
    .select('*')
    .order('created_at', { ascending: false })
    .limit(limit)

  if (outcome && VALID_OUTCOMES.has(outcome)) {
    q = q.eq('outcome', outcome)
  }

  const { data, error } = await q
  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
  return NextResponse.json(data)
}
