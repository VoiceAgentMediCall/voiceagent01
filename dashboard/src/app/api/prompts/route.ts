import { createClient } from '@/lib/supabase/server'
import { requireRole } from '@/lib/auth'
import { NextResponse } from 'next/server'

export async function GET() {
  const supabase = await createClient()
  const { data, error } = await supabase
    .from('prompts')
    .select('*')
    .eq('is_active', true)
    .maybeSingle()

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
  return NextResponse.json(data) // null if no active prompt yet
}

export async function POST(req: Request) {
  const auth = await requireRole('admin', 'editor')
  if (!auth.ok) return auth.response
  const supabase = await createClient()

  const body = await req.json()
  const { system_prompt, first_message, variables, notes } = body

  if (typeof system_prompt !== 'string' || typeof first_message !== 'string') {
    return NextResponse.json(
      { error: 'system_prompt and first_message are required strings' },
      { status: 400 }
    )
  }

  // Compute next version
  const { data: latest } = await supabase
    .from('prompts')
    .select('version')
    .order('version', { ascending: false })
    .limit(1)
    .maybeSingle()

  const nextVersion = (latest?.version ?? 0) + 1

  // Deactivate the current active row (if any) to preserve single-active invariant
  await supabase.from('prompts').update({ is_active: false }).eq('is_active', true)

  // Insert new active row
  const { data, error } = await supabase
    .from('prompts')
    .insert({
      version: nextVersion,
      system_prompt,
      first_message,
      variables: variables ?? {},
      notes: notes ?? null,
      is_active: true,
      created_by: auth.userId,
    })
    .select()
    .single()

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
  return NextResponse.json(data)
}
