import * as React from 'react'
import { createFileRoute, redirect } from '@tanstack/react-router'
import { Loader2, Wallet as WalletIcon } from 'lucide-react'
import { Card, CardContent, CardHeader, CardTitle } from '#/components/ui/card'
import { Badge } from '#/components/ui/badge'
import { Button } from '#/components/ui/button'
import { Tabs, TabsList, TabsTrigger } from '#/components/ui/tabs'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '#/components/ui/dialog'
import { Input } from '#/components/ui/input'
import { Label } from '#/components/ui/label'
import { StatCard } from '#/components/dashboard/stat-card'
import { supabase } from '#/utils/supabase'
import { formatKes, formatRelativeTime } from '#/utils/format'
import { useAuth } from '#/lib/auth-context'
import type { Database, TransactionType } from '#/types/database.types'

export const Route = createFileRoute('/_authed/admin/finance')({
  beforeLoad: async () => {
    const { data: sessionData } = await supabase.auth.getSession()
    const userId = sessionData.session?.user.id
    if (!userId) throw redirect({ to: '/signin' })

    const { data: profile } = await supabase
      .from('profiles')
      .select('admin_role, admin_status')
      .eq('id', userId)
      .single()

    const allowed =
      profile?.admin_status === 'approved' &&
      (profile.admin_role === 'super_admin' || profile.admin_role === 'finance_manager')

    if (!allowed) throw redirect({ to: '/admin' })
  },
  component: AdminFinancePage,
})

type Transaction = Database['public']['Tables']['transactions']['Row'] & {
  profiles: { username: string } | null
}

const FILTERS: Array<{ value: TransactionType | 'all'; label: string }> = [
  { value: 'all', label: 'All' },
  { value: 'deposit', label: 'Deposits' },
  { value: 'withdrawal', label: 'Withdrawals' },
  { value: 'stake', label: 'Stakes' },
  { value: 'payout', label: 'Payouts' },
  { value: 'refund', label: 'Refunds' },
]

