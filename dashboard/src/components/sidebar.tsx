'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import {
  Home,
  Settings2,
  Mic,
  FlaskConical,
  Phone,
  Calendar,
  DollarSign,
  Cog,
  type LucideIcon,
} from 'lucide-react'
import { cn } from '@/lib/utils'

type Tab = { href: string; label: string; icon: LucideIcon }

const tabs: Tab[] = [
  { href: '/', label: 'Home', icon: Home },
  { href: '/admin', label: 'Admin', icon: Settings2 },
  { href: '/test', label: 'Browser Test', icon: Mic },
  { href: '/evals', label: 'Evals', icon: FlaskConical },
  { href: '/calls', label: 'Calls', icon: Phone },
  { href: '/schedule', label: 'Schedule', icon: Calendar },
  { href: '/costs', label: 'Costs', icon: DollarSign },
  { href: '/settings', label: 'Settings', icon: Cog },
]

export function Sidebar() {
  const pathname = usePathname()

  return (
    <aside className="w-56 shrink-0 border-r bg-zinc-950 text-zinc-100 flex flex-col">
      <div className="p-5 border-b border-zinc-800">
        <div className="text-lg font-semibold tracking-tight">MediCall</div>
        <div className="text-[11px] text-zinc-400 mt-0.5">Pilot dashboard</div>
      </div>
      <nav className="flex-1 px-2 py-3 space-y-0.5">
        {tabs.map(({ href, label, icon: Icon }) => {
          const active = href === '/' ? pathname === '/' : pathname.startsWith(href)
          return (
            <Link
              key={href}
              href={href}
              className={cn(
                'flex items-center gap-3 px-3 py-2 rounded-md text-sm transition-colors',
                active
                  ? 'bg-zinc-800 text-white'
                  : 'text-zinc-400 hover:bg-zinc-900 hover:text-zinc-100'
              )}
            >
              <Icon size={16} />
              <span>{label}</span>
            </Link>
          )
        })}
      </nav>
      <div className="p-3 text-[11px] text-zinc-500 border-t border-zinc-800">
        v0.3.0-pilot
      </div>
    </aside>
  )
}
