/**
 * src/components/checkers/contest-lobby.tsx
 *
 * Real-time list of open Checkers contests. Subscribes to Supabase realtime
 * via CheckersProvider and shows a join flow with wallet/trial verification.
 */

import * as React from 'react'
import { useNavigate } from '@tanstack/react-router'
import { Users, Clock, Trophy, Zap } from 'lucide-react'
import { Card } from '#/components/ui/card'
import { Button } from '#/components/ui/button'
import { Badge } from '#/components/ui/badge'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '#/components/ui/dialog'
import { useCheckers, type OpenContest, type JoinResult } from '#/lib/checkers-context'
import { useAuth } from '#/lib/auth-context'
import { formatKes, formatRelativeTime } from '#/utils/format'

const JOIN_ERROR_MSG: Record<JoinResult, string> = {
  ok:                   '',
  insufficient_funds:   'Your wallet balance is too low. Please deposit funds to join this match.',
  already_full:         'This contest was just taken. Refresh to see updated tables.',
  not_found:            'Contest no longer exists.',
  trial_limit_reached:  'You have used all 3 free trials for this variant today. Deposit to keep playing.',
  error:                'Something went wrong. Please try again.',
}

const THEME_LABELS: Record<string, string> = {
  classic:  'Classic Wood',
  green:    'Tournament Green',
  midnight: 'Midnight Blue',
  red:      'Championship Red',
  ivory:    'Ivory & Ebony',
}

export function ContestLobby() {
  const navigate = useNavigate()
  const { openContests, isLobbyLoading, joinContest, trialRemaining } = useCheckers()
  const { user, wallet } = useAuth()

  const [joining, setJoining] = React.useState<string | null>(null)   // contestId being joined
  const [joinResult, setJoinResult] = React.useState<JoinResult | null>(null)
  const [errorContest, setErrorContest] = React.useState<OpenContest | null>(null)

  async function handleJoin(contest: OpenContest) {
    if (!user) return
    setJoining(contest.id)
    const result = await joinContest(contest.id)
    setJoining(null)

    if (result === 'ok') {
      navigate({ to: '/dashboard/checkers/$contestId', params: { contestId: contest.id } })
    } else {
      setJoinResult(result)
      setErrorContest(contest)
    }
  }

  function canJoin(contest: OpenContest): boolean {
    if (!wallet) return false
    if (contest.host_username === (user as any)?.user_metadata?.username) return false
    if (contest.entry_fee_cents === 0) {
      return trialRemaining[contest.variant] > 0
    }
    return (wallet.balance_cents - wallet.locked_cents) >= contest.entry_fee_cents
  }

  if (isLobbyLoading) {
    return (
      <div className="flex h-40 items-center justify-center text-sm text-arena-text-dim">
        Loading tables…
      </div>
    )
  }

  if (openContests.length === 0) {
    return (
      <div className="flex h-40 flex-col items-center justify-center gap-2 rounded-lg border border-dashed border-arena-border text-center">
        <Trophy className="size-8 text-arena-text-dim opacity-40" />
        <p className="text-sm text-arena-text-dim">No open tables right now.</p>
        <p className="text-xs text-arena-text-dim opacity-60">Host one and wait for a challenger!</p>
      </div>
    )
  }

  return (
    <>
      <div className="space-y-3">
        {openContests.map((contest) => (
          <Card
            key={contest.id}
            className="flex items-center justify-between gap-4 border-arena-border bg-arena-surface p-4"
          >
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-2">
                <span className="font-display text-sm font-semibold text-arena-text">
                  {contest.host_username}
                </span>
                <Badge variant={contest.variant === 'russian' ? 'gold' : 'default'} className="text-[10px]">
                  {contest.variant === 'russian' ? 'Russian' : 'English'}
                </Badge>
              </div>

              <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-0.5 text-[11px] text-arena-text-dim">
                <span>{THEME_LABELS[contest.theme] ?? contest.theme}</span>
                <span className="flex items-center gap-1">
                  <Clock className="size-3" />
                  {formatRelativeTime(contest.created_at)}
                </span>
              </div>
            </div>

            <div className="flex shrink-0 flex-col items-end gap-2">
              {contest.entry_fee_cents === 0 ? (
                <span className="flex items-center gap-1 text-xs font-medium text-arena-emerald">
                  <Zap className="size-3" />
                  Free Trial
                </span>
              ) : (
                <span className="font-mono text-sm font-semibold text-arena-gold">
                  {formatKes(contest.entry_fee_cents)}
                </span>
              )}
              <Button
                size="sm"
                variant={canJoin(contest) ? 'default' : 'outline'}
                disabled={!canJoin(contest) || joining === contest.id}
                onClick={() => handleJoin(contest)}
                className="min-w-[72px]"
              >
                {joining === contest.id ? 'Joining…' : 'Join'}
              </Button>
            </div>
          </Card>
        ))}
      </div>

      {/* Join error dialog */}
      <Dialog open={joinResult !== null && joinResult !== 'ok'} onOpenChange={() => setJoinResult(null)}>
        <DialogContent className="max-w-sm border-arena-border bg-arena-surface text-arena-text">
          <DialogHeader>
            <DialogTitle className="font-display text-arena-text">Cannot Join</DialogTitle>
          </DialogHeader>
          <p className="text-sm text-arena-text-dim">
            {joinResult ? JOIN_ERROR_MSG[joinResult] : ''}
          </p>
          <div className="mt-4 flex justify-end gap-2">
            {joinResult === 'insufficient_funds' && (
              <Button size="sm" onClick={() => { setJoinResult(null); navigate({ to: '/dashboard/wallet' }) }}>
                Go to Wallet
              </Button>
            )}
            <Button variant="outline" size="sm" onClick={() => setJoinResult(null)}>
              Close
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </>
  )
}
