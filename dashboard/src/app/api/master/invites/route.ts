import { createClient } from '@/lib/supabase/server'
import { requireRole } from '@/lib/auth'
import { NextResponse } from 'next/server'

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

export async function GET() {
  const auth = await requireRole('admin')
  if (!auth.ok) return auth.response

  const supabase = await createClient()

  // Pending invites = unconsumed
  const { data: invites, error: invitesErr } = await supabase
    .from('allowed_emails')
    .select('id, email, role, invited_by, invited_at, consumed_at, notes')
    .is('consumed_at', null)
    .order('invited_at', { ascending: false })

  if (invitesErr) {
    return NextResponse.json({ error: invitesErr.message }, { status: 500 })
  }

  // Resolve invited_by to {id, email, display_name}
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

  const enriched = (invites ?? []).map((inv) => ({
    ...inv,
    invited_by_user: inv.invited_by ? inviterMap.get(inv.invited_by) ?? null : null,
  }))

  return NextResponse.json(enriched)
}

export async function POST(req: Request) {
  const auth = await requireRole('admin')
  if (!auth.ok) return auth.response

  const body = await req.json()
  const email = String(body.email ?? '').trim().toLowerCase()
  const role = body.role
  const notes = body.notes ? String(body.notes) : null

  if (!EMAIL_RE.test(email)) {
    return NextResponse.json({ error: 'invalid email format' }, { status: 400 })
  }
  if (!['admin', 'editor', 'viewer'].includes(role)) {
    return NextResponse.json({ error: 'role must be admin, editor, or viewer' }, { status: 400 })
  }

  const supabase = await createClient()
  const { data, error } = await supabase
    .from('allowed_emails')
    .insert({ email, role, notes, invited_by: auth.userId })
    .select()
    .single()

  if (error) {
    if (error.code === '23505') {
      return NextResponse.json(
        { error: 'This email is already invited or already a member.' },
        { status: 409 }
      )
    }
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  // Audit log
  await supabase.from('audit_log').insert({
    action: 'invite_added',
    actor_user_id: auth.userId,
    target_email: email,
    new_role: role,
    notes,
  })

  return NextResponse.json(data)
}
