/**
 * src/routes/_authed/dashboard/ludo/$contestId.tsx
 *
 * Game room for a specific Ludo contest.
 *
 * Mirrors src/routes/_authed/dashboard/checkers/$contestId.tsx: the board
 * itself is NOT rendered inline. Once the contest is booked we open a
 * dedicated static page (/ludo/play.html) in its own browser window, which
 * gets a clean full-viewport canvas and proper resize handling. This page
 * just shows lobby-style state (seats filling, room code, game over) and is
 * responsible for opening/re-opening the board window.
 *
 * The main structural difference from checkers: a Ludo contest seats 2-4
 * players (not a fixed 1v1), so the sidebar lists every seat instead of
 * just "You" / "Opponent".
 */

import * as React from 'react'
import { createFileRoute, useNavigate } from '@tanstack/react-router'
import { ArrowLeft, ExternalLink, LogOut, RotateCcw } from 'lucide-react'
import { Button } from '#/components/ui/button'
import { Badge } from '#/components/ui/badge'
import { supabase } from '#/utils/supabase'
import { useAuth } from '#/lib/auth-context'
import { LudoProvider } from '#/lib/ludo-context'
import { formatKes } from '#/utils/format'
import type { ContestRow } from '#/lib/ludo-context'
import type { Database } from '#/types/database.types'

type ContestPlayer = Database['public']['Tables']['ludo_contest_players']['Row'] & {
  profiles: { username: string } | null
}

const COLOR_HEX: Record<string, string> = {
  red: '#E53935',
  green: '#43A047',
  yellow: '#FBC02D',
  blue: '#1E88E5',
}

export const Route = createFileRoute('/_authed/dashboard/ludo/$contestId')({
  component: () => (
    <LudoProvider>
      <LudoGameRoom />
    </LudoProvider>
  ),
})

// ─────────────────────────────────────────────────────────────────────────────

/** Build the URL for the standalone board popup, passing everything it
 *  needs since it's a plain static page with no access to Vite env vars
 *  or React context. */
function buildPlayUrl(contestId: string, userId: string | undefined) {
  const supabaseUrl = import.meta.env.VITE_SUPABASE_URL
  const supabaseKey = import.meta.env.VITE_SUPABASE_KEY
  const params = new URLSearchParams({
    contestId,
    supabaseUrl,
    supabaseKey,
    userId: userId ?? '',
    lobbyUrl: `${window.location.origin}/dashboard/ludo`,
  })
  return `/ludo/play.html?${params.toString()}`
}

/** Open the board in a new, wide window sized to be clearly visible,
 *  centered on the user's screen. Falls back to a same-tab navigation
 *  if the popup is blocked. */
function openBoardWindow(contestId: string, userId: string | undefined) {
  const url = buildPlayUrl(contestId, userId)

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

  const win = window.open(url, `ludo-${contestId}`, features)

  if (!win) {
    // Popup blocked — fall back to opening in the current tab so the
    // user isn't stuck with nothing happening.
    window.location.href = url
    return null
  }

  win.focus()
  return win
}

