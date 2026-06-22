'use client'

import { useEffect, useState } from 'react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Card } from '@/components/ui/card'
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from '@/components/ui/table'
import {
  Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle, DialogDescription,
} from '@/components/ui/dialog'
import { toast } from 'sonner'
import { Trash2, UserPlus } from 'lucide-react'
import type { Parent, ParentDraft } from '@/lib/types'

const EMPTY: ParentDraft = {
  name: '',
  phone: '',
  drug_name: '',
  scheduled_time: '',
  caregiver_email: '',
  active: true,
}

export default function SchedulePage() {
  const [parents, setParents] = useState<Parent[]>([])
  const [loading, setLoading] = useState(true)
  const [draft, setDraft] = useState<ParentDraft>(EMPTY)
  const [adding, setAdding] = useState(false)
  const [confirmDelete, setConfirmDelete] = useState<Parent | null>(null)

  const reload = async () => {
    setLoading(true)
    try {
      const res = await fetch('/api/parents')
      const data = await res.json()
      setParents(Array.isArray(data) ? data : [])
    } catch (e) {
      toast.error(`Failed to load: ${e instanceof Error ? e.message : 'unknown'}`)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { reload() }, [])

  const add = async (e: React.FormEvent) => {
    e.preventDefault()
    setAdding(true)
    try {
      const res = await fetch('/api/parents', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(draft),
      })
      if (!res.ok) {
        const err = await res.json()
        throw new Error(err.error ?? 'add failed')
      }
      toast.success(`Added ${draft.name}`)
      setDraft(EMPTY)
      reload()
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Add failed')
    } finally {
      setAdding(false)
    }
  }

  const toggleActive = async (p: Parent) => {
    try {
      const res = await fetch(`/api/parents/${p.id}`, {
        method: 'PATCH',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ active: !p.active }),
      })
      if (!res.ok) throw new Error('update failed')
      reload()
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Toggle failed')
    }
  }

  const remove = async () => {
    if (!confirmDelete) return
    try {
      const res = await fetch(`/api/parents/${confirmDelete.id}`, { method: 'DELETE' })
      if (!res.ok) throw new Error('delete failed')
      toast.success(`Deleted ${confirmDelete.name}`)
      setConfirmDelete(null)
      reload()
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Delete failed')
    }
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold">Schedule</h1>
        <span className="text-sm text-muted-foreground">{parents.length} parent{parents.length === 1 ? '' : 's'}</span>
      </div>

      <Card className="p-5">
        <form onSubmit={add} className="grid grid-cols-1 md:grid-cols-6 gap-3 items-end">
          <FormField label="Name" required>
            <Input value={draft.name} onChange={(e) => setDraft({ ...draft, name: e.target.value })} />
          </FormField>
          <FormField label="Phone (E.164)" required>
            <Input placeholder="+91..." value={draft.phone} onChange={(e) => setDraft({ ...draft, phone: e.target.value })} />
          </FormField>
          <FormField label="Drug" required>
            <Input value={draft.drug_name} onChange={(e) => setDraft({ ...draft, drug_name: e.target.value })} />
          </FormField>
          <FormField label="Time">
            <Input type="time" value={draft.scheduled_time ?? ''} onChange={(e) => setDraft({ ...draft, scheduled_time: e.target.value })} />
          </FormField>
          <FormField label="Caregiver email">
            <Input type="email" value={draft.caregiver_email ?? ''} onChange={(e) => setDraft({ ...draft, caregiver_email: e.target.value })} />
          </FormField>
          <Button type="submit" disabled={adding}>
            <UserPlus size={14} className="mr-1.5" />
            {adding ? 'Adding…' : 'Add'}
          </Button>
        </form>
      </Card>

      <div className="border rounded-md">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Name</TableHead>
              <TableHead>Phone</TableHead>
              <TableHead>Drug</TableHead>
              <TableHead>Time</TableHead>
              <TableHead>Caregiver</TableHead>
              <TableHead>Status</TableHead>
              <TableHead className="w-0" />
            </TableRow>
          </TableHeader>
          <TableBody>
            {loading ? (
              <TableRow><TableCell colSpan={7} className="text-center text-sm text-muted-foreground py-6">Loading…</TableCell></TableRow>
            ) : parents.length === 0 ? (
              <TableRow><TableCell colSpan={7} className="text-center text-sm text-muted-foreground py-6">No parents yet. Add one above.</TableCell></TableRow>
            ) : parents.map((p) => (
              <TableRow key={p.id}>
                <TableCell>{p.name}</TableCell>
                <TableCell className="font-mono text-xs">{p.phone}</TableCell>
                <TableCell>{p.drug_name}</TableCell>
                <TableCell className="text-xs text-muted-foreground">{p.scheduled_time ?? '—'}</TableCell>
                <TableCell className="text-xs text-muted-foreground">{p.caregiver_email ?? '—'}</TableCell>
                <TableCell>
                  <button
                    onClick={() => toggleActive(p)}
                    className={`text-xs px-2 py-1 rounded ${p.active ? 'bg-emerald-100 text-emerald-900 dark:bg-emerald-900/40 dark:text-emerald-200' : 'bg-zinc-100 text-zinc-600 dark:bg-zinc-800 dark:text-zinc-400'}`}
                  >
                    {p.active ? 'Active' : 'Paused'}
                  </button>
                </TableCell>
                <TableCell>
                  <Button variant="ghost" size="sm" onClick={() => setConfirmDelete(p)}>
                    <Trash2 size={14} />
                  </Button>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>

      <Dialog open={confirmDelete !== null} onOpenChange={(o) => !o && setConfirmDelete(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Delete parent?</DialogTitle>
            <DialogDescription>
              This will remove {confirmDelete?.name} permanently. Call logs already associated stay (with parent_id set to null).
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setConfirmDelete(null)}>Cancel</Button>
            <Button variant="destructive" onClick={remove}>Delete</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}

function FormField({ label, required, children }: { label: string; required?: boolean; children: React.ReactNode }) {
  return (
    <div className="space-y-1">
      <label className="text-xs font-medium">
        {label}{required && <span className="text-red-500 ml-0.5">*</span>}
      </label>
      {children}
    </div>
  )
}
