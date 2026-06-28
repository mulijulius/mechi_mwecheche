/**
 * src/routes/_authed/dashboard/checkers/$contestId.tsx
 *
 * Game room for a specific checkers contest. Mounts the vanilla-JS 3D engine
 * (checkers/index.html logic) inside a React iframe-like container using a
 * dedicated <canvas> and dynamic script import.
 *
 * Architecture note: The 3D engine (Renderer3D, GameEngine, etc.) is vanilla
 * ES-module JS that expects a <canvas id="game-canvas"> in the DOM. We render
 * that canvas here and then dynamically import the engine bootstrap after the
 * canvas is in the DOM, passing contest metadata (variant, theme) down.
 */

import * as React from 'react'
import { createFileRoute, useNavigate } from '@tanstack/react-router'
import { ArrowLeft, Crown, Flag, RotateCcw } from 'lucide-react'
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

function CheckersGameRoom() {
  const { contestId } = Route.useParams()
  const navigate = useNavigate()
  const { user } = useAuth()

  const [contest, setContest] = React.useState<ContestRow | null>(null)
  const [players, setPlayers] = React.useState<ContestPlayer[]>([])
  const [isLoading, setIsLoading] = React.useState(true)
  const [engineReady, setEngineReady] = React.useState(false)
  const [gameOver, setGameOver] = React.useState<{ winner: string | null; reason: string } | null>(null)

  const canvasRef = React.useRef<HTMLCanvasElement>(null)
  const engineRef = React.useRef<any>(null)   // holds the App instance

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

  // ── Realtime: watch for second player joining ─────────────────────────────

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

  // ── Mount 3D engine once contest is booked and canvas is rendered ─────────

  React.useEffect(() => {
    if (!contest || contest.status !== 'booked' || !canvasRef.current || engineReady) return

    const myPlayer = players.find((p) => p.user_id === user?.id)
    const opponent = players.find((p) => p.user_id !== user?.id)

    // Dynamically import the vanilla engine. The checkers/ folder is served
    // as static assets from /checkers/ in vite.config.ts (see publicDir note).
    // We use postMessage to bridge React state ↔ engine events.
    async function mountEngine() {
      // Import the compiled modules from the static /checkers/js/ folder
      const [{ GameEngine }, { Renderer3D }, { ThemeManager, THEMES, PlayerProfile }] =
        await Promise.all([
          import('/checkers/js/GameEngine.js'),
          import('/checkers/js/Renderer3D.js'),
          import('/checkers/js/Modules.js'),
        ])

      const theme = { id: contest!.variant === 'english' ? 'classic' : contest!.theme, ...THEMES[contest!.theme] }

      const p1 = new PlayerProfile(myPlayer?.user_id ?? 'me', myPlayer?.profiles?.username ?? 'You')
      const p2 = new PlayerProfile(opponent?.user_id ?? 'opp', opponent?.profiles?.username ?? 'Opponent')

      const engine = new GameEngine({
        gameType: contest!.variant,
        boardSize: 8,
        themePreset: contest!.theme,
        players: {
          black: myPlayer?.color === 'black' ? p1 : p2,
          white: myPlayer?.color === 'white' ? p1 : p2,
        },
      })

      const renderer = new Renderer3D(canvasRef.current!, theme)
      engineRef.current = { engine, renderer }

      // Wire events
      engine.bus.on('game:start', (snap: any) => renderer.syncPieces(snap.board))
      engine.bus.on('game:turn',  (data: any) => renderer.syncPieces(data.board))
      engine.bus.on('game:undo',  (snap: any) => renderer.syncPieces(snap.board))
      engine.bus.on('game:over',  (data: any) => {
        setGameOver({ winner: data.winner, reason: data.reason })
        // Mark contest complete in DB (only the winner's client should do this,
        // but we gate inside complete_checkers_contest so both can safely call it)
        const winnerId = data.winner
          ? (data.winner === myPlayer?.color ? myPlayer?.user_id : opponent?.user_id) ?? null
          : null
        supabase.rpc('complete_checkers_contest', {
          p_contest_id: contestId,
          p_winner_id: winnerId,
        })
      })

      engine.startGame()
      setEngineReady(true)
    }

    mountEngine().catch(console.error)
  }, [contest, players, engineReady, user?.id, contestId])

  // ── Canvas click forwarding ───────────────────────────────────────────────

  function handleCanvasClick(e: React.MouseEvent<HTMLCanvasElement>) {
    // The engine's pick() works on raw DOM events; we delegate via the
    // canvas ref so the engine uses real coordinates.
    if (!engineRef.current) return
    // Engine handles its own click binding via Renderer3D.pick() —
    // no action needed here; the canvas DOM event bubbles to the engine.
  }

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

        {/* Game canvas */}
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
            <canvas
              ref={canvasRef}
              id="game-canvas"
              className="block"
              style={{ width: '100%', height: '100%', maxHeight: 'calc(100vh - 120px)' }}
              onClick={handleCanvasClick}
            />
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
