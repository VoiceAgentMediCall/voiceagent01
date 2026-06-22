import { createClient } from '@/lib/supabase/server'
import { requireRole } from '@/lib/auth'
import { NextResponse } from 'next/server'

const E164 = /^\+[1-9]\d{6,14}$/

type RouteContext = { params: Promise<{ id: string }> }

export async function PATCH(req: Request, { params }: RouteContext) {
  const { id } = await params
  const auth = await requireRole('admin', 'editor')
  if (!auth.ok) return auth.response
  const supabase = await createClient()

  const body = await req.json()
  const updates: Record<string, unknown> = {}

  if (typeof body.name === 'string') updates.name = body.name.trim()
  if (typeof body.phone === 'string') {
    if (!E164.test(body.phone)) {
      return NextResponse.json({ error: 'phone must be E.164' }, { status: 400 })
    }
    updates.phone = body.phone
  }
  if (typeof body.drug_name === 'string') updates.drug_name = body.drug_name.trim()
  if (body.scheduled_time !== undefined) updates.scheduled_time = body.scheduled_time || null
  if (body.caregiver_email !== undefined) updates.caregiver_email = body.caregiver_email || null
  if (typeof body.active === 'boolean') updates.active = body.active

  if (Object.keys(updates).length === 0) {
    return NextResponse.json({ error: 'no updates provided' }, { status: 400 })
  }

  const { data, error } = await supabase
    .from('parents')
    .update(updates)
    .eq('id', id)
    .select()
    .single()

  if (error) {
    if (error.code === '23505') {
      return NextResponse.json({ error: 'phone conflict' }, { status: 409 })
    }
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
  return NextResponse.json(data)
}

export async function DELETE(_req: Request, { params }: RouteContext) {
  const { id } = await params
  const auth = await requireRole('admin', 'editor')
  if (!auth.ok) return auth.response
  const supabase = await createClient()

  const { error } = await supabase.from('parents').delete().eq('id', id)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ ok: true })
}
