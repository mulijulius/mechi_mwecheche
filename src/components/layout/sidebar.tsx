import * as React from 'react'
import { Link, useRouterState } from '@tanstack/react-router'
import type { LucideIcon } from 'lucide-react'
import {
  Activity,
  Dices,
  Gamepad2,
  Grid3X3,
  History,
  LayoutDashboard,
  LogOut,
  Menu,
  MessageCircle,
  Shield,
  ShieldCheck,
  Users,
  Wallet,
  X,
} from 'lucide-react'
import { cn } from '#/lib/utils'
import { useAuth } from '#/lib/auth-context'
import { useSidebar } from '#/lib/sidebar-context'
import { ADMIN_ROLE_LABEL } from '#/lib/admin-permissions'
import type { AdminCapability } from '#/types/database.types'

interface NavItem {
  to: string
  label: string
  icon: LucideIcon
  requires?: AdminCapability
}

const playerNav: Array<NavItem> = [
  { to: '/dashboard', label: 'Game floor', icon: Gamepad2 },
  { to: '/dashboard/checkers', label: 'Checkers 3D', icon: Grid3X3 },
  { to: '/dashboard/ludo', label: 'Ludo', icon: Dices },
  { to: '/dashboard/wallet', label: 'Wallet', icon: Wallet },
  { to: '/dashboard/history', label: 'Match history', icon: History },
]

const adminNav: Array<NavItem> = [
  { to: '/admin', label: 'Overview', icon: LayoutDashboard },
  { to: '/admin/approvals', label: 'Approvals', icon: ShieldCheck, requires: 'approve_admins' },
  { to: '/admin/users', label: 'Players', icon: Users, requires: 'manage_users' },
  { to: '/admin/finance', label: 'Finance', icon: Wallet, requires: 'financial_records' },
  { to: '/admin/support', label: 'Player chats', icon: MessageCircle, requires: 'player_chat' },
  { to: '/admin/traffic', label: 'Traffic', icon: Activity, requires: 'statistics' },
  { to: '/admin/games', label: 'Games', icon: Gamepad2, requires: 'manage_users' },
]

export function Sidebar({ variant }: { variant: 'player' | 'admin' }) {
  const { profile, can, signOut } = useAuth()
  const pathname = useRouterState({ select: (s) => s.location.pathname })
  const { isOpen, setIsOpen, toggle } = useSidebar()

  React.useEffect(() => {
    if (window.innerWidth < 1024) setIsOpen(false)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pathname])

  const items =
    variant === 'player'
      ? playerNav
      : adminNav.filter((item) => !item.requires || can(item.requires))

  return (
    <>
      <button
        onClick={toggle}
        aria-label={isOpen ? 'Close menu' : 'Open menu'}
        aria-expanded={isOpen}
        className={cn(
          'fixed left-3 top-3 z-50 flex size-10 items-center justify-center rounded-md border border-arena-border bg-arena-surface text-arena-text shadow-sm transition-colors hover:bg-arena-surface-2',
          isOpen && 'lg:hidden',
        )}
      >
        {isOpen ? <X className="size-4" /> : <Menu className="size-4" />}
      </button>

      {/* Backdrop (mobile) */}
      {isOpen && (
        <div
          className="fixed inset-0 z-30 bg-black/60 lg:hidden"
          onClick={() => setIsOpen(false)}
          aria-hidden
        />
      )}

      <aside
        className={cn(
          'fixed inset-y-0 left-0 z-40 flex w-60 flex-col border-r border-arena-border bg-arena-surface transition-transform duration-200',
          isOpen ? 'translate-x-0' : '-translate-x-full',
          'lg:relative lg:translate-x-0',
        )}
      >
        {/* Logo / close */}
        <div className="flex h-14 items-center justify-between px-4">
          <span className="font-display text-sm font-semibold text-arena-text">
            {variant === 'admin' ? '⚙ Admin' : '⛀ SkillForge'}
          </span>
          <button
            onClick={() => setIsOpen(false)}
            className="flex size-8 items-center justify-center rounded text-arena-text-dim hover:text-arena-text lg:hidden"
            aria-label="Close menu"
          >
            <X className="size-4" />
          </button>
        </div>

        {/* Nav */}
        <nav className="flex-1 space-y-0.5 px-2 py-2">
          {items.map((item) => {
            const active = item.to === '/dashboard'
              ? pathname === '/dashboard'
              : pathname.startsWith(item.to)
            return (
              <Link
                key={item.to}
                to={item.to as any}
                className={cn(
                  'flex items-center gap-3 rounded-md px-3 py-2 text-sm transition-colors',
                  active
                    ? 'bg-arena-surface-2 text-arena-text'
                    : 'text-arena-text-dim hover:bg-arena-surface-2 hover:text-arena-text',
                )}
              >
                <item.icon className={cn('size-4 shrink-0', active && 'text-arena-emerald')} />
                {item.label}
              </Link>
            )
          })}
        </nav>

        {/* Profile footer */}
        <div className="border-t border-arena-border p-4">
          <div className="flex items-center gap-3">
            <div className="flex size-8 shrink-0 items-center justify-center rounded-full bg-arena-surface-2 font-mono text-xs font-semibold text-arena-text-dim">
              {profile?.username?.slice(0, 2).toUpperCase() ?? '??'}
            </div>
            <div className="min-w-0 flex-1">
              <p className="truncate text-xs font-medium text-arena-text">{profile?.username}</p>
              {profile?.admin_role && (
                <p className="text-[10px] text-arena-text-dim">
                  {ADMIN_ROLE_LABEL[profile.admin_role]}
                </p>
              )}
            </div>
            <button
              onClick={signOut}
              className="flex size-7 shrink-0 items-center justify-center rounded text-arena-text-dim hover:text-arena-red"
              aria-label="Sign out"
            >
              <LogOut className="size-3.5" />
            </button>
          </div>
        </div>
      </aside>
    </>
  )
}
