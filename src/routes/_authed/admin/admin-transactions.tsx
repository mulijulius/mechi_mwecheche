import * as React from 'react'
import { createFileRoute, redirect } from '@tanstack/react-router'
import { Loader2 } from 'lucide-react'
import { Card, CardContent, CardHeader, CardTitle } from '#/components/ui/card'
import { Badge } from '#/components/ui/badge'
import { Tabs, TabsList, TabsTrigger } from '#/components/ui/tabs'
import { supabase } from '#/utils/supabase'
import { formatKes, formatRelativeTime } from '#/utils/format'
import type { Database, TransactionType } from '#/types/database.types'

export const Route = createFileRoute('/_authed/admin/transactions')({
  beforeLoad: async () => {
    const { data: sessionData } = await supabase.auth.getSession()
    const userId = sessionData.session?.user.id
    if (!userId) throw redirect({ to: '/signin' })

    const { data: profile } = await supabase
      .from('profiles')
      .select('admin_role, admin_status')
      .eq('id', userId)
      .single()

    // Kept as a super-admin shortcut; finance managers use the dedicated
    // /admin/finance page which also exposes ledger totals and withdrawals.
    const allowed = profile?.admin_status === 'approved' && profile.admin_role === 'super_admin'
    if (!allowed) throw redirect({ to: '/admin/finance' })
  },
  component: AdminTransactionsPage,
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
]

function AdminTransactionsPage() {
  const [transactions, setTransactions] = React.useState<Array<Transaction>>([])
  const [isLoading, setIsLoading] = React.useState(true)
  const [filter, setFilter] = React.useState<TransactionType | 'all'>('all')

  React.useEffect(() => {
    let isMounted = true

    supabase
      .from('transactions')
      .select('*, profiles(username)')
      .order('created_at', { ascending: false })
      .limit(100)
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

  return (
    <div>
      <div className="mb-6">
        <p className="font-mono text-xs uppercase tracking-[0.2em] text-arena-gold">
          Admin console
        </p>
        <h1 className="mt-1 font-display text-2xl font-semibold text-arena-text">
          Transactions
        </h1>
        <p className="mt-1 text-sm text-arena-text-dim">
          Full ledger of M-Pesa deposits, withdrawals, stakes and payouts.
        </p>
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
              Loading transactions…
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
    </div>
  )
}
