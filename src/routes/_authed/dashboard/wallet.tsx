import * as React from 'react'
import { createFileRoute } from '@tanstack/react-router'
import {
  ArrowDownToLine,
  ArrowUpFromLine,
  Loader2,
  Trophy,
  Undo2,
} from 'lucide-react'
import { Card, CardContent, CardHeader, CardTitle } from '#/components/ui/card'
import { Badge } from '#/components/ui/badge'
import { Button } from '#/components/ui/button'
import { MpesaDialog } from '#/components/dashboard/mpesa-dialog'
import { useAuth } from '#/lib/auth-context'
import { supabase } from '#/utils/supabase'
import { formatKes, formatRelativeTime } from '#/utils/format'
import type { Database } from '#/types/database.types'

export const Route = createFileRoute('/_authed/dashboard/wallet')({
  component: WalletPage,
})

type Transaction = Database['public']['Tables']['transactions']['Row']

const TYPE_META: Record<
  Transaction['type'],
  { label: string; icon: typeof ArrowDownToLine; badge: 'emerald' | 'gold' | 'red' | 'default' }
> = {
  deposit: { label: 'Deposit', icon: ArrowDownToLine, badge: 'emerald' },
  withdrawal: { label: 'Withdrawal', icon: ArrowUpFromLine, badge: 'gold' },
  stake: { label: 'Stake', icon: ArrowUpFromLine, badge: 'red' },
  payout: { label: 'Payout', icon: Trophy, badge: 'emerald' },
  refund: { label: 'Refund', icon: Undo2, badge: 'default' },
}

function WalletPage() {
  const { user, wallet } = useAuth()
  const [transactions, setTransactions] = React.useState<Array<Transaction>>([])
  const [isLoading, setIsLoading] = React.useState(true)
  const [dialogMode, setDialogMode] = React.useState<'deposit' | 'withdraw' | null>(null)

  React.useEffect(() => {
    if (!user?.id) return
    let isMounted = true

    supabase
      .from('transactions')
      .select('*')
      .eq('user_id', user.id)
      .order('created_at', { ascending: false })
      .limit(25)
      .then(({ data }) => {
        if (isMounted) {
          setTransactions(data ?? [])
          setIsLoading(false)
        }
      })

    return () => {
      isMounted = false
    }
  }, [user?.id])

  return (
    <div>
      <div className="mb-6">
        <p className="font-mono text-xs uppercase tracking-[0.2em] text-arena-gold">
          Wallet
        </p>
        <h1 className="mt-1 font-display text-2xl font-semibold text-arena-text">
          Balance & transactions
        </h1>
      </div>

      <div className="mb-6 grid grid-cols-1 gap-4 sm:grid-cols-3">
        <Card>
          <CardHeader>
            <CardTitle className="text-sm text-arena-text-dim">Available balance</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="font-mono text-3xl font-semibold text-arena-gold tabular">
              {formatKes(wallet?.balance_cents ?? 0)}
            </p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle className="text-sm text-arena-text-dim">Locked in matches</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="font-mono text-3xl font-semibold text-arena-text tabular">
              {formatKes(wallet?.locked_cents ?? 0)}
            </p>
          </CardContent>
        </Card>
        <Card className="flex flex-col justify-center gap-2 p-5">
          <Button variant="emerald" onClick={() => setDialogMode('deposit')}>
            <ArrowDownToLine className="size-4" />
            Deposit
          </Button>
          <Button variant="outline" onClick={() => setDialogMode('withdraw')}>
            <ArrowUpFromLine className="size-4" />
            Withdraw
          </Button>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Recent transactions</CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          {isLoading ? (
            <div className="flex items-center justify-center gap-2 py-10 text-sm text-arena-text-dim">
              <Loader2 className="size-4 animate-spin" />
              Loading transactions…
            </div>
          ) : transactions.length === 0 ? (
            <div className="px-5 py-10 text-center text-sm text-arena-text-dim">
              No transactions yet. Make your first deposit to get started.
            </div>
          ) : (
            <ul className="divide-y divide-arena-border">
              {transactions.map((tx) => {
                const meta = TYPE_META[tx.type]
                const Icon = meta.icon
                const isCredit = tx.type === 'deposit' || tx.type === 'payout' || tx.type === 'refund'
                return (
                  <li key={tx.id} className="flex items-center justify-between px-5 py-3">
                    <div className="flex items-center gap-3">
                      <div className="flex size-9 items-center justify-center rounded-full bg-arena-surface-2">
                        <Icon className="size-4 text-arena-text-dim" />
                      </div>
                      <div>
                        <p className="text-sm font-medium text-arena-text">{meta.label}</p>
                        <p className="text-xs text-arena-text-dim">
                          {formatRelativeTime(tx.created_at)}
                        </p>
                      </div>
                    </div>
                    <div className="text-right">
                      <p
                        className={`font-mono text-sm font-semibold tabular ${
                          isCredit ? 'text-arena-emerald' : 'text-arena-text'
                        }`}
                      >
                        {isCredit ? '+' : '−'}
                        {formatKes(tx.amount_cents)}
                      </p>
                      <Badge variant={meta.badge} className="mt-1">
                        {tx.status}
                      </Badge>
                    </div>
                  </li>
                )
              })}
            </ul>
          )}
        </CardContent>
      </Card>

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
