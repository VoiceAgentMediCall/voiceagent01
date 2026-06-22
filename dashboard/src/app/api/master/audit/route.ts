import { createClient } from '@/lib/supabase/server'
import { requireRole } from '@/lib/auth'
import { NextResponse } from 'next/server'

export async function GET(req: Request) {
  const auth = await requireRole('admin')
  if (!auth.ok) return auth.response

  const url = new URL(req.url)
  const rawLimit = url.searchParams.get('limit') ?? '100'
  const limit = Math.min(Math.max(parseInt(rawLimit, 10) || 100, 1), 500)

  const supabase = await createClient()

  const { data: entries, error } = await supabase
    .from('audit_log')
    .select('*')
    .order('created_at', { ascending: false })
    .limit(limit)

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  // Resolve actor_user_id → {id, email, display_name}
  const actorIds = [
    ...new Set(
      (entries ?? [])
        .map((e) => e.actor_user_id)
        .filter((v): v is string => Boolean(v))
    ),
  ]

  let actorMap = new Map<string, { id: string; email: string; display_name: string | null }>()
  if (actorIds.length > 0) {
    const { data: actors } = await supabase
      .from('users')
      .select('id, email, display_name')
      .in('id', actorIds)
    actorMap = new Map((actors ?? []).map((u) => [u.id, u]))
  }

  const enriched = (entries ?? []).map((e) => ({
    ...e,
    actor: e.actor_user_id ? actorMap.get(e.actor_user_id) ?? null : null,
  }))

  return NextResponse.json(enriched)
}
