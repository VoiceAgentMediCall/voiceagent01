'use client'

import { createClient } from '@/lib/supabase/client'
import { Button } from '@/components/ui/button'
import { LogOut } from 'lucide-react'

export function UserMenu({ email }: { email: string }) {
  const supabase = createClient()

  const signOut = async () => {
    await supabase.auth.signOut()
    window.location.href = '/login'
  }

  return (
    <div className="flex items-center gap-3">
      <span className="text-sm text-muted-foreground hidden sm:inline">{email}</span>
      <Button variant="outline" size="sm" onClick={signOut}>
        <LogOut size={14} className="mr-1.5" />
        Sign out
      </Button>
    </div>
  )
}
