import { createClient } from '@/lib/supabase/server'
import { NextResponse } from 'next/server'

export type Role = 'admin' | 'editor' | 'viewer' | 'pending'

export type AuthSuccess = {
  ok: true
  userId: string
  email: string
  role: Role
}

export type AuthFailure = {
  ok: false
  response: NextResponse
}

/**
 * Server-side guard for API routes.
 * Returns either { ok: true, ... } or a NextResponse to return immediately.
 *
 * Usage:
 *   const auth = await requireRole('admin', 'editor')
 *   if (!auth.ok) return auth.response
 *   // ... use auth.userId / auth.email / auth.role
 */
export async function requireRole(...allowed: Role[]): Promise<AuthSuccess | AuthFailure> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) {
    return {
      ok: false,
      response: NextResponse.json({ error: 'unauthorized' }, { status: 401 }),
    }
  }

  const { data: profile, error } = await supabase
    .from('users')
    .select('role')
    .eq('id', user.id)
    .maybeSingle()

  if (error || !profile) {
    return {
      ok: false,
      response: NextResponse.json({ error: 'profile not found' }, { status: 403 }),
    }
  }

  const role = profile.role as Role
  if (!allowed.includes(role)) {
    return {
      ok: false,
      response: NextResponse.json(
        { error: `forbidden — requires ${allowed.join(' or ')}`, role },
        { status: 403 }
      ),
    }
  }

  return { ok: true, userId: user.id, email: user.email!, role }
}

/**
 * Server component helper — returns role + ctx without throwing.
 * Returns null if not authenticated; caller decides how to handle pending vs allowed.
 */
export async function getCurrentUserRole(): Promise<{ userId: string; email: string; role: Role } | null> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return null

  const { data: profile } = await supabase
    .from('users')
    .select('role')
    .eq('id', user.id)
    .maybeSingle()

  return {
    userId: user.id,
    email: user.email!,
    role: (profile?.role as Role) ?? 'pending',
  }
}
