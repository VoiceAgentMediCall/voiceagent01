import { Card } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { ExternalLink } from 'lucide-react'

export default function CostsPage() {
  const vendors = [
    {
      name: 'Twilio',
      role: 'PSTN outbound SIP',
      perCall: '$0.0496 / min',
      monthlyShape: 'Dominates cost line (~70% at pilot scale)',
    },
    {
      name: 'LiveKit Cloud',
      role: 'SFU + SIP gateway + agent host',
      perCall: '$0.005 / agent-min (50 free/mo)',
      monthlyShape: 'Free at pilot; $50/mo Ship tier at 5k+ calls',
    },
    {
      name: 'Sarvam',
      role: 'STT + TTS + LLM',
      perCall: '~₹0.65 / 30s call (Saaras + Bulbul)',
      monthlyShape: 'Pre-paid credits; LLM currently free at pilot tier',
    },
    {
      name: 'Supabase',
      role: 'Postgres + Auth + Realtime',
      perCall: '$0',
      monthlyShape: 'Free tier — pauses after 7 days idle (keep-warm cron in B22)',
    },
    {
      name: 'Railway',
      role: 'Next.js dashboard + Promptfoo runner host',
      perCall: '$0',
      monthlyShape: '$5 trial first 30 days, then $5/mo Hobby',
    },
    {
      name: 'Langfuse Cloud',
      role: 'Per-call observability',
      perCall: '$0',
      monthlyShape: 'Hobby tier covers ~50k events/mo; we use ~9%',
    },
  ]

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold">Costs</h1>
        <p className="text-sm text-muted-foreground mt-1">
          Per-vendor breakdown. Live cost rollup ships in Phase A — for now use Langfuse directly.
        </p>
      </div>

      <Card className="p-5">
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-sm font-semibold">Live per-call cost analytics</h2>
            <p className="text-xs text-muted-foreground mt-1">
              Langfuse aggregates STT + TTS + LLM spans per trace.
            </p>
          </div>
          <a
            href="https://cloud.langfuse.com"
            target="_blank"
            rel="noopener noreferrer"
            className="text-sm flex items-center gap-1.5 text-foreground hover:underline"
          >
            Open Langfuse <ExternalLink size={12} />
          </a>
        </div>
      </Card>

      <Card className="p-0">
        <div className="px-5 pt-5 pb-2">
          <h2 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">Vendor rate card</h2>
        </div>
        <div className="divide-y">
          {vendors.map((v) => (
            <div key={v.name} className="px-5 py-4 grid grid-cols-1 sm:grid-cols-4 gap-3 items-start">
              <div className="font-medium">{v.name}</div>
              <div className="text-sm text-muted-foreground">{v.role}</div>
              <div className="text-sm font-mono">{v.perCall}</div>
              <div className="text-xs text-muted-foreground">{v.monthlyShape}</div>
            </div>
          ))}
        </div>
      </Card>

      <Card className="p-5 border-dashed">
        <Badge variant="outline" className="mb-2">Phase A</Badge>
        <div className="text-sm">
          Live cost dashboard — sum Langfuse traces × Twilio call minutes per day, rollup by parent.
        </div>
      </Card>
    </div>
  )
}