function LudoGameRoom() {
  const { contestId } = Route.useParams()
  const navigate = useNavigate()
  const { user } = useAuth()

  const [contest, setContest] = React.useState<ContestRow | null>(null)
  const [players, setPlayers] = React.useState<ContestPlayer[]>([])
  const [isLoading, setIsLoading] = React.useState(true)
  const [gameOver, setGameOver] = React.useState<{ winner: string | null; reason: string; forfeited: boolean } | null>(null)
  const [wasCancelled, setWasCancelled] = React.useState(false)

  const boardWindowRef = React.useRef<Window | null>(null)
  const hasAutoOpenedRef = React.useRef(false)

  // ── Load contest data ────────────────────────────────────────────────────

  const loadContest = React.useCallback(async () => {
    const [contestRes, playersRes] = await Promise.all([
      supabase
        .from('ludo_contests')
        .select('*')
        .eq('id', contestId)
        .single(),
      supabase
        .from('ludo_contest_players')
        .select('*, profiles(username)')
        .eq('contest_id', contestId)
        .order('seat', { ascending: true }),
    ])

    if (contestRes.data) setContest(contestRes.data)
    if (playersRes.data) setPlayers(playersRes.data as ContestPlayer[])
    setIsLoading(false)
  }, [contestId])

  React.useEffect(() => {
    loadContest()
  }, [loadContest])

  // ── Realtime: watch for players joining / contest status changes ─────────

  React.useEffect(() => {
    const channel = supabase
      .channel(`ludo-contest-room-${contestId}`)
      .on(
        'postgres_changes',
        {
          event: 'UPDATE',
          schema: 'public',
          table: 'ludo_contests',
          filter: `id=eq.${contestId}`,
        },
        (payload) => {
          setContest(payload.new as ContestRow)
        },
      )
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'ludo_contest_players',
          filter: `contest_id=eq.${contestId}`,
        },
        () => {
          loadContest()
        },
      )
      .subscribe()

    return () => { supabase.removeChannel(channel) }
  }, [contestId, loadContest])

  // ── Auto-open the board window once the table is booked ──────────────────
  // Browsers generally only allow window.open() without it being blocked
  // when it happens as a direct result of a user gesture (a click). A
  // contest flipping to "booked" via realtime is NOT a click, so this
  // auto-open will be blocked by most browsers' popup blockers the first
  // time. That's why we also render a manual "Open Board" button below —
  // it's the reliable path. The auto-open is just a nice-to-have for
  // browsers that allow it.

  React.useEffect(() => {
    if (!contest || contest.status === 'open' || hasAutoOpenedRef.current) return
    hasAutoOpenedRef.current = true
    const win = openBoardWindow(contestId, user?.id)
    boardWindowRef.current = win
  }, [contest, contestId, user?.id])

  // ── Manual open / re-open ────────────────────────────────────────────────

  function handleOpenBoard() {
    if (boardWindowRef.current && !boardWindowRef.current.closed) {
      boardWindowRef.current.focus()
      return
    }
    boardWindowRef.current = openBoardWindow(contestId, user?.id)
  }

  // ── Leave / forfeit from this view ────────────────────────────────────────

  const [isLeaving, setIsLeaving] = React.useState(false)

  async function handleLeaveMatch() {
    if (!contest || !user?.id || isLeaving) return

    const isStillOpen = contest.status === 'open'
    const confirmMsg = isStillOpen
      ? 'Cancel this table? ' + (contest.entry_fee_cents > 0 ? 'Your stake will be refunded.' : 'No one else has joined yet.')
      : 'Leave this match? Your stake stays in the pot for the remaining players. This can\u2019t be undone.'

    if (!window.confirm(confirmMsg)) return

    setIsLeaving(true)
    try {
      await supabase.rpc('leave_ludo_contest', {
        p_contest_id: contestId,
        p_user_id: user.id,
      })
      if (boardWindowRef.current && !boardWindowRef.current.closed) {
        boardWindowRef.current.close()
      }
      navigate({ to: '/dashboard/ludo' })
    } finally {
      setIsLeaving(false)
    }
  }

  // ── Detect game-over / cancellation reported back via the contests row ───
  // The popup writes the result straight to Supabase via complete_ludo_contest
  // or leave_ludo_contest, so we just watch the contests row for status
  // changes to know what happened — this works whether the popup is open,
  // closed, or was never opened on this device at all.

  React.useEffect(() => {
    if (!contest) return

    if (contest.status === 'cancelled' && !wasCancelled) {
      setWasCancelled(true)
      return
    }

    if (contest.status === 'completed' && !gameOver) {
      setGameOver({
        winner: contest.winner_id,
        reason: 'game-over',
        forfeited: !!contest.forfeited_by,
      })
    }
  }, [contest, gameOver, wasCancelled])

  // ── Loading / waiting states ─────────────────────────────────────────────

  if (isLoading) {
    return <CenteredMessage>Loading game room…</CenteredMessage>
  }

  if (!contest) {
    return <CenteredMessage>Contest not found.</CenteredMessage>
  }

  const seatSlots = Array.from({ length: contest.max_players }, (_, i) => players.find((p) => p.seat === i) ?? null)

  return (
    <div className="flex min-h-[calc(100vh-64px)] flex-col">
      {/* Top bar */}
      <div className="flex items-center justify-between border-b border-arena-border bg-arena-surface px-6 py-3">
        <div className="flex items-center gap-4">
          <Button variant="ghost" size="sm" className="gap-1 text-arena-text-dim"
            onClick={() => navigate({ to: '/dashboard/ludo' })}>
            <ArrowLeft className="size-4" /> Lobby
          </Button>
          <div>
            <span className="font-mono text-xs text-arena-text-dim">Room </span>
            <span className="font-mono text-xs font-semibold text-arena-gold">{contest.room_code}</span>
          </div>
          <Badge variant="gold" className="capitalize">
            {contest.theme}
          </Badge>
        </div>
        <div className="flex items-center gap-3">
          {contest.entry_fee_cents > 0 && (
            <div className="text-right">
              <p className="text-[10px] uppercase text-arena-text-dim">Pot</p>
              <p className="font-mono text-sm font-bold text-arena-emerald">
                {formatKes(contest.pot_cents)}
              </p>
            </div>
          )}
          {contest.status === 'open' && (
            <Badge variant="default">{players.length}/{contest.max_players} seated</Badge>
          )}
          {(contest.status === 'booked' || contest.status === 'in_progress') && !gameOver && (
            <Badge variant="emerald">Live</Badge>
          )}
          {(contest.status === 'open' || contest.status === 'booked' || contest.status === 'in_progress') && !gameOver && !wasCancelled && (
            <Button
              variant="ghost"
              size="sm"
              className="gap-1 text-arena-red hover:text-arena-red"
              onClick={handleLeaveMatch}
              disabled={isLeaving}
            >
              <LogOut className="size-4" />
              {contest.status === 'open' ? 'Cancel' : 'Leave Match'}
            </Button>
          )}
        </div>
      </div>

      {/* Body */}
      <div className="flex flex-1 gap-0">
        {/* Sidebar: seat cards */}
        <div className="hidden w-52 shrink-0 flex-col gap-3 border-r border-arena-border bg-arena-surface p-4 lg:flex">
          {seatSlots.map((p, i) =>
            p ? (
              <SeatCard
                key={p.id}
                label={p.user_id === user?.id ? 'You' : (p.profiles?.username ?? `Seat ${i + 1}`)}
                color={p.color}
                left={!!p.left_at}
              />
            ) : (
              <div key={i} className="flex flex-col items-center gap-1 rounded-lg border border-dashed border-arena-border p-3 text-center">
                <p className="text-xs text-arena-text-dim">Open seat</p>
              </div>
            ),
          )}
        </div>

        {/* Where the board used to render inline — now just status + open button */}
        <div className="relative flex flex-1 items-center justify-center bg-arena-bg">
          {wasCancelled ? (
            <CancelledOverlay onBackToLobby={() => navigate({ to: '/dashboard/ludo' })} />
          ) : contest.status === 'open' ? (
            <WaitingOverlay roomCode={contest.room_code} seated={players.length} maxPlayers={contest.max_players} />
          ) : gameOver ? (
            <GameOverOverlay
              gameOver={gameOver}
              myUserId={user?.id ?? null}
              onPlayAgain={() => navigate({ to: '/dashboard/ludo' })}
            />
          ) : (
            <OpenBoardPrompt onOpen={handleOpenBoard} />
          )}
        </div>
      </div>
    </div>
  )
}

