import { getCurrentUserRole } from '@/lib/auth'
import { redirect } from 'next/navigation'
import { Sidebar } from '@/components/sidebar'
import { UserMenu } from '@/components/user-menu'

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const ctx = await getCurrentUserRole()
  if (!ctx) redirect('/login')
  if (ctx.role === 'pending') redirect('/not-authorized')

  return (
    <div className="flex h-screen bg-background">
      <Sidebar role={ctx.role} />
      <div className="flex-1 flex flex-col min-w-0">
        <header className="h-14 border-b px-6 flex items-center justify-end shrink-0">
          <UserMenu email={ctx.email} />
        </header>
        <main className="flex-1 overflow-auto p-6">{children}</main>
      </div>
    </div>
  )
}
