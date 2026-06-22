import { createClient } from '@/lib/supabase/server'
import { Card } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import Link from 'next/link'
import { Phone, FlaskConical, Settings2 } from 'lucide-react'

export const dynamic = 'force-dynamic'

export default async function HomePage() {
  const supabase = await createClient()

  // Today's call_logs (UTC midnight cutoff — good enough for pilot)
  const startOfDay = new Date()
  startOfDay.setUTCHours(0, 0, 0, 0)

  const [
    { data: todayCalls },
    { data: activePrompt },
    { data: lastEval },
    { data: lastCall },
  ] = await Promise.all([
    supabase
      .from('call_logs')
      .select('outcome')
      .gte('created_at', startOfDay.toISOString()),
    supabase
      .from('prompts')
      .select('version, created_at')
      .eq('is_active', true)
      .maybeSingle(),
    supabase
      .from('eval_runs')
      .select('status, scenarios_passed, scenarios_total, created_at')
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle(),
    supabase
      .from('call_logs')
      .select('outcome, outcome_source, phone, created_at, duration_sec')
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle(),
  ])

  const total = todayCalls?.length ?? 0
  const confirmed = todayCalls?.filter((c) => c.outcome === 'CONFIRMED').length ?? 0
  const escalated = todayCalls?.filter((c) => c.outcome === 'ESCALATED').length ?? 0
  const noAnswer = todayCalls?.filter((c) => c.outcome === 'NO_ANSWER').length ?? 0
  const rate = total > 0 ? Math.round((confirmed / total) * 100) : null

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold">Home</h1>
        <p className="text-sm text-muted-foreground mt-1">
          Pilot overview · {new Date().toLocaleDateString(undefined, { weekday: 'long', day: 'numeric', month: 'long' })}
        </p>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <Stat label="Calls today" value={total.toString()} />
        <Stat
          label="Confirmed rate"
          value={rate !== null ? `${rate}%` : '—'}
          hint={rate !== null ? `${confirmed} of ${total}` : 'No calls yet'}
        />
        <Stat
          label="Escalations today"
          value={escalated.toString()}
          hint={escalated > 0 ? 'Symptom or clarify loops' : 'None'}
          tone={escalated > 0 ? 'warn' : 'neutral'}
        />
        <Stat
          label="No answer"
          value={noAnswer.toString()}
          hint={total > 0 ? `${Math.round((noAnswer / total) * 100)}% of today` : '—'}
        />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <Card className="p-5">
          <div className="flex items-center justify-between">
            <h2 className="text-sm font-semibold uppercase text-muted-foreground tracking-wide">Active prompt</h2>
            <Link href="/admin" className="text-xs text-muted-foreground hover:text-foreground">
              <Settings2 size={12} className="inline mr-1" />Edit
            </Link>
          </div>
          {activePrompt ? (
            <div className="mt-3">
              <div className="text-2xl font-semibold">v{activePrompt.version}</div>
              <div className="text-xs text-muted-foreground mt-1">
                Saved {new Date(activePrompt.created_at).toLocaleString()}
              </div>
            </div>
          ) : (
            <div className="mt-3 text-sm text-muted-foreground">
              No active prompt yet. <Link className="underline" href="/admin">Bootstrap it</Link>.
            </div>
          )}
        </Card>

        <Card className="p-5">
          <div className="flex items-center justify-between">
            <h2 className="text-sm font-semibold uppercase text-muted-foreground tracking-wide">Latest eval</h2>
            <Link href="/evals" className="text-xs text-muted-foreground hover:text-foreground">
              <FlaskConical size={12} className="inline mr-1" />View runs
            </Link>
          </div>
          {lastEval ? (
            <div className="mt-3 flex items-center gap-3">
              <Badge className={evalBadge(lastEval.status)}>{lastEval.status}</Badge>
              <span className="text-sm">
                {lastEval.scenarios_passed ?? 0} / {lastEval.scenarios_total ?? '—'}
              </span>
              <span className="text-xs text-muted-foreground">
                {new Date(lastEval.created_at).toLocaleString()}
              </span>
            </div>
          ) : (
            <div className="mt-3 text-sm text-muted-foreground">
              No eval runs yet.
            </div>
          )}
        </Card>
      </div>

      <Card className="p-5">
        <div className="flex items-center justify-between">
          <h2 className="text-sm font-semibold uppercase text-muted-foreground tracking-wide">Last call</h2>
          <Link href="/calls" className="text-xs text-muted-foreground hover:text-foreground">
            <Phone size={12} className="inline mr-1" />All calls
          </Link>
        </div>
        {lastCall ? (
          <div className="mt-3 grid grid-cols-1 sm:grid-cols-4 gap-3 text-sm">
            <Field label="Phone"><span className="font-mono text-xs">{lastCall.phone}</span></Field>
            <Field label="Outcome"><Badge className={outcomeBadge(lastCall.outcome)}>{lastCall.outcome}</Badge></Field>
            <Field label="Source"><span className="text-xs text-muted-foreground">{lastCall.outcome_source ?? '—'}</span></Field>
            <Field label="When"><span className="text-xs text-muted-foreground">{new Date(lastCall.created_at).toLocaleString()}</span></Field>
          </div>
        ) : (
          <div className="mt-3 text-sm text-muted-foreground">
            No calls logged yet. The Promptfoo runner and a real call will populate this.
          </div>
        )}
      </Card>
    </div>
  )
}

function Stat({
  label, value, hint, tone = 'neutral',
}: { label: string; value: string; hint?: string; tone?: 'neutral' | 'warn' }) {
  return (
    <Card className="p-5">
      <div className="text-xs font-medium text-muted-foreground uppercase tracking-wide">{label}</div>
      <div className={`text-3xl font-semibold mt-2 ${tone === 'warn' ? 'text-amber-500' : ''}`}>{value}</div>
      {hint && <div className="text-xs text-muted-foreground mt-1.5">{hint}</div>}
    </Card>
  )
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <div className="text-xs text-muted-foreground mb-0.5">{label}</div>
      <div>{children}</div>
    </div>
  )
}

function outcomeBadge(outcome: string): string {
  switch (outcome) {
    case 'CONFIRMED': return 'bg-emerald-600 text-white'
    case 'DENIED': return 'bg-amber-600 text-white'
    case 'ESCALATED': return 'bg-red-600 text-white'
    case 'NO_ANSWER': return 'bg-zinc-500 text-white'
    case 'ERROR': return 'bg-red-800 text-white'
    default: return 'bg-zinc-400 text-white'
  }
}

function evalBadge(status: string): string {
  switch (status) {
    case 'queued': return 'bg-zinc-500 text-white'
    case 'running': return 'bg-blue-600 text-white'
    case 'passed': return 'bg-emerald-600 text-white'
    case 'failed': return 'bg-amber-600 text-white'
    case 'errored': return 'bg-red-700 text-white'
    default: return 'bg-zinc-400 text-white'
  }
}
