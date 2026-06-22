'use client'

import { useEffect, useState } from 'react'
import { Card } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Skeleton } from '@/components/ui/skeleton'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { toast } from 'sonner'
import type { PromptVersionSummary, PromptVersionDetail } from '@/lib/types'

interface VersionHistoryProps {
  refreshKey: number
}

function relativeTime(iso: string): string {
  const then = new Date(iso).getTime()
  if (Number.isNaN(then)) return ''
  const diffSec = Math.round((then - Date.now()) / 1000)
  const rtf = new Intl.RelativeTimeFormat('en', { numeric: 'auto' })

  const abs = Math.abs(diffSec)
  if (abs < 60) return rtf.format(diffSec, 'second')
  if (abs < 3600) return rtf.format(Math.round(diffSec / 60), 'minute')
  if (abs < 86400) return rtf.format(Math.round(diffSec / 3600), 'hour')
  if (abs < 2592000) return rtf.format(Math.round(diffSec / 86400), 'day')
  if (abs < 31536000) return rtf.format(Math.round(diffSec / 2592000), 'month')
  return rtf.format(Math.round(diffSec / 31536000), 'year')
}

function displayName(
  u: PromptVersionSummary['created_by_user']
): string {
  if (!u) return 'unknown'
  return u.display_name?.trim() || u.email || 'unknown'
}

export function VersionHistory({ refreshKey }: VersionHistoryProps) {
  const [versions, setVersions] = useState<PromptVersionSummary[] | null>(null)
  const [loading, setLoading] = useState(true)
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [detail, setDetail] = useState<PromptVersionDetail | null>(null)
  const [detailLoading, setDetailLoading] = useState(false)

  useEffect(() => {
    let cancelled = false
    setLoading(true)
    fetch('/api/prompts/versions')
      .then((r) => r.json())
      .then((data: PromptVersionSummary[] | { error: string }) => {
        if (cancelled) return
        if (Array.isArray(data)) {
          setVersions(data)
        } else {
          toast.error(`Failed to load versions: ${data.error}`)
          setVersions([])
        }
        setLoading(false)
      })
      .catch((e) => {
        if (cancelled) return
        toast.error(`Failed to load versions: ${e.message}`)
        setVersions([])
        setLoading(false)
      })
    return () => {
      cancelled = true
    }
  }, [refreshKey])

  const openVersion = async (id: string) => {
    setSelectedId(id)
    setDetail(null)
    setDetailLoading(true)
    try {
      const res = await fetch(`/api/prompts/version/${id}`)
      if (!res.ok) {
        const err = await res.json()
        throw new Error(err.error ?? 'fetch failed')
      }
      const data: PromptVersionDetail = await res.json()
      setDetail(data)
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Failed to load version')
      setSelectedId(null)
    } finally {
      setDetailLoading(false)
    }
  }

  const closeDialog = () => {
    setSelectedId(null)
    setDetail(null)
  }

  return (
    <>
      <Card className="p-4 space-y-3">
        <div className="flex items-center justify-between">
          <h2 className="text-sm font-semibold">Version history</h2>
          {versions && versions.length > 0 && (
            <span className="text-xs text-muted-foreground">
              {versions.length} {versions.length === 1 ? 'version' : 'versions'}
            </span>
          )}
        </div>

        {loading ? (
          <div className="space-y-2">
            <Skeleton className="h-16 w-full" />
            <Skeleton className="h-16 w-full" />
            <Skeleton className="h-16 w-full" />
          </div>
        ) : versions && versions.length === 0 ? (
          <p className="text-xs text-muted-foreground py-6 text-center">
            No versions yet. Save the editor to create v1.
          </p>
        ) : (
          <div className="max-h-[70vh] overflow-y-auto -mx-2 px-2 space-y-2">
            {versions?.map((v) => (
              <button
                key={v.id}
                onClick={() => openVersion(v.id)}
                className="w-full text-left rounded-md border border-border bg-background hover:bg-accent hover:border-accent-foreground/20 transition-colors p-3 space-y-1.5 focus:outline-none focus:ring-2 focus:ring-ring"
              >
                <div className="flex items-center gap-2 flex-wrap">
                  <Badge variant="secondary" className="font-mono text-xs">
                    v{v.version}
                  </Badge>
                  {v.is_active && (
                    <Badge className="text-xs bg-green-600 hover:bg-green-600">
                      active
                    </Badge>
                  )}
                  <span className="text-[11px] text-muted-foreground ml-auto">
                    {relativeTime(v.created_at)}
                  </span>
                </div>
                <div className="text-xs text-muted-foreground">
                  by {displayName(v.created_by_user)}
                </div>
                {v.notes && (
                  <p
                    className="text-xs text-foreground/80 overflow-hidden"
                    style={{
                      display: '-webkit-box',
                      WebkitLineClamp: 2,
                      WebkitBoxOrient: 'vertical',
                    }}
                  >
                    {v.notes}
                  </p>
                )}
              </button>
            ))}
          </div>
        )}
      </Card>

      <Dialog
        open={selectedId !== null}
        onOpenChange={(open) => {
          if (!open) closeDialog()
        }}
      >
        <DialogContent className="max-w-3xl max-h-[85vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 flex-wrap">
              {detail ? (
                <>
                  <span>Prompt v{detail.version}</span>
                  {detail.is_active && (
                    <Badge className="text-xs bg-green-600 hover:bg-green-600">
                      active
                    </Badge>
                  )}
                </>
              ) : (
                <span>Loading version…</span>
              )}
            </DialogTitle>
          </DialogHeader>

          {detailLoading || !detail ? (
            <div className="space-y-3">
              <Skeleton className="h-4 w-1/2" />
              <Skeleton className="h-24 w-full" />
              <Skeleton className="h-40 w-full" />
            </div>
          ) : (
            <div className="space-y-4">
              <div className="text-xs text-muted-foreground space-y-0.5">
                <div>
                  Saved {new Date(detail.created_at).toLocaleString()} (
                  {relativeTime(detail.created_at)})
                </div>
                <div>by {displayName(detail.created_by_user)}</div>
              </div>

              {detail.notes && (
                <div className="space-y-1">
                  <div className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                    Notes
                  </div>
                  <p className="text-sm whitespace-pre-wrap">{detail.notes}</p>
                </div>
              )}

              <div className="space-y-1">
                <div className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                  First message
                </div>
                <pre className="text-sm whitespace-pre-wrap break-words rounded border bg-muted/40 p-3 font-mono">
                  {detail.first_message}
                </pre>
              </div>

              <div className="space-y-1">
                <div className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                  System prompt
                </div>
                <pre className="text-xs whitespace-pre-wrap break-words rounded border bg-muted/40 p-3 font-mono max-h-[40vh] overflow-y-auto">
                  {detail.system_prompt}
                </pre>
              </div>

              {detail.variables && Object.keys(detail.variables).length > 0 && (
                <div className="space-y-1">
                  <div className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                    Variables
                  </div>
                  <div className="rounded border bg-muted/40 p-3 space-y-1">
                    {Object.entries(detail.variables).map(([k, v]) => (
                      <div key={k} className="flex gap-3 text-xs font-mono">
                        <span className="text-muted-foreground min-w-[120px]">
                          {k}
                        </span>
                        <span className="break-all">{v || '—'}</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* TODO B25.1: add "Promote this version to active" action */}
            </div>
          )}
        </DialogContent>
      </Dialog>
    </>
  )
}
