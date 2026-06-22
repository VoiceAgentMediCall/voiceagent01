'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import {
  Home, Settings2, Mic, FlaskConical, Phone, Calendar, DollarSign, Cog, Shield,
  type LucideIcon,
} from 'lucide-react'
import { cn } from '@/lib/utils'
import type { UserRole } from '@/lib/types'

type Tab = { href: string; label: string; icon: LucideIcon; adminOnly?: boolean }

const tabs: Tab[] = [
  { href: '/master', label: 'Master Control', icon: Shield, adminOnly: true },
  { href: '/', label: 'Home', icon: Home },
  { href: '/admin', label: 'Prompt Editor', icon: Settings2 },
  { href: '/test', label: 'Browser Test', icon: Mic },
  { href: '/evals', label: 'Evals', icon: FlaskConical },
  { href: '/calls', label: 'Calls', icon: Phone },
  { href: '/schedule', label: 'Schedule', icon: Calendar },
  { href: '/costs', label: 'Costs', icon: DollarSign },
  { href: '/settings', label: 'Settings', icon: Cog },
]

export function Sidebar({ role }: { role: UserRole }) {
  const pathname = usePathname()
  const visibleTabs = tabs.filter((t) => !t.adminOnly || role === 'admin')

  return (
    <aside className="w-56 shrink-0 border-r border-zinc-800/80 bg-zinc-950 text-zinc-100 flex flex-col">
      <div className="px-5 py-4 border-b border-zinc-800/80">
        <div className="text-base font-semibold tracking-tight text-zinc-50">MediCall</div>
        <div className="text-[10px] uppercase tracking-[0.08em] text-zinc-500 mt-1">
          Pilot dashboard
        </div>
      </div>
      <nav className="flex-1 px-2 py-3 space-y-0.5">
        {visibleTabs.map(({ href, label, icon: Icon, adminOnly }) => {
          const active = href === '/' ? pathname === '/' : pathname.startsWith(href)
          return (
            <Link
              key={href}
              href={href}
              className={cn(
                'flex items-center gap-3 px-3 py-2 rounded-md text-sm transition-colors',
                active
                  ? adminOnly
                    ? 'bg-amber-900/40 text-amber-200'
                    : 'bg-emerald-600/10 text-emerald-300'
                  : adminOnly
                    ? 'text-amber-400/80 hover:bg-amber-900/30 hover:text-amber-200'
                    : 'text-zinc-400 hover:bg-zinc-900 hover:text-zinc-100'
              )}
            >
              <Icon size={16} />
              <span>{label}</span>
            </Link>
          )
        })}
      </nav>
      <div className="px-3 py-3 text-[10px] font-mono uppercase tracking-[0.08em] text-zinc-500 border-t border-zinc-800/80">
        v0.3.0-pilot · {role}
      </div>
    </aside>
  )
}
