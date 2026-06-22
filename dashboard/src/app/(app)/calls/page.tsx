'use client'

import { useEffect, useState } from 'react'
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from '@/components/ui/table'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select'
import {
  Dialog, DialogContent, DialogHeader, DialogTitle,
} from '@/components/ui/dialog'
import { toast } from 'sonner'
import type { CallLog, Outcome } from '@/lib/types'

const OUTCOME_STYLES: Record<Outcome, string> = {
  CONFIRMED: 'bg-emerald-600 hover:bg-emerald-600/90 text-white',
  DENIED: 'bg-amber-600 hover:bg-amber-600/90 text-white',
  ESCALATED: 'bg-red-600 hover:bg-red-600/90 text-white',
  NO_ANSWER: 'bg-zinc-500 hover:bg-zinc-500/90 text-white',
  ERROR: 'bg-red-800 hover:bg-red-800/90 text-white',
}

const OUTCOMES: ('all' | Outcome)[] = ['all', 'CONFIRMED', 'DENIED', 'ESCALATED', 'NO_ANSWER', 'ERROR']

export default function CallsPage() {
  const [calls, setCalls] = useState<CallLog[]>([])
  const [loading, setLoading] = useState(true)
  const [filter, setFilter] = useState<'all' | Outcome>('all')
  const [selected, setSelected] = useState<CallLog | null>(null)

  const load = (outcome: 'all' | Outcome) => {
    setLoading(true)
    const qs = outcome === 'all' ? '' : `?outcome=${outcome}`
    fetch(`/api/calls${qs}`)
      .then((r) => r.json())
      .then((data: CallLog[]) => {
        setCalls(Array.isArray(data) ? data : [])
        setLoading(false)
      })
      .catch((e) => {
        toast.error(`Failed to load calls: ${e.message}`)
        setLoading(false)
      })
  }

  useEffect(() => { load(filter) }, [filter])

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold">Calls</h1>
        <div className="flex items-center gap-2">
          <Select value={filter} onValueChange={(v) => setFilter(v as 'all' | Outcome)}>
            <SelectTrigger className="w-40">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {OUTCOMES.map((o) => (
                <SelectItem key={o} value={o}>
                  {o === 'all' ? 'All outcomes' : o}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Button variant="outline" size="sm" onClick={() => load(filter)}>
            Refresh
          </Button>
        </div>
      </div>

      <div className="border rounded-md">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Time</TableHead>
              <TableHead>Phone</TableHead>
              <TableHead>Outcome</TableHead>
              <TableHead>Source</TableHead>
              <TableHead className="text-right">Duration</TableHead>
              <TableHead className="text-right">Prompt v</TableHead>
              <TableHead>Stack</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {loading ? (
              <TableRow><TableCell colSpan={7} className="text-center text-sm text-muted-foreground py-6">Loading…</TableCell></TableRow>
            ) : calls.length === 0 ? (
              <TableRow><TableCell colSpan={7} className="text-center text-sm text-muted-foreground py-6">No calls yet.</TableCell></TableRow>
            ) : (
              calls.map((c) => (
                <TableRow
                  key={c.id}
                  className="cursor-pointer hover:bg-muted/50"
                  onClick={() => setSelected(c)}
                >
                  <TableCell className="text-xs text-muted-foreground">
                    {new Date(c.created_at).toLocaleString()}
                  </TableCell>
                  <TableCell className="font-mono text-xs">{c.phone}</TableCell>
                  <TableCell>
                    <Badge className={OUTCOME_STYLES[c.outcome] ?? ''}>{c.outcome}</Badge>
                  </TableCell>
                  <TableCell className="text-xs text-muted-foreground">{c.outcome_source ?? '—'}</TableCell>
                  <TableCell className="text-right">{c.duration_sec != null ? `${c.duration_sec}s` : '—'}</TableCell>
                  <TableCell className="text-right">{c.prompt_version != null ? `v${c.prompt_version}` : '—'}</TableCell>
                  <TableCell className="text-xs">{c.stack}</TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </div>

      <Dialog open={selected !== null} onOpenChange={(open) => !open && setSelected(null)}>
        <DialogContent className="max-w-2xl max-h-[80vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Call detail</DialogTitle>
          </DialogHeader>
          {selected && (
            <div className="space-y-4 text-sm">
              <div className="grid grid-cols-2 gap-3">
                <Field label="Call ID">{selected.call_id}</Field>
                <Field label="Phone">{selected.phone}</Field>
                <Field label="Outcome">
                  <Badge className={OUTCOME_STYLES[selected.outcome] ?? ''}>{selected.outcome}</Badge>
                </Field>
                <Field label="Source">{selected.outcome_source ?? '—'}</Field>
                <Field label="Duration">{selected.duration_sec != null ? `${selected.duration_sec}s` : '—'}</Field>
                <Field label="Prompt version">{selected.prompt_version != null ? `v${selected.prompt_version}` : '—'}</Field>
                <Field label="Stack">{selected.stack}</Field>
                <Field label="Langfuse trace">{selected.langfuse_trace_id ?? '—'}</Field>
              </div>

              {selected.reason && (
                <div>
                  <div className="text-xs text-muted-foreground mb-1">Reason</div>
                  <div className="text-sm">{selected.reason}</div>
                </div>
              )}

              <div>
                <div className="text-xs text-muted-foreground mb-1">Transcript</div>
                <div className="space-y-2 border rounded-md p-3 bg-muted/30">
                  {Array.isArray(selected.transcript) && selected.transcript.length > 0 ? (
                    selected.transcript.map((m, i) => (
                      <div key={i} className="text-sm">
                        <span className="text-xs font-semibold uppercase text-muted-foreground mr-2">{m.role}</span>
                        {m.text}
                      </div>
                    ))
                  ) : (
                    <span className="text-xs text-muted-foreground">No transcript.</span>
                  )}
                </div>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  )
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <div className="text-xs text-muted-foreground mb-0.5">{label}</div>
      <div className="text-sm font-mono">{children}</div>
    </div>
  )
}
