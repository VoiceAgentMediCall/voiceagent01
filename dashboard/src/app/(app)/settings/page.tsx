import { createClient } from '@/lib/supabase/server'
import { Card } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'

export const dynamic = 'force-dynamic'

export default async function SettingsPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold">Settings</h1>
        <p className="text-sm text-muted-foreground mt-1">
          Your account, integrations, and Phase-A surfaces.
        </p>
      </div>

      <Card className="p-5">
        <h2 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">Signed in as</h2>
        <div className="mt-3 space-y-1">
          <div className="text-sm font-medium">{user?.email}</div>
          <div className="text-xs text-muted-foreground font-mono">{user?.id}</div>
        </div>
      </Card>

      <Card className="p-5">
        <h2 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">Integrations</h2>
        <div className="mt-3 grid grid-cols-1 sm:grid-cols-2 gap-3 text-sm">
          <Integration name="Supabase" status="Connected" />
          <Integration name="LiveKit Cloud" status="Connected" />
          <Integration name="Sarvam" status="Connected" />
          <Integration name="Twilio SIP" status="Connected" />
          <Integration name="Langfuse Cloud" status="Connected" />
          <Integration name="Google OAuth" status="Connected" />
        </div>
      </Card>

      <Card className="p-5 border-dashed">
        <Badge variant="outline" className="mb-2">Phase A</Badge>
        <ul className="text-sm space-y-1 text-muted-foreground">
          <li>· User & role management (admin / operator / viewer)</li>
          <li>· API key rotation in-app</li>
          <li>· Per-language / per-region Sarvam voice selection</li>
          <li>· Pilot-vs-prod toggle (sandbox Sarvam credits)</li>
          <li>· DPDP consent flow (OTP intake)</li>
        </ul>
      </Card>
    </div>
  )
}

function Integration({ name, status }: { name: string; status: string }) {
  return (
    <div className="flex items-center justify-between p-3 rounded-md border">
      <span>{name}</span>
      <Badge className="bg-emerald-600 text-white text-[10px]">{status}</Badge>
    </div>
  )
}