// ─── Sub-components ──────────────────────────────────────────────────────────

function SeatCard({ label, color, left }: { label: string; color: string; left: boolean }) {
  return (
    <div className={[
      'rounded-lg border p-3 transition-colors',
      left ? 'border-arena-border opacity-50' : 'border-arena-border',
    ].join(' ')}>
      <p className="text-[10px] uppercase tracking-wider text-arena-text-dim">{label}</p>
      <div className="mt-1.5 flex items-center gap-1.5">
        <span
          className="inline-block size-3 rounded-full border border-arena-border"
          style={{ backgroundColor: COLOR_HEX[color] ?? '#888' }}
        />
        <span className="text-[10px] capitalize text-arena-text-dim">
          {color} {left ? '· left' : ''}
        </span>
      </div>
    </div>
  )
}

function WaitingOverlay({ roomCode, seated, maxPlayers }: { roomCode: string; seated: number; maxPlayers: number }) {
  return (
    <div className="flex flex-col items-center gap-4 text-center">
      <div className="size-16 animate-pulse rounded-full border-2 border-arena-emerald/40 bg-[color-mix(in_srgb,var(--color-arena-emerald)_8%,transparent)]" />
      <div>
        <p className="font-display text-lg font-semibold text-arena-text">Waiting for players</p>
        <p className="mt-1 text-sm text-arena-text-dim">{seated}/{maxPlayers} seated · Share your room code</p>
        <p className="mt-2 font-mono text-2xl font-bold tracking-[0.3em] text-arena-gold">{roomCode}</p>
      </div>
    </div>
  )
}

