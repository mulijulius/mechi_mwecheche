import * as React from 'react'
import { createFileRoute } from '@tanstack/react-router'
import { Loader2 } from 'lucide-react'
import { Card, CardContent, CardHeader, CardTitle } from '#/components/ui/card'
import { Switch } from '#/components/ui/switch'
import { Badge } from '#/components/ui/badge'
import { supabase } from '#/utils/supabase'
import { GAME_CATALOGUE } from '#/lib/game-catalogue'
import type { Database } from '#/types/database.types'

export const Route = createFileRoute('/_authed/admin/games')({
  component: AdminGamesPage,
})

type Game = Database['public']['Tables']['games']['Row']

function AdminGamesPage() {
  const [games, setGames] = React.useState<Array<Game>>([])
  const [isLoading, setIsLoading] = React.useState(true)

  React.useEffect(() => {
    let isMounted = true

    supabase
      .from('games')
      .select('*')
      .order('name')
      .then(({ data }) => {
        if (isMounted) {
          setGames(data ?? [])
          setIsLoading(false)
        }
      })

    return () => {
      isMounted = false
    }
  }, [])

  async function toggleActive(game: Game) {
    setGames((prev) =>
      prev.map((g) => (g.id === game.id ? { ...g, is_active: !g.is_active } : g)),
    )
    await supabase.from('games').update({ is_active: !game.is_active }).eq('id', game.id)
  }

  return (
    <div>
      <div className="mb-6">
        <p className="font-mono text-xs uppercase tracking-[0.2em] text-arena-gold">
          Admin console
        </p>
        <h1 className="mt-1 font-display text-2xl font-semibold text-arena-text">
          Games
        </h1>
        <p className="mt-1 text-sm text-arena-text-dim">
          Enable or disable a game across the whole platform. Disabled games are hidden from the floor.
        </p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Game catalogue</CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          {isLoading ? (
            <div className="flex items-center justify-center gap-2 py-10 text-sm text-arena-text-dim">
              <Loader2 className="size-4 animate-spin" />
              Loading games…
            </div>
          ) : (
            <ul className="divide-y divide-arena-border">
              {games.map((game) => {
                const meta = GAME_CATALOGUE.find((g) => g.slug === game.slug)
                return (
                  <li key={game.id} className="flex items-center justify-between px-5 py-4">
                    <div className="flex items-center gap-3">
                      <div
                        className="flex size-10 items-center justify-center rounded-lg text-lg"
                        style={{
                          backgroundColor: meta
                            ? `color-mix(in srgb, var(${meta.accentVar}) 12%, transparent)`
                            : undefined,
                          color: meta ? `var(${meta.accentVar})` : undefined,
                        }}
                      >
                        {meta?.glyph ?? '?'}
                      </div>
                      <div>
                        <p className="text-sm font-medium text-arena-text">{game.name}</p>
                        <p className="text-xs text-arena-text-dim">
                          {game.min_players === game.max_players
                            ? `${game.min_players} players`
                            : `${game.min_players}–${game.max_players} players`}
                        </p>
                      </div>
                    </div>
                    <div className="flex items-center gap-3">
                      <Badge variant={game.is_active ? 'emerald' : 'red'}>
                        {game.is_active ? 'Live' : 'Disabled'}
                      </Badge>
                      <Switch
                        checked={game.is_active}
                        onCheckedChange={() => toggleActive(game)}
                      />
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
