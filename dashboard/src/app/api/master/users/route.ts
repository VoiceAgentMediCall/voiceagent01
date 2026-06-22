import { createClient } from '@/lib/supabase/server'
import { requireRole } from '@/lib/auth'
import { NextResponse } from 'next/server'

export async function GET() {
  const auth = await requireRole('admin')
  if (!auth.ok) return auth.response

  const supabase = await createClient()

  const { data: users, error: usersErr } = await supabase
    .from('users')
    .select('id, email, display_name, role, is_master, created_at')
    .order('created_at', { ascending: true })

  if (usersErr) {
    return NextResponse.json({ error: usersErr.message }, { status: 500 })
  }

  // Pull consumed invites (one per user) to surface invited_by + invited_at
  const { data: invites } = await supabase
    .from('allowed_emails')
    .select('email, invited_by, invited_at, consumed_user_id')

  const inviteByUserId = new Map(
    (invites ?? [])
      .filter((i) => i.consumed_user_id)
      .map((i) => [i.consumed_user_id as string, i])
  )

  // Resolve invited_by → user display_name + email
  const inviterIds = [
    ...new Set(
      (invites ?? [])
        .map((i) => i.invited_by)
        .filter((v): v is string => Boolean(v))
    ),
  ]

  let inviterMap = new Map<string, { id: string; email: string; display_name: string | null }>()
  if (inviterIds.length > 0) {
    const { data: inviters } = await supabase
      .from('users')
      .select('id, email, display_name')
      .in('id', inviterIds)
    inviterMap = new Map((inviters ?? []).map((u) => [u.id, u]))
  }

  const rows = (users ?? []).map((u) => {
    const invite = inviteByUserId.get(u.id)
    const inviter = invite?.invited_by ? inviterMap.get(invite.invited_by) : null
    return {
      ...u,
      invited_at: invite?.invited_at ?? null,
      invited_by: inviter
        ? { id: inviter.id, email: inviter.email, display_name: inviter.display_name }
        : null,
    }
  })

  return NextResponse.json(rows)
}
