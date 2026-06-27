import { Link, createFileRoute } from '@tanstack/react-router'
import { ArrowRight } from 'lucide-react'
import { Button } from '#/components/ui/button'
import { GAME_CATALOGUE } from '#/lib/game-catalogue'

export const Route = createFileRoute('/')({ component: Home })

function Home() {
  return (
    <div className="min-h-screen bg-arena-bg">
      {/* Nav */}
      <header className="flex items-center justify-between border-b border-arena-border px-6 py-4 lg:px-12">
        <div className="flex items-center gap-2">
          <div className="flex size-8 items-center justify-center rounded-md bg-arena-gold font-display text-sm font-bold text-[#15130a]">
            SA
          </div>
          <span className="font-display text-base font-semibold text-arena-text">
            SkillForge Arena
          </span>
        </div>
        <div className="flex items-center gap-3">
          <Link to="/signin">
            <Button variant="ghost" size="sm">
              Sign in
            </Button>
          </Link>
          <Link to="/signup">
            <Button size="sm">Create account</Button>
          </Link>
        </div>
      </header>

      {/* Hero */}
      <section className="relative overflow-hidden px-6 py-20 lg:px-12 lg:py-28">
        <div
          className="pointer-events-none absolute inset-0 opacity-[0.07]"
          style={{
            backgroundImage:
              'radial-gradient(circle at 15% 30%, var(--color-arena-gold) 0, transparent 30%), radial-gradient(circle at 85% 60%, var(--color-arena-emerald) 0, transparent 30%)',
          }}
        />
        <div className="relative mx-auto max-w-3xl text-center">
          <p className="mb-4 font-mono text-xs uppercase tracking-[0.2em] text-arena-gold">
            Live stakes · M-Pesa payouts
          </p>
          <h1 className="font-display text-5xl font-semibold leading-[1.05] text-arena-text lg:text-6xl">
            Five tables.
            <br />
            One winner each.
          </h1>
          <p className="mx-auto mt-6 max-w-xl text-base leading-relaxed text-arena-text-dim">
            Host or join real-money matches in Ludo, Checkers, Chess, Billiards
            and Solitaire. Deposit and withdraw instantly via M-Pesa. Stake
            held in escrow until the table closes.
          </p>
          <div className="mt-8 flex items-center justify-center gap-3">
            <Link to="/signup">
              <Button size="lg">
                Join the floor
                <ArrowRight className="size-4" />
              </Button>
            </Link>
            <Link to="/signin">
              <Button size="lg" variant="outline">
                Sign in
              </Button>
            </Link>
          </div>
        </div>
      </section>

      {/* Game floor preview */}
      <section className="border-t border-arena-border px-6 py-16 lg:px-12">
        <div className="mx-auto max-w-5xl">
          <p className="mb-1 font-mono text-xs uppercase tracking-[0.2em] text-arena-gold">
            The floor
          </p>
          <h2 className="mb-8 font-display text-2xl font-semibold text-arena-text">
            Five games, every table stakeable
          </h2>

          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-5">
            {GAME_CATALOGUE.map((game) => (
              <div
                key={game.slug}
                className="group overflow-hidden rounded-xl border border-arena-border bg-arena-surface transition-colors hover:border-[var(--accent)]"
                style={{ '--accent': `var(${game.accentVar})` } as React.CSSProperties}
              >
                {/* Game image */}
                <div className="relative h-32 w-full overflow-hidden bg-arena-surface">
                  <img
                    src={game.image}
                    alt={game.name}
                    className="h-full w-full object-cover transition-transform duration-300 group-hover:scale-105"
                  />
                  <div className="absolute inset-0 bg-gradient-to-t from-black/50 to-transparent" />
                </div>

                {/* Card body */}
                <div className="p-4 text-center">
                  <div
                    className="mx-auto mb-3 flex size-12 items-center justify-center rounded-lg text-xl"
                    style={{
                      backgroundColor: `color-mix(in srgb, var(${game.accentVar}) 12%, transparent)`,
                      color: `var(${game.accentVar})`,
                    }}
                  >
                    {game.glyph}
                  </div>
                  <p className="font-display text-sm font-semibold text-arena-text">
                    {game.name}
                  </p>
                  <p className="mt-1 font-mono text-xs text-arena-gold tabular">
                    From KES {game.minStakeKes}
                  </p>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      <footer className="border-t border-arena-border px-6 py-8 text-center lg:px-12">
        <p className="text-xs text-arena-text-dim">
          Stakes are real money. You must be 18+ to play. Play responsibly.
        </p>
      </footer>
    </div>
  )
}
