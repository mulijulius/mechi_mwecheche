import { createFileRoute } from '@tanstack/react-router'
import { GameCard } from '#/components/dashboard/game-card'
import { GAME_CATALOGUE } from '#/lib/game-catalogue'
import { useAuth } from '#/lib/auth-context'

export const Route = createFileRoute('/_authed/dashboard/')({
  component: DashboardFloor,
})

function DashboardFloor() {
  const { profile } = useAuth()

  return (
    <div>
      <div className="mb-6">
        <p className="font-mono text-xs uppercase tracking-[0.2em] text-arena-gold">
          Game floor
        </p>
        <h1 className="mt-1 font-display text-2xl font-semibold text-arena-text">
          {profile?.username ? `Welcome back, ${profile.username}` : 'Welcome back'}
        </h1>
        <p className="mt-1 text-sm text-arena-text-dim">
          Pick a table. Game boards and live matchmaking are launching soon —
          for now, browse stakes and player counts across all five games.
        </p>
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {GAME_CATALOGUE.map((game) => (
          <GameCard key={game.slug} game={game} liveTables={0} livePlayers={0} />
        ))}
      </div>
    </div>
  )
}