function AdminFinancePage() {
  const { can } = useAuth()
  const canWithdraw = can('withdraw_funds')

  const [transactions, setTransactions] = React.useState<Array<Transaction>>([])
  const [isLoading, setIsLoading] = React.useState(true)
  const [filter, setFilter] = React.useState<TransactionType | 'all'>('all')
  const [withdrawOpen, setWithdrawOpen] = React.useState(false)

  React.useEffect(() => {
    let isMounted = true

    supabase
      .from('transactions')
      .select('*, profiles(username)')
      .order('created_at', { ascending: false })
      .limit(200)
      .then(({ data }) => {
        if (isMounted) {
          setTransactions((data as Array<Transaction>) ?? [])
          setIsLoading(false)
        }
      })

    return () => {
      isMounted = false
    }
  }, [])

  const filtered =
    filter === 'all' ? transactions : transactions.filter((tx) => tx.type === filter)

  const ledgerTotals = React.useMemo(() => {
    const totals = { deposits: 0, withdrawals: 0, stakes: 0, payouts: 0 }
    for (const tx of transactions) {
      if (tx.status !== 'completed') continue
      if (tx.type === 'deposit') totals.deposits += tx.amount_cents
      if (tx.type === 'withdrawal') totals.withdrawals += tx.amount_cents
      if (tx.type === 'stake') totals.stakes += tx.amount_cents
      if (tx.type === 'payout') totals.payouts += tx.amount_cents
    }
    return totals
  }, [transactions])

  return (
    <div>
      <div className="mb-6 flex items-center justify-between">
        <div>
          <p className="font-mono text-xs uppercase tracking-[0.2em] text-arena-gold">
            Admin console · Finance
          </p>
          <h1 className="mt-1 font-display text-2xl font-semibold text-arena-text">
            Ledgers &amp; transactions
          </h1>
          <p className="mt-1 text-sm text-arena-text-dim">
            Full statement of M-Pesa deposits, withdrawals, stakes, payouts and refunds.
          </p>
        </div>
        {canWithdraw && (
          <Button onClick={() => setWithdrawOpen(true)}>
            <WalletIcon className="size-4" />
            Withdraw from platform account
          </Button>
        )}
      </div>

      <div className="mb-6 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard label="Total deposits" value={formatKes(ledgerTotals.deposits)} icon={WalletIcon} accent="emerald" />
        <StatCard label="Total withdrawals" value={formatKes(ledgerTotals.withdrawals)} icon={WalletIcon} accent="gold" />
        <StatCard label="Total staked" value={formatKes(ledgerTotals.stakes)} icon={WalletIcon} accent="default" />
        <StatCard label="Total paid out" value={formatKes(ledgerTotals.payouts)} icon={WalletIcon} accent="default" />
      </div>

      <Tabs value={filter} onValueChange={(v) => setFilter(v as TransactionType | 'all')} className="mb-4">
        <TabsList>
          {FILTERS.map((f) => (
            <TabsTrigger key={f.value} value={f.value}>
              {f.label}
            </TabsTrigger>
          ))}
        </TabsList>
      </Tabs>

      <Card>
        <CardHeader>
          <CardTitle>{filtered.length} transactions</CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          {isLoading ? (
            <div className="flex items-center justify-center gap-2 py-10 text-sm text-arena-text-dim">
              <Loader2 className="size-4 animate-spin" />
              Loading ledger…
            </div>
          ) : filtered.length === 0 ? (
            <div className="px-5 py-10 text-center text-sm text-arena-text-dim">
              No transactions in this category.
            </div>
          ) : (
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-arena-border text-left text-xs uppercase tracking-wider text-arena-text-dim">
                  <th className="px-5 py-3 font-medium">Player</th>
                  <th className="px-5 py-3 font-medium">Type</th>
                  <th className="px-5 py-3 font-medium">Amount</th>
                  <th className="px-5 py-3 font-medium">M-Pesa receipt</th>
                  <th className="px-5 py-3 font-medium">Status</th>
                  <th className="px-5 py-3 font-medium">When</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-arena-border">
                {filtered.map((tx) => (
                  <tr key={tx.id}>
                    <td className="px-5 py-3 text-arena-text">
                      @{tx.profiles?.username ?? 'unknown'}
                    </td>
                    <td className="px-5 py-3 capitalize text-arena-text-dim">{tx.type}</td>
                    <td className="px-5 py-3 font-mono text-arena-text tabular">
                      {formatKes(tx.amount_cents)}
                    </td>
                    <td className="px-5 py-3 font-mono text-xs text-arena-text-dim">
                      {tx.mpesa_receipt ?? '—'}
                    </td>
                    <td className="px-5 py-3">
                      <Badge
                        variant={
                          tx.status === 'completed'
                            ? 'emerald'
                            : tx.status === 'failed'
                              ? 'red'
                              : 'gold'
                        }
                      >
                        {tx.status}
                      </Badge>
                    </td>
                    <td className="px-5 py-3 text-arena-text-dim">
                      {formatRelativeTime(tx.created_at)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </CardContent>
      </Card>

      {canWithdraw && (
        <WithdrawDialog open={withdrawOpen} onOpenChange={setWithdrawOpen} />
      )}
    </div>
  )
}

function WithdrawDialog({
  open,
  onOpenChange,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
}) {
  const [amount, setAmount] = React.useState('')
  const [destinationPhone, setDestinationPhone] = React.useState('')
  const [isSubmitting, setIsSubmitting] = React.useState(false)

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setIsSubmitting(true)
    // NOTE: This is a UI stub, same as the player-facing M-Pesa dialog. A
    // platform-level withdrawal must be triggered from a trusted backend
    // (Daraja B2C, holding the consumer key/secret) and should itself be
    // logged as a `transactions` row of type 'withdrawal' by that backend
    // — never written directly by the browser. Wire this button to a
    // Supabase Edge Function once that payments service exists.
    await new Promise((resolve) => setTimeout(resolve, 900))
    setIsSubmitting(false)
    onOpenChange(false)
    setAmount('')
    setDestinationPhone('')
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Withdraw from platform account</DialogTitle>
          <DialogDescription>
            Moves funds out of the platform&rsquo;s float to an M-Pesa number. This is restricted
            to super admins.
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="flex flex-col gap-4">
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="destinationPhone">Destination M-Pesa number</Label>
            <Input
              id="destinationPhone"
              type="tel"
              inputMode="numeric"
              placeholder="07XX XXX XXX"
              value={destinationPhone}
              onChange={(e) => setDestinationPhone(e.target.value)}
              required
            />
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="amount">Amount (KES)</Label>
            <Input
              id="amount"
              type="number"
              min={1}
              placeholder="0.00"
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
              required
            />
          </div>
          <DialogFooter>
            <Button type="submit" disabled={isSubmitting} className="w-full">
              {isSubmitting ? <Loader2 className="size-4 animate-spin" /> : <WalletIcon className="size-4" />}
              Confirm withdrawal
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
