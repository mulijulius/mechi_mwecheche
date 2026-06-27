import * as React from 'react'
import { createFileRoute } from '@tanstack/react-router'
import { Loader2, Trophy } from 'lucide-react'
import { Card, CardContent, CardHeader, CardTitle } from '#/components/ui/card'
import { Badge } from '#/components/ui/badge'
import { useAuth } from '#/lib/auth-context'
import { supabase } from '#/utils/supabase'
import { formatKes, formatRelativeTime } from '#/utils/format'
import { GAME_CATALOGUE } from '#/lib/game-catalogue'
import type { Database, MatchStatus } from '#/types/database.types'

export const Route = createFileRoute('/_authed/dashboard/history')({
  component: HistoryPage,
})

type Match = Database['public']['Tables']['matches']['Row'] & {
  games: Database['public']['Tables']['games']['Row'] | null
}

const STATUS_BADGE: Record<MatchStatus, 'gold' | 'emerald' | 'red' | 'default'> = {
  open: 'default',
  filling: 'gold',
  in_progress: 'emerald',
  completed: 'default',
  cancelled: 'red',
}

function HistoryPage() {
  const { user } = useAuth()
  const [matches, setMatches] = React.useState<Array<Match>>([])
  const [isLoading, setIsLoading] = React.useState(true)

  React.useEffect(() => {
    if (!user?.id) return
    let isMounted = true

    async function load() {
      // Matches the user hosted or was seated in
      const { data: seatedMatchIds } = await supabase
        .from('match_players')
        .select('match_id')
        .eq('user_id', user!.id)

      const matchIds = (seatedMatchIds ?? []).map((row) => row.match_id)

      const { data } = await supabase
        .from('matches')
        .select('*, games(*)')
        .or(
          matchIds.length > 0
            ? `host_id.eq.${user!.id},id.in.(${matchIds.join(',')})`
            : `host_id.eq.${user!.id}`,
        )
        .order('created_at', { ascending: false })
        .limit(25)

      if (isMounted) {
        setMatches((data as Array<Match>) ?? [])
        setIsLoading(false)
      }
    }

    load()
    return () => {
      isMounted = false
    }
  }, [user?.id])

  return (
    <div>
      <div className="mb-6">
        <p className="font-mono text-xs uppercase tracking-[0.2em] text-arena-gold">
          History
        </p>
        <h1 className="mt-1 font-display text-2xl font-semibold text-arena-text">
          Match history
        </h1>
        <p className="mt-1 text-sm text-arena-text-dim">
          Every table you've hosted or joined, win or lose.
        </p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>All matches</CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          {isLoading ? (
            <div className="flex items-center justify-center gap-2 py-10 text-sm text-arena-text-dim">
              <Loader2 className="size-4 animate-spin" />
              Loading match history…
            </div>
          ) : matches.length === 0 ? (
            <div className="px-5 py-10 text-center text-sm text-arena-text-dim">
              No matches yet. Join a table from the game floor to get started.
            </div>
          ) : (
            <ul className="divide-y divide-arena-border">
              {matches.map((match) => {
                const gameMeta = GAME_CATALOGUE.find((g) => g.slug === match.games?.slug)
                const isWinner = match.winner_id === user?.id
                return (
                  <li key={match.id} className="flex items-center justify-between px-5 py-3">
                    <div className="flex items-center gap-3">
                      <div
                        className="flex size-9 items-center justify-center rounded-lg text-base"
                        style={{
                          backgroundColor: gameMeta
                            ? `color-mix(in srgb, var(${gameMeta.accentVar}) 12%, transparent)`
                            : undefined,
                          color: gameMeta ? `var(${gameMeta.accentVar})` : undefined,
                        }}
                      >
                        {gameMeta?.glyph ?? '?'}
                      </div>
                      <div>
                        <p className="text-sm font-medium text-arena-text">
                          {match.games?.name ?? 'Unknown game'}
                          {isWinner && (
                            <Trophy className="ml-1.5 inline size-3.5 text-arena-gold" />
                          )}
                        </p>
                        <p className="text-xs text-arena-text-dim">
                          {formatRelativeTime(match.created_at)}
                        </p>
                      </div>
                    </div>
                    <div className="text-right">
                      <p className="font-mono text-sm font-semibold text-arena-text tabular">
                        {formatKes(match.pot_cents || match.stake_cents)}
                      </p>
                      <Badge variant={STATUS_BADGE[match.status]} className="mt-1">
                        {match.status.replace('_', ' ')}
                      </Badge>
                    </div>
                  </li>
                )
              })}
            </ul>
          )}
        </CardContent>
      </Card>
    </div>
  )
}
