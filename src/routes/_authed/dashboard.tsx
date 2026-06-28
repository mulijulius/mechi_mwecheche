import * as React from 'react'
import { Outlet, createFileRoute } from '@tanstack/react-router'
import { Sidebar } from '#/components/layout/sidebar'
import { SidebarProvider, useSidebar } from '#/lib/sidebar-context'
import { WalletHud } from '#/components/dashboard/wallet-hud'
import { MpesaDialog } from '#/components/dashboard/mpesa-dialog'
import { useAuth } from '#/lib/auth-context'
import { cn } from '#/lib/utils'

export const Route = createFileRoute('/_authed/dashboard')({
  component: DashboardLayout,
})

function DashboardLayout() {
  return (
    <SidebarProvider>
      <DashboardLayoutContent />
    </SidebarProvider>
  )
}

function DashboardLayoutContent() {
  const { wallet } = useAuth()
  const { isOpen } = useSidebar()
  const [dialogMode, setDialogMode] = React.useState<'deposit' | 'withdraw' | null>(null)

  return (
    <div className="flex bg-arena-bg">
      <Sidebar variant="player" />

      <div className="flex min-h-screen min-w-0 flex-1 flex-col">
        <header
          className={cn(
            'flex items-center justify-end gap-3 border-b border-arena-border bg-arena-surface px-6 py-3 pl-16',
            // Same reasoning as the admin layout: only reserve room for
            // the floating hamburger when it's actually visible, i.e.
            // whenever the sidebar is closed — at any screen width.
            !isOpen && 'lg:pl-16',
            isOpen && 'lg:pl-6',
          )}
        >
          <WalletHud
            balanceCents={wallet?.balance_cents ?? 0}
            lockedCents={wallet?.locked_cents ?? 0}
            onDeposit={() => setDialogMode('deposit')}
            onWithdraw={() => setDialogMode('withdraw')}
          />
        </header>

        <main className="flex-1 p-6">
          <Outlet />
        </main>
      </div>

      {dialogMode && (
        <MpesaDialog
          mode={dialogMode}
          open={dialogMode !== null}
          onOpenChange={(open) => !open && setDialogMode(null)}
        />
      )}
    </div>
  )
}
