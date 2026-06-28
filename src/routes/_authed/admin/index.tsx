import * as React from 'react'
import { createFileRoute } from '@tanstack/react-router'
import { Gamepad2, Loader2, Users, Wallet } from 'lucide-react'
import { StatCard } from '#/components/dashboard/stat-card'
import { Card, CardContent, CardHeader, CardTitle } from '#/components/ui/card'
import { Badge } from '#/components/ui/badge'
import { supabase } from '#/utils/supabase'
import { formatKes, formatRelativeTime } from '#/utils/format'
import { useAuth } from '#/lib/auth-context'
import { ADMIN_ROLE_LABEL } from '#/lib/admin-permissions'
import type { Database } from '#/types/database.types'

export const Route = createFileRoute('/_authed/admin/')({
  component: AdminOverview,
})

type Transaction = Database['public']['Tables']['transactions']['Row']

function AdminOverview() {
  const { profile, can } = useAuth()
  const canSeeFinance = can('financial_records')

  const [isLoading, setIsLoading] = React.useState(true)
  const [stats, setStats] = React.useState({
    totalUsers: 0,
    activeMatches: 0,
    totalPotCents: 0,
    pendingWithdrawals: 0,
  })
  const [recentTx, setRecentTx] = React.useState<Array<Transaction>>([])

  React.useEffect(() => {
    let isMounted = true

    async function load() {
      const [usersCount, activeMatchesCount] = await Promise.all([
        supabase.from('profiles').select('id', { count: 'exact', head: true }),
        supabase
          .from('matches')
          .select('id', { count: 'exact', head: true })
          .in('status', ['filling', 'in_progress']),
      ])

      let totalPotCents = 0
      let pendingWithdrawals = 0
      let recentTx: Array<Transaction> = []

      if (canSeeFinance) {
        const [potSum, pendingWithdrawalsCount, recentTxRes] = await Promise.all([
          supabase.from('matches').select('pot_cents'),
          supabase
            .from('transactions')
            .select('id', { count: 'exact', head: true })
            .eq('type', 'withdrawal')
            .eq('status', 'pending'),
          supabase
            .from('transactions')
            .select('*')
            .order('created_at', { ascending: false })
            .limit(8),
        ])

        totalPotCents = (potSum.data ?? []).reduce(
          (sum, row) => sum + (row.pot_cents ?? 0),
          0,
        )
        pendingWithdrawals = pendingWithdrawalsCount.count ?? 0
        recentTx = (recentTxRes.data as Array<Transaction>) ?? []
      }

      if (isMounted) {
        setStats({
          totalUsers: usersCount.count ?? 0,
          activeMatches: activeMatchesCount.count ?? 0,
          totalPotCents,
          pendingWithdrawals,
        })
        setRecentTx(recentTx)
        setIsLoading(false)
      }
    }

    load()
    return () => {
      isMounted = false
    }
  }, [canSeeFinance])

  return (
    <div>
      <div className="mb-6">
        <p className="font-mono text-xs uppercase tracking-[0.2em] text-arena-gold">
          Admin console{profile?.admin_role ? ` · ${ADMIN_ROLE_LABEL[profile.admin_role]}` : ''}
        </p>
        <h1 className="mt-1 font-display text-2xl font-semibold text-arena-text">
          Platform overview
        </h1>
      </div>

      {isLoading ? (
        <div className="flex items-center justify-center gap-2 py-16 text-sm text-arena-text-dim">
          <Loader2 className="size-4 animate-spin" />
          Loading platform stats…
        </div>
      ) : (
        <>
          <div className="mb-6 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <StatCard label="Registered players" value={stats.totalUsers.toString()} icon={Users} accent="gold" />
            <StatCard label="Active matches" value={stats.activeMatches.toString()} icon={Gamepad2} accent="emerald" />
            {canSeeFinance && (
              <>
                <StatCard label="Total pot in play" value={formatKes(stats.totalPotCents)} icon={Wallet} accent="gold" />
                <StatCard
                  label="Pending withdrawals"
                  value={stats.pendingWithdrawals.toString()}
                  icon={Wallet}
                  accent={stats.pendingWithdrawals > 0 ? 'red' : 'default'}
                />
              </>
            )}
          </div>

          {canSeeFinance && (
            <Card>
              <CardHeader>
                <CardTitle>Recent platform transactions</CardTitle>
              </CardHeader>
              <CardContent className="p-0">
                {recentTx.length === 0 ? (
                  <div className="px-5 py-10 text-center text-sm text-arena-text-dim">
                    No transactions recorded yet.
                  </div>
                ) : (
                  <ul className="divide-y divide-arena-border">
                    {recentTx.map((tx) => (
                      <li key={tx.id} className="flex items-center justify-between px-5 py-3">
                        <div>
                          <p className="text-sm font-medium capitalize text-arena-text">{tx.type}</p>
                          <p className="text-xs text-arena-text-dim">
                            {formatRelativeTime(tx.created_at)}
                          </p>
                        </div>
                        <div className="text-right">
                          <p className="font-mono text-sm font-semibold text-arena-text tabular">
                            {formatKes(tx.amount_cents)}
                          </p>
                          <Badge
                            variant={
                              tx.status === 'completed'
                                ? 'emerald'
                                : tx.status === 'failed'
                                  ? 'red'
                                  : 'gold'
                            }
                            className="mt-1"
                          >
                            {tx.status}
                          </Badge>
                        </div>
                      </li>
                    ))}
                  </ul>
                )}
              </CardContent>
            </Card>
          )}
        </>
      )}
    </div>
  )
}
