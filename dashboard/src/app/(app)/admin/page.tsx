'use client'

import { useEffect, useState } from 'react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { Card } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { toast } from 'sonner'
import type { Prompt, PromptDraft } from '@/lib/types'

const EMPTY: PromptDraft = {
  system_prompt: '',
  first_message: '',
  variables: { parent_name: '', drug_name: '' },
  notes: null,
}

export default function AdminPage() {
  const [active, setActive] = useState<Prompt | null>(null)
  const [draft, setDraft] = useState<PromptDraft>(EMPTY)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    fetch('/api/prompts')
      .then((r) => r.json())
      .then((p: Prompt | null) => {
        if (p) {
          setActive(p)
          setDraft({
            system_prompt: p.system_prompt,
            first_message: p.first_message,
            variables: p.variables ?? {},
            notes: p.notes,
          })
        }
        setLoading(false)
      })
      .catch((e) => {
        toast.error(`Failed to load prompt: ${e.message}`)
        setLoading(false)
      })
  }, [])

  const save = async () => {
    if (!draft.system_prompt.trim() || !draft.first_message.trim()) {
      toast.error('Both system_prompt and first_message are required.')
      return
    }
    setSaving(true)
    try {
      const res = await fetch('/api/prompts', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(draft),
      })
      if (!res.ok) {
        const err = await res.json()
        throw new Error(err.error ?? 'save failed')
      }
      const fresh: Prompt = await res.json()
      setActive(fresh)
      toast.success(`Saved as v${fresh.version}`)
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Failed to save')
    } finally {
      setSaving(false)
    }
  }

  if (loading) {
    return <p className="text-sm text-muted-foreground">Loading…</p>
  }

  return (
    <div className="space-y-6 max-w-4xl">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold">Admin — Prompt editor</h1>
          <div className="flex items-center gap-3 mt-1.5">
            {active ? (
              <>
                <Badge variant="secondary">Active: v{active.version}</Badge>
                <span className="text-xs text-muted-foreground">
                  Saved {new Date(active.created_at).toLocaleString()}
                </span>
              </>
            ) : (
              <Badge variant="outline">No active prompt — saving will create v1</Badge>
            )}
          </div>
        </div>
        <Button onClick={save} disabled={saving}>
          {saving ? 'Saving…' : 'Save as new version'}
        </Button>
      </div>

      <Card className="p-6 space-y-4">
        <div className="space-y-1.5">
          <label className="text-sm font-medium">First message</label>
          <Input
            value={draft.first_message}
            onChange={(e) => setDraft({ ...draft, first_message: e.target.value })}
            placeholder="नमस्ते {parent_name} जी, मैं मेडीकॉल से बोल रहा हूँ…"
          />
          <p className="text-xs text-muted-foreground">
            What the agent says first. Supports {'{parent_name}'} and {'{drug_name}'} templating.
          </p>
        </div>

        <div className="space-y-1.5">
          <label className="text-sm font-medium">System prompt</label>
          <Textarea
            value={draft.system_prompt}
            onChange={(e) => setDraft({ ...draft, system_prompt: e.target.value })}
            rows={24}
            className="font-mono text-xs"
            placeholder="आप मेडीकॉल का AI एजेंट हैं…"
          />
          <p className="text-xs text-muted-foreground">
            Devanagari only. Reference {'{drug_name}'} in scripts. Must instruct the LLM to call
            <code className="px-1 mx-0.5 rounded bg-muted">report_outcome</code> and
            <code className="px-1 mx-0.5 rounded bg-muted">end_call</code> when closing.
          </p>
        </div>
      </Card>

      <Card className="p-6 space-y-4">
        <div>
          <h2 className="text-lg font-semibold">Variables</h2>
          <p className="text-xs text-muted-foreground">
            Per-call substitutions. Used in templating.
          </p>
        </div>
        <div className="grid grid-cols-2 gap-3">
          {Object.entries(draft.variables).map(([k, v]) => (
            <div key={k} className="space-y-1">
              <label className="text-xs font-medium">{k}</label>
              <Input
                value={v}
                onChange={(e) =>
                  setDraft({
                    ...draft,
                    variables: { ...draft.variables, [k]: e.target.value },
                  })
                }
              />
            </div>
          ))}
        </div>
      </Card>

      <Card className="p-6 space-y-2">
        <label className="text-sm font-medium">Notes (optional)</label>
        <Textarea
          value={draft.notes ?? ''}
          onChange={(e) =>
            setDraft({ ...draft, notes: e.target.value ? e.target.value : null })
          }
          rows={3}
          placeholder="What changed in this version, and why."
        />
      </Card>
    </div>
  )
}
