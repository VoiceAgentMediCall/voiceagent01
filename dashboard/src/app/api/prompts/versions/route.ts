import { createClient } from '@/lib/supabase/server'
import { NextResponse } from 'next/server'

export async function GET() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 })
  }

  // First, fetch version summaries
  const { data: versions, error: versionsError } = await supabase
    .from('prompts')
    .select('id, version, is_active, notes, created_at, created_by')
    .order('version', { ascending: false })

  if (versionsError) {
    return NextResponse.json({ error: versionsError.message }, { status: 500 })
  }

  if (!versions || versions.length === 0) {
    return NextResponse.json([])
  }

  // Collect distinct created_by ids
  const userIds = Array.from(
    new Set(
      versions
        .map((v) => v.created_by)
        .filter((id): id is string => typeof id === 'string' && id.length > 0)
    )
  )

  let userMap = new Map<string, { id: string; email: string; display_name: string | null }>()
  if (userIds.length > 0) {
    const { data: users, error: usersError } = await supabase
      .from('users')
      .select('id, email, display_name')
      .in('id', userIds)

    if (usersError) {
      // Non-fatal: return versions without user info rather than 500-ing
      return NextResponse.json(
        versions.map((v) => ({
          id: v.id,
          version: v.version,
          is_active: v.is_active,
          notes: v.notes,
          created_at: v.created_at,
          created_by_user: null,
        }))
      )
    }
    userMap = new Map(users?.map((u) => [u.id, u]) ?? [])
  }

  const result = versions.map((v) => ({
    id: v.id,
    version: v.version,
    is_active: v.is_active,
    notes: v.notes,
    created_at: v.created_at,
    created_by_user: v.created_by ? userMap.get(v.created_by) ?? null : null,
  }))

  return NextResponse.json(result)
}
