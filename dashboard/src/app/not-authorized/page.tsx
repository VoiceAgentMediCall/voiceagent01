'use client'

import { createClient } from '@/lib/supabase/client'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { ShieldX, LogOut } from 'lucide-react'

export default function NotAuthorizedPage() {
  const supabase = createClient()

  const signOut = async () => {
    await supabase.auth.signOut()
    window.location.href = '/login'
  }

  return (
    <div className="min-h-screen grid place-items-center bg-zinc-50 dark:bg-zinc-950 p-4">
      <Card className="w-full max-w-md p-8 space-y-6 text-center">
        <div className="flex justify-center">
          <div className="rounded-full bg-amber-100 dark:bg-amber-950/40 p-4">
            <ShieldX size={32} className="text-amber-600 dark:text-amber-500" />
          </div>
        </div>

        <div className="space-y-2">
          <h1 className="text-2xl font-semibold">Access pending</h1>
          <p className="text-sm text-muted-foreground">
            Your account isn&apos;t on the MediCall AI access list yet.
          </p>
        </div>

        <div className="text-sm border rounded-md p-4 bg-muted/30 text-left">
          <p className="font-medium mb-1">To request access:</p>
          <p className="text-muted-foreground">
            Contact <span className="font-mono text-foreground">dasshriyans2802@gmail.com</span> with
            the email address you signed in with, and ask to be added.
          </p>
        </div>

        <Button variant="outline" onClick={signOut} className="w-full">
          <LogOut size={14} className="mr-2" />
          Sign out
        </Button>
      </Card>
    </div>
  )
}
