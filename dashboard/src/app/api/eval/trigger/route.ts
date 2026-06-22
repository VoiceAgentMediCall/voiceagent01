import { createClient } from '@/lib/supabase/server'
import { NextResponse } from 'next/server'

export async function POST() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 })
  }

  // Snapshot the currently active prompt version into the run
  const { data: activePrompt } = await supabase
    .from('prompts')
    .select('version')
    .eq('is_active', true)
    .maybeSingle()

  const { data, error } = await supabase
    .from('eval_runs')
    .insert({
      triggered_by: user.id,
      prompt_version: activePrompt?.version ?? null,
      status: 'queued',
    })
    .select()
    .single()

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
  // The eval_runs_notify trigger fires NOTIFY on the eval_runs_queue channel.
  // The promptfoo-runner service (B19, deploys later) will pick this up.
  return NextResponse.json(data)
}