function OpenBoardPrompt({ onOpen }: { onOpen: () => void }) {
  return (
    <div className="flex flex-col items-center gap-4 text-center">
      <div>
        <p className="font-display text-lg font-semibold text-arena-text">Your table is ready</p>
        <p className="mt-1 text-sm text-arena-text-dim">
          The board opens in its own window so it's large and easy to play on touch.
        </p>
      </div>
      <Button onClick={onOpen} className="gap-2" size="lg">
        <ExternalLink className="size-4" />
        Open Board
      </Button>
      <p className="text-xs text-arena-text-dim">
        If nothing opens, your browser may have blocked the popup — tap the button again, or allow popups for this site.
      </p>
    </div>
  )
}

function GameOverOverlay({ gameOver, myUserId, onPlayAgain }: {
  gameOver: { winner: string | null; reason: string; forfeited: boolean }
  myUserId: string | null
  onPlayAgain: () => void
}) {
  const iWon = !!gameOver.winner && gameOver.winner === myUserId

  const title = gameOver.forfeited
    ? (iWon ? 'Others left — you win!' : 'Match ended')
    : (iWon ? 'You Win!' : 'Game Over')

  const subtitle = gameOver.forfeited
    ? (iWon ? 'The pot has been credited to your wallet.' : 'Another player forfeited the match.')
    : ''

  return (
    <div className="flex flex-col items-center gap-5 text-center">
      <div className="text-5xl">{gameOver.forfeited ? '🚪' : iWon ? '🏆' : '😔'}</div>
      <div>
        <p className="font-display text-2xl font-bold text-arena-text">{title}</p>
        {subtitle && <p className="mt-1 text-sm capitalize text-arena-text-dim">{subtitle}</p>}
      </div>
      <Button onClick={onPlayAgain} className="gap-2">
        <RotateCcw className="size-4" />
        Back to Lobby
      </Button>
    </div>
  )
}

function CancelledOverlay({ onBackToLobby }: { onBackToLobby: () => void }) {
  return (
    <div className="flex flex-col items-center gap-5 text-center">
      <div className="text-5xl">🚪</div>
      <div>
        <p className="font-display text-2xl font-bold text-arena-text">Table Cancelled</p>
        <p className="mt-1 text-sm text-arena-text-dim">The host left before the match started.</p>
      </div>
      <Button onClick={onBackToLobby} className="gap-2">
        <ArrowLeft className="size-4" />
        Back to Lobby
      </Button>
    </div>
  )
}

function CenteredMessage({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex h-64 items-center justify-center text-sm text-arena-text-dim">
      {children}
    </div>
  )
}
