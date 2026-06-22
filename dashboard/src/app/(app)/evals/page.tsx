'use client'

import { useEffect, useRef, useState } from 'react'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Card } from '@/components/ui/card'
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from '@/components/ui/table'
import {
  Dialog, DialogContent, DialogHeader, DialogTitle,
} from '@/components/ui/dialog'
import { toast } from 'sonner'
import { Play, CheckCircle2, XCircle } from 'lucide-react'
import type { EvalRun, EvalRunStatus } from '@/lib/types'

const STATUS_STYLES: Record<EvalRunStatus, string> = {
  queued: 'bg-zinc-500 text-white',
  running: 'bg-blue-600 text-white',
  passed: 'bg-emerald-600 text-white',
  failed: 'bg-amber-600 text-white',
  errored: 'bg-red-700 text-white',
}

const ACTIVE_STATUSES = new Set<EvalRunStatus>(['queued', 'running'])

export default function EvalsPage() {
  const [runs, setRuns] = useState<EvalRun[]>([])
  const [loading, setLoading] = useState(true)
  const [triggering, setTriggering] = useState(false)
  const [selected, setSelected] = useState<EvalRun | null>(null)
  const pollTimer = useRef<ReturnType<typeof setInterval> | null>(null)

  const load = async () => {
    try {
      const res = await fetch('/api/eval/results')
      const data = await res.json()
      setRuns(Array.isArray(data) ? data : [])
    } catch (e) {
      toast.error(`Failed to load runs: ${e instanceof Error ? e.message : 'unknown'}`)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { load() }, [])

  // Auto-poll while there's at least one active run
  useEffect(() => {
    const hasActive = runs.some((r) => ACTIVE_STATUSES.has(r.status))
    if (hasActive && !pollTimer.current) {
      pollTimer.current = setInterval(load, 3000)
    } else if (!hasActive && pollTimer.current) {
      clearInterval(pollTimer.current)
      pollTimer.current = null
    }
    return () => {
      if (pollTimer.current) {
        clearInterval(pollTimer.current)
        pollTimer.current = null
      }
    }
  }, [runs])

  const trigger = async () => {
    setTriggering(true)
    try {
      const res = await fetch('/api/eval/trigger', { method: 'POST' })
      if (!res.ok) {
        const err = await res.json().catch(() => ({}))
        throw new Error(err.error ?? `HTTP ${res.status}`)
      }
      toast.success('Eval queued. Polling for results…')
      await load()
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Trigger failed')
    } finally {
      setTriggering(false)
    }
  }

  const openDetail = async (run: EvalRun) => {
    try {
      const res = await fetch(`/api/eval/${run.id}`)
      if (!res.ok) throw new Error(`HTTP ${res.status}`)
      const fresh: EvalRun = await res.json()
      setSelected(fresh)
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Detail load failed')
    }
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold">Evals</h1>
          <p className="text-sm text-muted-foreground">
            Run the goldenset against the active prompt. Results appear within ~60s.
          </p>
        </div>
        <Button onClick={trigger} disabled={triggering}>
          <Play size={14} className="mr-1.5" />
          {triggering ? 'Queuing…' : 'Run goldenset'}
        </Button>
      </div>

      <div className="border rounded-md">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Created</TableHead>
              <TableHead>Prompt v</TableHead>
              <TableHead>Status</TableHead>
              <TableHead className="text-right">Pass / Total</TableHead>
              <TableHead>Duration</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {loading ? (
              <TableRow><TableCell colSpan={5} className="text-center text-sm text-muted-foreground py-6">Loading…</TableCell></TableRow>
            ) : runs.length === 0 ? (
              <TableRow><TableCell colSpan={5} className="text-center text-sm text-muted-foreground py-6">No runs yet. Click <span className="font-medium text-foreground">Run goldenset</span> above.</TableCell></TableRow>
            ) : runs.map((r) => (
              <TableRow
                key={r.id}
                className="cursor-pointer hover:bg-muted/50"
                onClick={() => openDetail(r)}
              >
                <TableCell className="text-xs text-muted-foreground">{new Date(r.created_at).toLocaleString()}</TableCell>
                <TableCell>{r.prompt_version != null ? `v${r.prompt_version}` : '—'}</TableCell>
                <TableCell>
                  <Badge className={STATUS_STYLES[r.status]}>{r.status}</Badge>
                </TableCell>
                <TableCell className="text-right font-mono text-sm">
                  {r.scenarios_total != null
                    ? `${r.scenarios_passed ?? 0} / ${r.scenarios_total}`
                    : '—'}
                </TableCell>
                <TableCell className="text-xs text-muted-foreground">
                  {r.started_at && r.finished_at
                    ? `${Math.round((new Date(r.finished_at).getTime() - new Date(r.started_at).getTime()) / 1000)}s`
                    : '—'}
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>

      <Dialog open={selected !== null} onOpenChange={(o) => !o && setSelected(null)}>
        <DialogContent className="max-w-2xl max-h-[80vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Eval run detail</DialogTitle>
          </DialogHeader>
          {selected && (
            <div className="space-y-4 text-sm">
              <div className="grid grid-cols-2 gap-3">
                <DetailField label="Status">
                  <Badge className={STATUS_STYLES[selected.status]}>{selected.status}</Badge>
                </DetailField>
                <DetailField label="Prompt version">{selected.prompt_version != null ? `v${selected.prompt_version}` : '—'}</DetailField>
                <DetailField label="Pass / Total">{selected.scenarios_total != null ? `${selected.scenarios_passed ?? 0} / ${selected.scenarios_total}` : '—'}</DetailField>
                <DetailField label="Golden-set SHA">{selected.goldenset_sha?.slice(0, 12) ?? '—'}</DetailField>
              </div>

              {selected.error_log && (
                <Card className="p-3 bg-red-950/20 border-red-800">
                  <div className="text-xs text-red-200 font-semibold mb-1">Error</div>
                  <pre className="text-xs whitespace-pre-wrap text-red-100">{selected.error_log}</pre>
                </Card>
              )}

              {selected.results?.scenarios && (
                <div>
                  <div className="text-xs text-muted-foreground mb-2">Per-scenario breakdown</div>
                  <div className="space-y-2">
                    {selected.results.scenarios.map((sc, i) => (
                      <Card key={i} className="p-3 flex items-start gap-3">
                        {sc.passed ? (
                          <CheckCircle2 size={16} className="text-emerald-500 mt-0.5 shrink-0" />
                        ) : (
                          <XCircle size={16} className="text-red-500 mt-0.5 shrink-0" />
                        )}
                        <div className="flex-1 min-w-0">
                          <div className="text-sm font-medium">{sc.description}</div>
                          <div className="mt-1.5 space-y-0.5">
                            {sc.assertions.map((a, j) => (
                              <div key={j} className="text-xs flex items-center gap-2">
                                <span className={a.passed ? 'text-emerald-500' : 'text-red-500'}>
                                  {a.passed ? '✓' : '✗'}
                                </span>
                                <span className="text-muted-foreground">{a.type}</span>
                                {a.reason && <span className="text-muted-foreground">— {a.reason}</span>}
                              </div>
                            ))}
                          </div>
                        </div>
                      </Card>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  )
}

function DetailField({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <div className="text-xs text-muted-foreground mb-0.5">{label}</div>
      <div className="text-sm">{children}</div>
    </div>
  )
}
