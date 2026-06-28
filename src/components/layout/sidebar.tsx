import * as React from 'react'
import { Link, useRouterState } from '@tanstack/react-router'
import type { LucideIcon } from 'lucide-react'
import {
  Activity,
  Gamepad2,
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
  /** Omit to show the item to any approved admin, regardless of sub-role. */
  requires?: AdminCapability
}

const playerNav: Array<NavItem> = [
  { to: '/dashboard', label: 'Game floor', icon: Gamepad2 },
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

  // Close the drawer automatically after navigating on mobile, so tapping
  // a nav link doesn't leave the overlay sitting open over the new page.
  // (Using a layout effect here would be overkill — a normal effect
  // keyed on pathname is enough since this only needs to run after the
  // route actually changes.)
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
      {/* Hamburger toggle: fixed in place so it's reachable whether the
          drawer is open or closed, on every screen size. On desktop it
          only needs to show up once the sidebar is actually closed —
          otherwise the in-sidebar X handles closing. */}
      <button
        onClick={toggle}
        aria-label={isOpen ? 'Close menu' : 'Open menu'}
        aria-expanded={isOpen}
        className={cn(
          'fixed left-3 top-3 z-50 flex size-10 items-center justify-center rounded-md border border-arena-border bg-arena-surface text-arena-text shadow-sm transition-colors hover:bg-arena-surface-2',
          isOpen && 'lg:hidden',
        )}
      >
        {isOpen ? <X className="size-5" /> : <Menu className="size-5" />}
      </button>

      {/* Backdrop: only rendered (and only matters) below the lg
          breakpoint, where the sidebar overlays content instead of
          sitting beside it. */}
      {isOpen && (
        <div
          onClick={() => setIsOpen(false)}
          className="fixed inset-0 z-30 bg-black/60 lg:hidden"
          aria-hidden="true"
        />
      )}

      <aside
        className={cn(
          'fixed inset-y-0 left-0 z-40 flex h-screen w-64 shrink-0 flex-col border-r border-arena-border bg-arena-surface transition-transform duration-200',
          'lg:sticky lg:top-0 lg:z-0 lg:translate-x-0',
          isOpen ? 'translate-x-0' : '-translate-x-full',
          // Collapses to zero width on desktop too, instead of just
          // sliding off — so closed actually gives the page the space
          // back rather than leaving an empty gap.
          !isOpen && 'lg:w-0 lg:border-r-0 lg:overflow-hidden',
        )}
      >
        <div className="flex items-center gap-2 border-b border-arena-border px-5 py-5 pl-16 lg:pl-5">
          <div className="flex size-8 shrink-0 items-center justify-center rounded-md bg-arena-gold font-display text-sm font-bold text-[#15130a]">
            SA
          </div>
          <div className="overflow-hidden">
            <p className="truncate font-display text-sm font-semibold leading-tight text-arena-text">
              SkillForge
            </p>
            <p className="text-[10px] uppercase tracking-wider text-arena-text-dim">
              Arena
            </p>
          </div>
          {/* Desktop-only close control. Functionally the same as the
              fixed hamburger once it's open, just inline in the header
              for a more natural "collapse" affordance at desktop widths. */}
          <button
            onClick={() => setIsOpen(false)}
            aria-label="Collapse menu"
            className="ml-auto hidden size-7 shrink-0 items-center justify-center rounded-md text-arena-text-dim hover:bg-arena-surface-2 hover:text-arena-text lg:flex"
          >
            <X className="size-4" />
          </button>
        </div>

        {variant === 'admin' && (
          <div className="flex items-center gap-2 border-b border-arena-border bg-arena-gold/5 px-5 py-2.5">
            <Shield className="size-3.5 shrink-0 text-arena-gold" />
            <span className="truncate text-xs font-medium text-arena-gold">
              {profile?.admin_role ? ADMIN_ROLE_LABEL[profile.admin_role] : 'Admin console'}
            </span>
          </div>
        )}

        <nav className="flex-1 overflow-y-auto px-3 py-4">
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
                    <Icon className="size-4 shrink-0" />
                    <span className="truncate">{item.label}</span>
                  </Link>
                </li>
              )
            })}
          </ul>
        </nav>

        <div className="border-t border-arena-border p-3">
          <div className="mb-2 flex items-center gap-2 rounded-md px-3 py-2">
            <div className="flex size-8 shrink-0 items-center justify-center rounded-full bg-arena-surface-2 font-display text-xs font-semibold text-arena-gold">
              {profile?.username?.slice(0, 2).toUpperCase() ?? '··'}
            </div>
            <div className="overflow-hidden">
              <p className="truncate text-sm font-medium text-arena-text">
                {profile?.username ?? 'Loading…'}
              </p>
              <p className="truncate text-[10px] capitalize text-arena-text-dim">
                {profile?.role === 'admin'
                  ? profile.admin_role
                    ? ADMIN_ROLE_LABEL[profile.admin_role]
                    : 'admin'
                  : profile?.role ?? ''}
              </p>
            </div>
          </div>
          <button
            onClick={() => signOut()}
            className="flex w-full items-center gap-3 rounded-md px-3 py-2 text-sm font-medium text-arena-text-dim transition-colors hover:bg-arena-red/10 hover:text-arena-red"
          >
            <LogOut className="size-4 shrink-0" />
            Sign out
          </button>
        </div>
      </aside>
    </>
  )
}
