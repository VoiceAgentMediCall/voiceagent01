import { createClient } from '@/lib/supabase/server'
import { NextResponse } from 'next/server'

export async function GET(request: Request) {
  const url = new URL(request.url)
  const code = url.searchParams.get('code')
  const next = url.searchParams.get('next') ?? '/'

  // Behind Railway's reverse proxy, request.url reflects the internal container
  // origin (http://localhost:8080), which would 404 in the browser. Honor the
  // X-Forwarded-Host / X-Forwarded-Proto headers Railway sends so redirects
  // land on the public URL.
  const forwardedHost = request.headers.get('x-forwarded-host')
  const forwardedProto = request.headers.get('x-forwarded-proto') ?? 'https'
  const publicOrigin = forwardedHost
    ? `${forwardedProto}://${forwardedHost}`
    : url.origin

  if (code) {
    const supabase = await createClient()
    const { error } = await supabase.auth.exchangeCodeForSession(code)
    if (error) {
      return NextResponse.redirect(
        `${publicOrigin}/login?error=${encodeURIComponent(error.message)}`
      )
    }
  }
  return NextResponse.redirect(`${publicOrigin}${next}`)
}
