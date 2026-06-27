import { Users } from 'lucide-react'
import { Badge } from '#/components/ui/badge'
import { Button } from '#/components/ui/button'
import { Card } from '#/components/ui/card'
import type { GameMeta } from '#/lib/game-catalogue'

interface GameCardProps {
  game: GameMeta
  liveTables?: number
  livePlayers?: number
}

export function GameCard({ game, liveTables = 0, livePlayers = 0 }: GameCardProps) {
  return (
    <Card className="group relative overflow-hidden p-0 transition-colors hover:border-[var(--accent)]"
      style={{ '--accent': `var(${game.accentVar})` } as React.CSSProperties}
    >
      {/* Placard top bar */}
      <div
        className="h-1 w-full"
        style={{ backgroundColor: `var(${game.accentVar})` }}
      />

      <div className="p-5">
        <div className="flex items-start justify-between gap-3">
          <div className="flex items-center gap-3">
            <div
              className="flex size-11 shrink-0 items-center justify-center rounded-lg border text-xl"
              style={{
                borderColor: `var(${game.accentVar})`,
                color: `var(${game.accentVar})`,
                backgroundColor: `color-mix(in srgb, var(${game.accentVar}) 12%, transparent)`,
              }}
              aria-hidden="true"
            >
              {game.glyph}
            </div>
            <div>
              <h3 className="font-display text-base font-semibold text-arena-text">
                {game.name}
              </h3>
              <p className="text-xs text-arena-text-dim">{game.tagline}</p>
            </div>
          </div>
        </div>

        <div className="mt-4 flex items-center gap-4 text-xs text-arena-text-dim">
          <span className="tabular">
            {game.minPlayers === game.maxPlayers
              ? `${game.minPlayers} players`
              : `${game.minPlayers}–${game.maxPlayers} players`}
          </span>
          <span className="flex items-center gap-1 tabular">
            <Users className="size-3.5" />
            {livePlayers} online
          </span>
        </div>

        <div className="mt-4 flex items-center justify-between border-t border-arena-border pt-4">
          <div>
            <p className="text-[10px] uppercase tracking-wider text-arena-text-dim">
              From
            </p>
            <p className="font-mono text-sm font-semibold text-arena-gold tabular">
              KES {game.minStakeKes}
            </p>
          </div>
          <Badge variant={liveTables > 0 ? 'emerald' : 'default'}>
            {liveTables > 0 ? `${liveTables} open tables` : 'No open tables'}
          </Badge>
        </div>

        <Button className="mt-4 w-full" size="sm" disabled>
          Coming soon
        </Button>
      </div>
    </Card>
  )
}
