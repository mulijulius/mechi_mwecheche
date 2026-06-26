import * as React from 'react'
import { createFileRoute } from '@tanstack/react-router'
import { Loader2, Search, Shield, ShieldOff } from 'lucide-react'
import { Card, CardContent, CardHeader, CardTitle } from '#/components/ui/card'
import { Badge } from '#/components/ui/badge'
import { Input } from '#/components/ui/input'
import { Avatar, AvatarFallback } from '#/components/ui/avatar'
import { Button } from '#/components/ui/button'
import { supabase } from '#/utils/supabase'
import { formatKes, formatRelativeTime } from '#/utils/format'
import type { Database } from '#/types/database.types'

export const Route = createFileRoute('/_authed/admin/users')({
  component: AdminUsersPage,
})

type Profile = Database['public']['Tables']['profiles']['Row']
type Wallet = Database['public']['Tables']['wallets']['Row']

interface PlayerRow extends Profile {
  wallet: Wallet | null
}

function AdminUsersPage() {
  const [players, setPlayers] = React.useState<Array<PlayerRow>>([])
  const [isLoading, setIsLoading] = React.useState(true)
  const [query, setQuery] = React.useState('')

  React.useEffect(() => {
    let isMounted = true

    async function load() {
      const { data: profiles } = await supabase
        .from('profiles')
        .select('*')
        .order('created_at', { ascending: false })

      const { data: wallets } = await supabase.from('wallets').select('*')

      if (isMounted) {
        const walletByUser = new Map((wallets ?? []).map((w) => [w.user_id, w]))
        setPlayers(
          (profiles ?? []).map((p) => ({ ...p, wallet: walletByUser.get(p.id) ?? null })),
        )
        setIsLoading(false)
      }
    }

    load()
    return () => {
      isMounted = false
    }
  }, [])

  const filtered = players.filter(
    (p) =>
      p.username.toLowerCase().includes(query.toLowerCase()) ||
      (p.full_name ?? '').toLowerCase().includes(query.toLowerCase()),
  )

  return (
    <div>
      <div className="mb-6 flex items-center justify-between">
        <div>
          <p className="font-mono text-xs uppercase tracking-[0.2em] text-arena-gold">
            Admin console
          </p>
          <h1 className="mt-1 font-display text-2xl font-semibold text-arena-text">
            Players
          </h1>
        </div>
      </div>

      <div className="mb-4 relative max-w-sm">
        <Search className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-arena-text-dim" />
        <Input
          placeholder="Search by name or username…"
          className="pl-9"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
        />
      </div>

      <Card>
        <CardHeader>
          <CardTitle>All players ({filtered.length})</CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          {isLoading ? (
            <div className="flex items-center justify-center gap-2 py-10 text-sm text-arena-text-dim">
              <Loader2 className="size-4 animate-spin" />
              Loading players…
            </div>
          ) : filtered.length === 0 ? (
            <div className="px-5 py-10 text-center text-sm text-arena-text-dim">
              No players match your search.
            </div>
          ) : (
            <ul className="divide-y divide-arena-border">
              {filtered.map((player) => (
                <li key={player.id} className="flex items-center justify-between px-5 py-3">
                  <div className="flex items-center gap-3">
                    <Avatar>
                      <AvatarFallback>
                        {player.username.slice(0, 2).toUpperCase()}
                      </AvatarFallback>
                    </Avatar>
                    <div>
                      <p className="flex items-center gap-2 text-sm font-medium text-arena-text">
                        {player.full_name || player.username}
                        {player.role === 'admin' && (
                          <Badge variant="gold">admin</Badge>
                        )}
                      </p>
                      <p className="text-xs text-arena-text-dim">
                        @{player.username} · joined {formatRelativeTime(player.created_at)}
                      </p>
                    </div>
                  </div>

                  <div className="flex items-center gap-4">
                    <div className="text-right">
                      <p className="font-mono text-sm font-semibold text-arena-text tabular">
                        {formatKes(player.wallet?.balance_cents ?? 0)}
                      </p>
                      <Badge
                        variant={
                          player.status === 'active'
                            ? 'emerald'
                            : player.status === 'suspended'
                              ? 'gold'
                              : 'red'
                        }
                      >
                        {player.status}
                      </Badge>
                    </div>
                    <Button variant="ghost" size="icon" title="Toggle suspension">
                      {player.status === 'active' ? (
                        <ShieldOff className="size-4 text-arena-red" />
                      ) : (
                        <Shield className="size-4 text-arena-emerald" />
                      )}
                    </Button>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>
    </div>
  )
}
