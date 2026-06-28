/**
 * src/routes/_authed/dashboard/checkers/index.tsx
 *
 * Checkers lobby page. Shows the Host button, trial quota badge,
 * and the real-time ContestLobby list.
 */

import * as React from 'react'
import { createFileRoute } from '@tanstack/react-router'
import { Plus, Shield } from 'lucide-react'
import { Button } from '#/components/ui/button'
import { Badge } from '#/components/ui/badge'
import { CheckersProvider, useCheckers } from '#/lib/checkers-context'
import { ContestLobby } from '#/components/checkers/contest-lobby'
import { HostContestDialog } from '#/components/checkers/host-contest-dialog'

export const Route = createFileRoute('/_authed/dashboard/checkers/')({
  component: () => (
    <CheckersProvider>
      <CheckersLobbyPage />
    </CheckersProvider>
  ),
})

function CheckersLobbyPage() {
  const { trialRemaining, openContests } = useCheckers()
  const [showHost, setShowHost] = React.useState(false)

  return (
    <div>
      {/* Header */}
      <div className="mb-6 flex items-start justify-between gap-4">
        <div>
          <p className="font-mono text-xs uppercase tracking-[0.2em] text-arena-emerald">
            Checkers 3D
          </p>
          <h1 className="mt-1 font-display text-2xl font-semibold text-arena-text">
            Live Tables
          </h1>
          <p className="mt-1 text-sm text-arena-text-dim">
            {openContests.length} open {openContests.length === 1 ? 'table' : 'tables'} •
            English &amp; Russian variants
          </p>
        </div>

        <Button onClick={() => setShowHost(true)} className="shrink-0 gap-2">
          <Plus className="size-4" />
          Host Match
        </Button>
      </div>

      {/* Trial quota */}
      <div className="mb-5 flex flex-wrap gap-2">
        <TrialBadge variant="english" remaining={trialRemaining.english} />
        <TrialBadge variant="russian" remaining={trialRemaining.russian} />
      </div>

      {/* Lobby */}
      <ContestLobby />

      {/* Host dialog */}
      <HostContestDialog open={showHost} onOpenChange={setShowHost} />
    </div>
  )
}

function TrialBadge({ variant, remaining }: { variant: 'english' | 'russian'; remaining: number }) {
  return (
    <div className="flex items-center gap-1.5 rounded-full border border-arena-border bg-arena-surface-2 px-3 py-1 text-xs">
      <Shield className="size-3 text-arena-text-dim" />
      <span className="capitalize text-arena-text-dim">{variant}</span>
      <span
        className={[
          'font-mono font-semibold',
          remaining === 0 ? 'text-arena-red' : 'text-arena-emerald',
        ].join(' ')}
      >
        {remaining}/3
      </span>
      <span className="text-arena-text-dim">free</span>
    </div>
  )
}
