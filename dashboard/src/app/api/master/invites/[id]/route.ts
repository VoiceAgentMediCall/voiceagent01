import { createClient } from '@/lib/supabase/server'
import { requireRole } from '@/lib/auth'
import { NextResponse } from 'next/server'

type Ctx = { params: Promise<{ id: string }> }

export async function DELETE(_req: Request, { params }: Ctx) {
  const auth = await requireRole('admin')
  if (!auth.ok) return auth.response

  const { id } = await params
  const supabase = await createClient()

  // Only delete if not yet consumed
  const { data: invite, error: findErr } = await supabase
    .from('allowed_emails')
    .select('email, role, consumed_at')
    .eq('id', id)
    .maybeSingle()

  if (findErr || !invite) {
    return NextResponse.json({ error: 'invite not found' }, { status: 404 })
  }
  if (invite.consumed_at) {
    return NextResponse.json(
      { error: 'invite already consumed — remove the user instead' },
      { status: 409 }
    )
  }

  const { error } = await supabase.from('allowed_emails').delete().eq('id', id)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  await supabase.from('audit_log').insert({
    action: 'invite_removed',
    actor_user_id: auth.userId,
    target_email: invite.email,
    previous_role: invite.role,
  })

  return NextResponse.json({ ok: true })
}
