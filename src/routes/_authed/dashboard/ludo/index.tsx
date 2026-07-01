/**
 * src/routes/_authed/dashboard/ludo/index.tsx
 *
 * Ludo lobby page. Shows the Host button, trial quota badge, a practice
 * popup launcher, and the real-time ContestLobby list.
 *
 * Mirrors src/routes/_authed/dashboard/checkers/index.tsx — the only
 * meaningful difference is a single trial badge (Ludo has one ruleset,
 * unlike checkers' english/russian split).
 */

import * as React from 'react'
import { createFileRoute } from '@tanstack/react-router'
import { Plus, Shield, Bot } from 'lucide-react'
import { Button } from '#/components/ui/button'
import { LudoProvider, useLudo } from '#/lib/ludo-context'
import { ContestLobby } from '#/components/ludo/contest-lobby'
import { HostContestDialog } from '#/components/ludo/host-contest-dialog'

export const Route = createFileRoute('/_authed/dashboard/ludo/')({
  component: () => (
    <LudoProvider>
      <LudoLobbyPage />
    </LudoProvider>
  ),
})

/** Opens the standalone practice-vs-computer page (public/ludo/index.html)
 *  in a sized, centered popup — mirrors openPracticeWindow() in checkers'
 *  index.tsx so both static practice pages open the same way. No query
 *  params needed: fully self-contained local play, no stakes. */
function openPracticeWindow() {
  const url = '/ludo/index.html'

  const width  = Math.min(1100, Math.round(window.screen.availWidth * 0.92))
  const height = Math.min(850,  Math.round(window.screen.availHeight * 0.92))
  const left   = Math.max(0, Math.round((window.screen.availWidth - width) / 2))
  const top    = Math.max(0, Math.round((window.screen.availHeight - height) / 2))

  const features = [
    `width=${width}`,
    `height=${height}`,
    `left=${left}`,
    `top=${top}`,
    'resizable=yes',
    'scrollbars=no',
    'status=no',
    'toolbar=no',
    'menubar=no',
    'location=no',
  ].join(',')

  const win = window.open(url, 'ludo-practice', features)

  if (!win) {
    window.location.href = url
    return
  }

  win.focus()
}

function LudoLobbyPage() {
  const { trialRemaining, openContests } = useLudo()
  const [showHost, setShowHost] = React.useState(false)

  return (
    <div>
      {/* Header */}
      <div className="mb-6 flex items-start justify-between gap-4">
        <div>
          <p className="font-mono text-xs uppercase tracking-[0.2em] text-arena-emerald">
            Ludo
          </p>
          <h1 className="mt-1 font-display text-2xl font-semibold text-arena-text">
            Live Tables
          </h1>
          <p className="mt-1 text-sm text-arena-text-dim">
            {openContests.length} open {openContests.length === 1 ? 'table' : 'tables'} •
            2–4 players
          </p>
        </div>

        <div className="flex shrink-0 gap-2">
          <Button
            variant="outline"
            onClick={openPracticeWindow}
            className="gap-2"
            title="Free local practice — no stakes, play against the computer"
          >
            <Bot className="size-4" />
            Practice vs Computer
          </Button>

          <Button onClick={() => setShowHost(true)} className="gap-2">
            <Plus className="size-4" />
            Host Table
          </Button>
        </div>
      </div>

      {/* Trial quota */}
      <div className="mb-5 flex flex-wrap gap-2">
        <TrialBadge remaining={trialRemaining} />
      </div>

      {/* Lobby */}
      <ContestLobby />

      {/* Host dialog */}
      <HostContestDialog open={showHost} onOpenChange={setShowHost} />
    </div>
  )
}

function TrialBadge({ remaining }: { remaining: number }) {
  return (
    <div className="flex items-center gap-1.5 rounded-full border border-arena-border bg-arena-surface-2 px-3 py-1 text-xs">
      <Shield className="size-3 text-arena-text-dim" />
      <span className="text-arena-text-dim">Free trials</span>
      <span
        className={[
          'font-mono font-semibold',
          remaining === 0 ? 'text-arena-red' : 'text-arena-emerald',
        ].join(' ')}
      >
        {remaining}/3
      </span>
      <span className="text-arena-text-dim">today</span>
    </div>
  )
}
