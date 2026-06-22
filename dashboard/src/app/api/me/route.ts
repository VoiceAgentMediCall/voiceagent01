import { getCurrentUserRole } from '@/lib/auth'
import { NextResponse } from 'next/server'

export async function GET() {
  const ctx = await getCurrentUserRole()
  if (!ctx) return NextResponse.json({ role: null }, { status: 401 })
  return NextResponse.json({ role: ctx.role, email: ctx.email })
}
