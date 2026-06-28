/**
 * src/routes/_authed/dashboard/checkers/$contestId.tsx
 *
 * Game room for a specific checkers contest.
 *
 * The 3D board itself is NOT rendered inline anymore. Mounting the vanilla
 * Three.js engine inside a flex/grid React layout was unreliable — the
 * canvas's clientWidth/clientHeight could be measured before the layout
 * settled, producing a squashed, zoomed-in board. Instead, once the contest
 * is booked we open a dedicated static page (/checkers/play.html) in its own
 * browser window, sized wide, which gets a clean full-viewport canvas and
 * proper resize handling. Touch is supported there directly.
 *
 * This page keeps showing lobby-style state (waiting for opponent, room
 * code, game over) and is responsible for opening/re-opening the board
 * window.
 */

import * as React from 'react'
import { createFileRoute, useNavigate } from '@tanstack/react-router'
import { ArrowLeft, ExternalLink, RotateCcw } from 'lucide-react'
import { Button } from '#/components/ui/button'
import { Badge } from '#/components/ui/badge'
import { supabase } from '#/utils/supabase'
import { useAuth } from '#/lib/auth-context'
import { CheckersProvider } from '#/lib/checkers-context'
import { formatKes } from '#/utils/format'
import type { ContestRow } from '#/lib/checkers-context'
import type { Database } from '#/types/database.types'

type ContestPlayer = Database['public']['Tables']['checkers_contest_players']['Row'] & {
  profiles: { username: string } | null
}

export const Route = createFileRoute('/_authed/dashboard/checkers/$contestId')({
  component: () => (
    <CheckersProvider>
      <CheckersGameRoom />
    </CheckersProvider>
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
  })
  return `/checkers/play.html?${params.toString()}`
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

  const win = window.open(url, `checkers-${contestId}`, features)

  if (!win) {
    // Popup blocked — fall back to opening in the current tab so the
    // user isn't stuck with nothing happening.
    window.location.href = url
    return null
  }

  win.focus()
  return win
}

