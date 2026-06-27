import * as React from 'react'
import { Outlet, createFileRoute } from '@tanstack/react-router'
import { Sidebar } from '#/components/layout/sidebar'
import { WalletHud } from '#/components/dashboard/wallet-hud'
import { MpesaDialog } from '#/components/dashboard/mpesa-dialog'
import { useAuth } from '#/lib/auth-context'

export const Route = createFileRoute('/_authed/dashboard')({
  component: DashboardLayout,
})

function DashboardLayout() {
  const { wallet } = useAuth()
  const [dialogMode, setDialogMode] = React.useState<'deposit' | 'withdraw' | null>(null)

  return (
    <div className="flex bg-arena-bg">
      <Sidebar variant="player" />

      <div className="flex min-h-screen flex-1 flex-col">
        <header className="flex items-center justify-end border-b border-arena-border bg-arena-surface px-6 py-3">
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
