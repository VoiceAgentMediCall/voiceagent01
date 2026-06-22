import { createClient } from '@/lib/supabase/server'
import { NextResponse } from 'next/server'

const E164 = /^\+[1-9]\d{6,14}$/

export async function GET() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'unauthorized' }, { status: 401 })

  const { data, error } = await supabase
    .from('parents')
    .select('*')
    .order('name', { ascending: true })

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json(data)
}

export async function POST(req: Request) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'unauthorized' }, { status: 401 })

  const body = await req.json()
  const { name, phone, drug_name, scheduled_time, caregiver_email, active } = body

  if (typeof name !== 'string' || !name.trim()) {
    return NextResponse.json({ error: 'name is required' }, { status: 400 })
  }
  if (typeof phone !== 'string' || !E164.test(phone)) {
    return NextResponse.json({ error: 'phone must be E.164 (e.g., +918104348262)' }, { status: 400 })
  }
  if (typeof drug_name !== 'string' || !drug_name.trim()) {
    return NextResponse.json({ error: 'drug_name is required' }, { status: 400 })
  }

  const { data, error } = await supabase
    .from('parents')
    .insert({
      name: name.trim(),
      phone,
      drug_name: drug_name.trim(),
      scheduled_time: scheduled_time || null,
      caregiver_email: caregiver_email || null,
      active: active ?? true,
    })
    .select()
    .single()

  if (error) {
    if (error.code === '23505') {
      return NextResponse.json({ error: 'A parent with this phone already exists.' }, { status: 409 })
    }
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
  return NextResponse.json(data)
}
