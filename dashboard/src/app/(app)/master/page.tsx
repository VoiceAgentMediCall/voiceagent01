'use client'

import { useEffect, useState } from 'react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Card } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from '@/components/ui/table'
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select'
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from '@/components/ui/dialog'
import { toast } from 'sonner'
import { Shield, Trash2, UserPlus, History } from 'lucide-react'
import type { MemberRow, PendingInvite, AuditLogEntry, UserRole } from '@/lib/types'

const ROLE_BADGE: Record<UserRole, string> = {
  admin: 'bg-amber-600 text-white',
  editor: 'bg-blue-600 text-white',
  viewer: 'bg-zinc-500 text-white',
  pending: 'bg-zinc-700 text-zinc-300',
}

const ACTION_BADGE: Record<AuditLogEntry['action'], string> = {
  invite_added: 'bg-blue-600 text-white',
  invite_removed: 'bg-amber-600 text-white',
  user_role_changed: 'bg-purple-600 text-white',
  user_removed: 'bg-red-700 text-white',
  first_sign_in: 'bg-emerald-600 text-white',
}

export default function MasterControlPage() {
  const [members, setMembers] = useState<MemberRow[]>([])
  const [invites, setInvites] = useState<PendingInvite[]>([])
  const [audit, setAudit] = useState<AuditLogEntry[]>([])
  const [loading, setLoading] = useState(true)
  const [inviteEmail, setInviteEmail] = useState('')
  const [inviteRole, setInviteRole] = useState<'admin' | 'editor' | 'viewer'>('viewer')
  const [inviteNotes, setInviteNotes] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [confirmRemove, setConfirmRemove] = useState<MemberRow | null>(null)

  const reload = async () => {
    setLoading(true)
    try {
      const [m, i, a] = await Promise.all([
        fetch('/api/master/users').then((r) => r.json()),
        fetch('/api/master/invites').then((r) => r.json()),
        fetch('/api/master/audit').then((r) => r.json()),
      ])
      setMembers(Array.isArray(m) ? m : [])
      setInvites(Array.isArray(i) ? i : [])
      setAudit(Array.isArray(a) ? a : [])
    } catch (e) {
      toast.error(`Load failed: ${e instanceof Error ? e.message : 'unknown'}`)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { reload() }, [])

  const submitInvite = async (e: React.FormEvent) => {
    e.preventDefault()
    setSubmitting(true)
    try {
      const res = await fetch('/api/master/invites', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          email: inviteEmail,
          role: inviteRole,
          notes: inviteNotes || null,
        }),
      })
      if (!res.ok) {
        const err = await res.json()
        throw new Error(err.error ?? 'invite failed')
      }
      toast.success(`Invite sent to ${inviteEmail}`)
      setInviteEmail('')
      setInviteNotes('')
      reload()
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Invite failed')
    } finally {
      setSubmitting(false)
    }
  }

  const cancelInvite = async (id: string) => {
    try {
      const res = await fetch(`/api/master/invites/${id}`, { method: 'DELETE' })
      if (!res.ok) {
        const err = await res.json()
        throw new Error(err.error ?? 'cancel failed')
      }
      toast.success('Invite canceled')
      reload()
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Cancel failed')
    }
  }

  const changeRole = async (userId: string, newRole: 'admin' | 'editor' | 'viewer') => {
    try {
      const res = await fetch(`/api/master/users/${userId}`, {
        method: 'PATCH',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ role: newRole }),
      })
      if (!res.ok) {
        const err = await res.json()
        throw new Error(err.error ?? 'role change failed')
      }
      toast.success(`Role updated to ${newRole}`)
      reload()
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Role change failed')
    }
  }

  const removeMember = async () => {
    if (!confirmRemove) return
    try {
      const res = await fetch(`/api/master/users/${confirmRemove.id}`, { method: 'DELETE' })
      if (!res.ok) {
        const err = await res.json()
        throw new Error(err.error ?? 'remove failed')
      }
      toast.success(`Removed ${confirmRemove.email}`)
      setConfirmRemove(null)
      reload()
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Remove failed')
    }
  }

  const adminCount = members.filter((m) => m.role === 'admin').length

  return (
    <div className="space-y-6 max-w-5xl">
      <div className="flex items-center gap-2">
        <Shield size={20} className="text-amber-500" />
        <h1 className="text-2xl font-semibold">Master Control</h1>
      </div>
      <p className="text-sm text-muted-foreground">
        Invite teammates, manage roles, and review the change log.
        Admins can promote others to admin — at least one admin must always exist.
      </p>

      {/* Section A: Team members */}
      <Card className="p-0">
        <div className="px-5 pt-5 pb-2 flex items-center justify-between">
          <h2 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">
            Team members ({members.length})
          </h2>
          <span className="text-xs text-muted-foreground">
            {adminCount} admin{adminCount === 1 ? '' : 's'}
          </span>
        </div>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Name</TableHead>
              <TableHead>Email</TableHead>
              <TableHead>Role</TableHead>
              <TableHead>Invited by</TableHead>
              <TableHead className="w-0" />
            </TableRow>
          </TableHeader>
          <TableBody>
            {loading ? (
              <TableRow><TableCell colSpan={5} className="text-center text-sm text-muted-foreground py-4">Loading…</TableCell></TableRow>
            ) : members.length === 0 ? (
              <TableRow><TableCell colSpan={5} className="text-center text-sm text-muted-foreground py-4">No members yet.</TableCell></TableRow>
            ) : members.map((m) => {
              const isLastAdmin = m.role === 'admin' && adminCount <= 1
              const locked = m.is_master || isLastAdmin
              const lockReason = m.is_master
                ? 'Master admin — only modifiable via SQL Editor'
                : isLastAdmin
                  ? 'Last admin — promote someone first'
                  : ''
              return (
                <TableRow key={m.id}>
                  <TableCell>{m.display_name ?? '—'}</TableCell>
                  <TableCell className="font-mono text-xs">{m.email}</TableCell>
                  <TableCell>
                    <div className="flex items-center gap-1.5">
                      <Select
                        value={m.role}
                        onValueChange={(v) => changeRole(m.id, v as 'admin' | 'editor' | 'viewer')}
                        disabled={locked}
                      >
                        <SelectTrigger className="w-28 h-7">
                          <SelectValue>
                            <Badge className={ROLE_BADGE[m.role]}>{m.role}</Badge>
                          </SelectValue>
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="admin">admin</SelectItem>
                          <SelectItem value="editor">editor</SelectItem>
                          <SelectItem value="viewer">viewer</SelectItem>
                        </SelectContent>
                      </Select>
                      {m.is_master && (
                        <Badge className="bg-purple-700 text-white text-[10px] uppercase tracking-wide">
                          Master
                        </Badge>
                      )}
                    </div>
                    {lockReason && (
                      <p className="text-[10px] text-muted-foreground mt-1">{lockReason}</p>
                    )}
                  </TableCell>
                  <TableCell className="text-xs text-muted-foreground">
                    {m.invited_by?.email ?? '— (seed)'}
                  </TableCell>
                  <TableCell>
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => setConfirmRemove(m)}
                      disabled={locked}
                      title={locked ? lockReason : 'Remove member'}
                    >
                      <Trash2 size={14} />
                    </Button>
                  </TableCell>
                </TableRow>
              )
            })}
          </TableBody>
        </Table>
      </Card>

      {/* Section B: Pending invites */}
      <Card className="p-0">
        <div className="px-5 pt-5 pb-2">
          <h2 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">
            Pending invites ({invites.length})
          </h2>
        </div>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Email</TableHead>
              <TableHead>Role</TableHead>
              <TableHead>Invited</TableHead>
              <TableHead className="w-0" />
            </TableRow>
          </TableHeader>
          <TableBody>
            {invites.length === 0 ? (
              <TableRow><TableCell colSpan={4} className="text-center text-sm text-muted-foreground py-4">No pending invites.</TableCell></TableRow>
            ) : invites.map((inv) => (
              <TableRow key={inv.id}>
                <TableCell className="font-mono text-xs">{inv.email}</TableCell>
                <TableCell><Badge className={ROLE_BADGE[inv.role]}>{inv.role}</Badge></TableCell>
                <TableCell className="text-xs text-muted-foreground">
                  {new Date(inv.invited_at).toLocaleString()}
                </TableCell>
                <TableCell>
                  <Button variant="ghost" size="sm" onClick={() => cancelInvite(inv.id)}>
                    <Trash2 size={14} />
                  </Button>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </Card>

      {/* Section C: Invite form */}
      <Card className="p-5">
        <h2 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground mb-4">
          Invite a teammate
        </h2>
        <form onSubmit={submitInvite} className="grid grid-cols-1 md:grid-cols-4 gap-3 items-end">
          <div className="md:col-span-2 space-y-1">
            <label className="text-xs font-medium">Email</label>
            <Input
              type="email"
              required
              placeholder="teammate@example.com"
              value={inviteEmail}
              onChange={(e) => setInviteEmail(e.target.value)}
            />
          </div>
          <div className="space-y-1">
            <label className="text-xs font-medium">Role</label>
            <Select value={inviteRole} onValueChange={(v) => setInviteRole(v as 'admin' | 'editor' | 'viewer')}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="admin">admin</SelectItem>
                <SelectItem value="editor">editor</SelectItem>
                <SelectItem value="viewer">viewer</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <Button type="submit" disabled={submitting}>
            <UserPlus size={14} className="mr-2" />
            {submitting ? 'Inviting…' : 'Send invite'}
          </Button>
          <div className="md:col-span-4 space-y-1">
            <label className="text-xs font-medium">Notes (optional)</label>
            <Input
              placeholder="e.g., founder, PM, design lead"
              value={inviteNotes}
              onChange={(e) => setInviteNotes(e.target.value)}
            />
          </div>
        </form>
      </Card>

      {/* Section D: Audit log */}
      <Card className="p-0">
        <div className="px-5 pt-5 pb-2 flex items-center gap-2">
          <History size={14} className="text-muted-foreground" />
          <h2 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">
            Audit log
          </h2>
        </div>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>When</TableHead>
              <TableHead>Action</TableHead>
              <TableHead>Actor</TableHead>
              <TableHead>Target</TableHead>
              <TableHead>Detail</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {audit.length === 0 ? (
              <TableRow><TableCell colSpan={5} className="text-center text-sm text-muted-foreground py-4">No actions yet.</TableCell></TableRow>
            ) : audit.map((e) => (
              <TableRow key={e.id}>
                <TableCell className="text-xs text-muted-foreground">{new Date(e.created_at).toLocaleString()}</TableCell>
                <TableCell><Badge className={ACTION_BADGE[e.action]}>{e.action}</Badge></TableCell>
                <TableCell className="text-xs">{e.actor?.email ?? 'system'}</TableCell>
                <TableCell className="text-xs">{e.target_email ?? '—'}</TableCell>
                <TableCell className="text-xs text-muted-foreground">
                  {e.previous_role && e.new_role
                    ? `${e.previous_role} → ${e.new_role}`
                    : e.new_role
                      ? `set to ${e.new_role}`
                      : e.notes ?? '—'}
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </Card>

      {/* Confirm remove dialog */}
      <Dialog open={confirmRemove !== null} onOpenChange={(o) => !o && setConfirmRemove(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Remove team member?</DialogTitle>
            <DialogDescription>
              {confirmRemove?.email} will lose access immediately. They&apos;ll need a new invite to return.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setConfirmRemove(null)}>Cancel</Button>
            <Button variant="destructive" onClick={removeMember}>Remove</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
