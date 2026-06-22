import { createClient } from '@/lib/supabase/server'
import { requireRole } from '@/lib/auth'
import { NextResponse } from 'next/server'
import type { SupabaseClient } from '@supabase/supabase-js'

type Ctx = { params: Promise<{ id: string }> }

async function countAdmins(supabase: SupabaseClient): Promise<number> {
  const { count } = await supabase
    .from('users')
    .select('id', { count: 'exact', head: true })
    .eq('role', 'admin')
  return count ?? 0
}

export async function PATCH(req: Request, { params }: Ctx) {
  const auth = await requireRole('admin')
  if (!auth.ok) return auth.response

  const { id: targetUserId } = await params
  const body = await req.json()
  const newRole = body.role

  if (!['admin', 'editor', 'viewer'].includes(newRole)) {
    return NextResponse.json(
      { error: 'role must be admin, editor, or viewer' },
      { status: 400 }
    )
  }

  const supabase = await createClient()

  const { data: targetUser, error: findErr } = await supabase
    .from('users')
    .select('id, email, role, is_master')
    .eq('id', targetUserId)
    .maybeSingle()

  if (findErr || !targetUser) {
    return NextResponse.json({ error: 'user not found' }, { status: 404 })
  }

  // Master-admin guard
  if (targetUser.is_master && newRole !== 'admin') {
    return NextResponse.json(
      { error: 'Master admin cannot be demoted — modify is_master via SQL Editor first.' },
      { status: 409 }
    )
  }

  // Last-admin guard
  if (targetUser.role === 'admin' && newRole !== 'admin') {
    const adminCount = await countAdmins(supabase)
    if (adminCount <= 1) {
      return NextResponse.json(
        { error: "You're the only admin — promote someone else first." },
        { status: 409 }
      )
    }
  }

  // No-op if role isn't changing
  if (targetUser.role === newRole) {
    return NextResponse.json({ ok: true, noop: true })
  }

  const previousRole = targetUser.role
  const { error: updateErr } = await supabase
    .from('users')
    .update({ role: newRole })
    .eq('id', targetUserId)

  if (updateErr) {
    return NextResponse.json({ error: updateErr.message }, { status: 500 })
  }

  await supabase.from('audit_log').insert({
    action: 'user_role_changed',
    actor_user_id: auth.userId,
    target_email: targetUser.email,
    target_user_id: targetUserId,
    previous_role: previousRole,
    new_role: newRole,
  })

  return NextResponse.json({ ok: true })
}

export async function DELETE(_req: Request, { params }: Ctx) {
  const auth = await requireRole('admin')
  if (!auth.ok) return auth.response

  const { id: targetUserId } = await params
  const supabase = await createClient()

  const { data: targetUser } = await supabase
    .from('users')
    .select('id, email, role, is_master')
    .eq('id', targetUserId)
    .maybeSingle()

  if (!targetUser) {
    return NextResponse.json({ error: 'user not found' }, { status: 404 })
  }

  // Master-admin guard — masters cannot be removed via this API
  if (targetUser.is_master) {
    return NextResponse.json(
      { error: 'Master admin cannot be removed — modify is_master via SQL Editor first.' },
      { status: 409 }
    )
  }

  // Last-admin guard
  if (targetUser.role === 'admin') {
    const adminCount = await countAdmins(supabase)
    if (adminCount <= 1) {
      return NextResponse.json(
        { error: "You're the only admin — promote someone else first." },
        { status: 409 }
      )
    }
  }

  // Delete from public.users (auth.users stays — Supabase service-role required for that;
  // app-layer delete is sufficient for cutting access since middleware reads public.users).
  const { error: delErr } = await supabase.from('users').delete().eq('id', targetUserId)
  if (delErr) {
    return NextResponse.json({ error: delErr.message }, { status: 500 })
  }

  await supabase.from('audit_log').insert({
    action: 'user_removed',
    actor_user_id: auth.userId,
    target_email: targetUser.email,
    target_user_id: targetUserId,
    previous_role: targetUser.role,
  })

  return NextResponse.json({ ok: true })
}
