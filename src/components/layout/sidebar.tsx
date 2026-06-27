import { Link, useRouterState } from '@tanstack/react-router'
import type { LucideIcon } from 'lucide-react'
import {
  Gamepad2,
  History,
  LayoutDashboard,
  LogOut,
  Shield,
  Users,
  Wallet,
} from 'lucide-react'
import { cn } from '#/lib/utils'
import { useAuth } from '#/lib/auth-context'

interface NavItem {
  to: string
  label: string
  icon: LucideIcon
}

const playerNav: Array<NavItem> = [
  { to: '/dashboard', label: 'Game floor', icon: Gamepad2 },
  { to: '/dashboard/wallet', label: 'Wallet', icon: Wallet },
  { to: '/dashboard/history', label: 'Match history', icon: History },
]

const adminNav: Array<NavItem> = [
  { to: '/admin', label: 'Overview', icon: LayoutDashboard },
  { to: '/admin/users', label: 'Players', icon: Users },
  { to: '/admin/transactions', label: 'Transactions', icon: Wallet },
  { to: '/admin/games', label: 'Games', icon: Gamepad2 },
]

export function Sidebar({ variant }: { variant: 'player' | 'admin' }) {
  const { profile, signOut } = useAuth()
  const items = variant === 'player' ? playerNav : adminNav
  const pathname = useRouterState({ select: (s) => s.location.pathname })

  return (
    <aside className="flex h-screen w-60 shrink-0 flex-col border-r border-arena-border bg-arena-surface">
      <div className="flex items-center gap-2 border-b border-arena-border px-5 py-5">
        <div className="flex size-8 items-center justify-center rounded-md bg-arena-gold font-display text-sm font-bold text-[#15130a]">
          SA
        </div>
        <div>
          <p className="font-display text-sm font-semibold leading-tight text-arena-text">
            SkillForge
          </p>
          <p className="text-[10px] uppercase tracking-wider text-arena-text-dim">
            Arena
          </p>
        </div>
      </div>

      {variant === 'admin' && (
        <div className="flex items-center gap-2 border-b border-arena-border bg-arena-gold/5 px-5 py-2.5">
          <Shield className="size-3.5 text-arena-gold" />
          <span className="text-xs font-medium text-arena-gold">Admin console</span>
        </div>
      )}

      <nav className="flex-1 px-3 py-4">
        <ul className="flex flex-col gap-1">
          {items.map((item) => {
            const isActive = pathname === item.to
            const Icon = item.icon
            return (
              <li key={item.to}>
                <Link
                  to={item.to}
                  className={cn(
                    'flex items-center gap-3 rounded-md px-3 py-2 text-sm font-medium transition-colors',
                    isActive
                      ? 'bg-arena-gold text-[#15130a]'
                      : 'text-arena-text-dim hover:bg-arena-surface-2 hover:text-arena-text',
                  )}
                >
                  <Icon className="size-4" />
                  {item.label}
                </Link>
              </li>
            )
          })}
        </ul>
      </nav>

      <div className="border-t border-arena-border p-3">
        <div className="mb-2 flex items-center gap-2 rounded-md px-3 py-2">
          <div className="flex size-8 items-center justify-center rounded-full bg-arena-surface-2 font-display text-xs font-semibold text-arena-gold">
            {profile?.username?.slice(0, 2).toUpperCase() ?? '··'}
          </div>
          <div className="overflow-hidden">
            <p className="truncate text-sm font-medium text-arena-text">
              {profile?.username ?? 'Loading…'}
            </p>
            <p className="text-[10px] capitalize text-arena-text-dim">
              {profile?.role ?? ''}
            </p>
          </div>
        </div>
        <button
          onClick={() => signOut()}
          className="flex w-full items-center gap-3 rounded-md px-3 py-2 text-sm font-medium text-arena-text-dim transition-colors hover:bg-arena-red/10 hover:text-arena-red"
        >
          <LogOut className="size-4" />
          Sign out
        </button>
      </div>
    </aside>
  )
}
