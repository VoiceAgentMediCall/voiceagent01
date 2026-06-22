import { createClient } from '@/lib/supabase/server'
import { NextResponse } from 'next/server'

type RouteContext = { params: Promise<{ id: string }> }

export async function GET(_req: Request, { params }: RouteContext) {
  const { id } = await params
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 })
  }

  const { data: prompt, error } = await supabase
    .from('prompts')
    .select('*')
    .eq('id', id)
    .maybeSingle()

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
  if (!prompt) {
    return NextResponse.json({ error: 'not found' }, { status: 404 })
  }

  let created_by_user: { id: string; email: string; display_name: string | null } | null = null
  if (prompt.created_by) {
    const { data: u } = await supabase
      .from('users')
      .select('id, email, display_name')
      .eq('id', prompt.created_by)
      .maybeSingle()
    created_by_user = u ?? null
  }

  return NextResponse.json({ ...prompt, created_by_user })
}