function CheckersGameRoom() {
  const { contestId } = Route.useParams()
  const navigate = useNavigate()
  const { user } = useAuth()

  const [contest, setContest] = React.useState<ContestRow | null>(null)
  const [players, setPlayers] = React.useState<ContestPlayer[]>([])
  const [isLoading, setIsLoading] = React.useState(true)
  const [gameOver, setGameOver] = React.useState<{ winner: string | null; reason: string } | null>(null)

  const boardWindowRef = React.useRef<Window | null>(null)
  const hasAutoOpenedRef = React.useRef(false)

  // ── Load contest data ────────────────────────────────────────────────────

  React.useEffect(() => {
    let isMounted = true

    async function load() {
      const [contestRes, playersRes] = await Promise.all([
        supabase
          .from('checkers_contests')
          .select('*')
          .eq('id', contestId)
          .single(),
        supabase
          .from('checkers_contest_players')
          .select('*, profiles(username)')
          .eq('contest_id', contestId),
      ])

      if (!isMounted) return
      if (contestRes.data) setContest(contestRes.data)
      if (playersRes.data) setPlayers(playersRes.data as ContestPlayer[])
      setIsLoading(false)
    }

    load()
    return () => { isMounted = false }
  }, [contestId])

  // ── Realtime: watch for second player joining / contest completion ───────

  React.useEffect(() => {
    const channel = supabase
      .channel(`contest-room-${contestId}`)
      .on(
        'postgres_changes',
        {
          event: 'UPDATE',
          schema: 'public',
          table: 'checkers_contests',
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
          table: 'checkers_contest_players',
          filter: `contest_id=eq.${contestId}`,
        },
        async () => {
          const { data } = await supabase
            .from('checkers_contest_players')
            .select('*, profiles(username)')
            .eq('contest_id', contestId)
          if (data) setPlayers(data as ContestPlayer[])
        },
      )
      .subscribe()

    return () => { supabase.removeChannel(channel) }
  }, [contestId])

  // ── Auto-open the board window once both seats are filled ────────────────
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
    // If we already have a reference to a still-open window, just refocus it
    // instead of spawning a duplicate.
    if (boardWindowRef.current && !boardWindowRef.current.closed) {
      boardWindowRef.current.focus()
      return
    }
    boardWindowRef.current = openBoardWindow(contestId, user?.id)
  }

  // ── Detect game-over reported back via the contests row ──────────────────
  // The popup writes the result straight to Supabase via complete_checkers_contest,
  // so we just watch the contests row for status -> 'completed' to know it ended.

  React.useEffect(() => {
    if (contest?.status === 'completed' && !gameOver) {
      const myColor = players.find(p => p.user_id === user?.id)?.color ?? null
      const oppColor = players.find(p => p.user_id !== user?.id)?.color ?? null
      const winnerColor = contest.winner_id
        ? (contest.winner_id === user?.id ? myColor : oppColor)
        : null
      setGameOver({ winner: winnerColor, reason: 'game-over' })
    }
  }, [contest, gameOver, players, user?.id])

  // ── Loading / waiting states ─────────────────────────────────────────────

  if (isLoading) {
    return <CenteredMessage>Loading game room…</CenteredMessage>
  }

  if (!contest) {
    return <CenteredMessage>Contest not found.</CenteredMessage>
  }

  const myPlayer  = players.find((p) => p.user_id === user?.id)
  const oppPlayer = players.find((p) => p.user_id !== user?.id)

  return (
    <div className="flex min-h-[calc(100vh-64px)] flex-col">
      {/* Top bar */}
      <div className="flex items-center justify-between border-b border-arena-border bg-arena-surface px-6 py-3">
        <div className="flex items-center gap-4">
          <Button variant="ghost" size="sm" className="gap-1 text-arena-text-dim"
            onClick={() => navigate({ to: '/dashboard/checkers' })}>
            <ArrowLeft className="size-4" /> Lobby
          </Button>
          <div>
            <span className="font-mono text-xs text-arena-text-dim">Room </span>
            <span className="font-mono text-xs font-semibold text-arena-gold">{contest.room_code}</span>
          </div>
          <Badge variant={contest.variant === 'russian' ? 'gold' : 'default'} className="capitalize">
            {contest.variant}
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
            <Badge variant="default">Waiting for opponent…</Badge>
          )}
          {contest.status === 'booked' && !gameOver && (
            <Badge variant="emerald">Live</Badge>
          )}
        </div>
      </div>

      {/* Body */}
      <div className="flex flex-1 gap-0">
        {/* Sidebar: player cards */}
        <div className="hidden w-52 shrink-0 flex-col gap-3 border-r border-arena-border bg-arena-surface p-4 lg:flex">
          <PlayerCard
            label="You"
            username={myPlayer?.profiles?.username ?? '—'}
            color={myPlayer?.color ?? null}
            isActive={false}
          />
          <div className="my-1 border-t border-arena-border" />
          {oppPlayer ? (
            <PlayerCard
              label="Opponent"
              username={oppPlayer.profiles?.username ?? '—'}
              color={oppPlayer.color}
              isActive={false}
            />
          ) : (
            <div className="flex flex-col items-center gap-1 rounded-lg border border-dashed border-arena-border p-4 text-center">
              <p className="text-xs text-arena-text-dim">Waiting for challenger…</p>
              <p className="font-mono text-[10px] text-arena-gold">{contest.room_code}</p>
            </div>
          )}
        </div>

        {/* Where the board used to render inline — now just status + open button */}
        <div className="relative flex flex-1 items-center justify-center bg-arena-bg">
          {contest.status === 'open' ? (
            <WaitingOverlay roomCode={contest.room_code} />
          ) : gameOver ? (
            <GameOverOverlay
              gameOver={gameOver}
              myColor={myPlayer?.color ?? null}
              onPlayAgain={() => navigate({ to: '/dashboard/checkers' })}
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

function PlayerCard({ label, username, color, isActive }: {
  label: string; username: string; color: 'black' | 'white' | null; isActive: boolean
}) {
  return (
    <div className={[
      'rounded-lg border p-3 transition-colors',
      isActive ? 'border-arena-emerald bg-[color-mix(in_srgb,var(--color-arena-emerald)_8%,transparent)]' : 'border-arena-border',
    ].join(' ')}>
      <p className="text-[10px] uppercase tracking-wider text-arena-text-dim">{label}</p>
      <p className="mt-0.5 font-display text-sm font-semibold text-arena-text">{username}</p>
      {color && (
        <div className="mt-1.5 flex items-center gap-1.5">
          <span className={[
            'inline-block size-3 rounded-full border',
            color === 'white' ? 'border-arena-border bg-white' : 'border-arena-border bg-neutral-900',
          ].join(' ')} />
          <span className="text-[10px] capitalize text-arena-text-dim">{color} pieces</span>
        </div>
      )}
    </div>
  )
}

function WaitingOverlay({ roomCode }: { roomCode: string }) {
  return (
    <div className="flex flex-col items-center gap-4 text-center">
      <div className="size-16 animate-pulse rounded-full border-2 border-arena-emerald/40 bg-[color-mix(in_srgb,var(--color-arena-emerald)_8%,transparent)]" />
      <div>
        <p className="font-display text-lg font-semibold text-arena-text">Waiting for opponent</p>
        <p className="mt-1 text-sm text-arena-text-dim">Share your room code</p>
        <p className="mt-2 font-mono text-2xl font-bold tracking-[0.3em] text-arena-gold">{roomCode}</p>
      </div>
    </div>
  )
}

function OpenBoardPrompt({ onOpen }: { onOpen: () => void }) {
  return (
    <div className="flex flex-col items-center gap-4 text-center">
      <div>
        <p className="font-display text-lg font-semibold text-arena-text">Your match is ready</p>
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

function GameOverOverlay({ gameOver, myColor, onPlayAgain }: {
  gameOver: { winner: string | null; reason: string }
  myColor: 'black' | 'white' | null
  onPlayAgain: () => void
}) {
  const iWon = gameOver.winner && gameOver.winner === myColor
  const isDraw = !gameOver.winner

  return (
    <div className="flex flex-col items-center gap-5 text-center">
      <div className="text-5xl">{isDraw ? '🤝' : iWon ? '🏆' : '😔'}</div>
      <div>
        <p className="font-display text-2xl font-bold text-arena-text">
          {isDraw ? "It's a Draw!" : iWon ? 'You Win!' : 'You Lose'}
        </p>
        <p className="mt-1 text-sm capitalize text-arena-text-dim">
          {gameOver.reason?.replace('-', ' ')}
        </p>
      </div>
      <Button onClick={onPlayAgain} className="gap-2">
        <RotateCcw className="size-4" />
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
