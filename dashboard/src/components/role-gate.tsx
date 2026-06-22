'use client'

import { useEffect, useState } from 'react'
import type { UserRole } from '@/lib/types'

let cachedRole: UserRole | null = null

export function useCurrentRole(): UserRole | null {
  const [role, setRole] = useState<UserRole | null>(cachedRole)

  useEffect(() => {
    if (cachedRole) return
    fetch('/api/me')
      .then((r) => r.json())
      .then((d) => {
        if (d.role) {
          cachedRole = d.role
          setRole(d.role)
        }
      })
      .catch(() => {})
  }, [])

  return role
}

export const VIEWER_DISABLED_TOOLTIP =
  'Read-only access — ask an admin or editor.'

export function canEdit(role: UserRole | null): boolean {
  return role === 'admin' || role === 'editor'
}
