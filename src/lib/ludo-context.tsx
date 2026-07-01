/**
 * src/lib/ludo-context.tsx
 *
 * Provides matchmaking state, contest actions, and real-time lobby updates
 * for Ludo. Wraps the Supabase RPCs defined in 0008_ludo_matchmaking.sql
 * and the real-time channel for contest discovery.
 *
 * Mirrors src/lib/checkers-context.tsx as closely as the game shape allows.
 * The main difference: a Ludo contest seats 2-4 players (not a fixed 1v1),
 * so OpenContest carries max_players/seated_players for the lobby list, and
 * HostOptions carries maxPlayers instead of a rule variant.
 *
 * Usage:
 *   Wrap the ludo route subtree in <LudoProvider>.
 *   Consume with useLudo() inside any child component.
 */

import * as React from 'react'
import { supabase } from '#/utils/supabase'
import { useAuth } from '#/lib/auth-context'
import type { LudoTheme, Database } from '#/types/database.types'

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type OpenContest = {
  id: string
  host_username: string
  theme: LudoTheme
  max_players: number
  seated_players: number
  entry_fee_cents: number
  room_code: string
  created_at: string
}

export type ContestRow = Database['public']['Tables']['ludo_contests']['Row']

export type HostOptions = {
  theme: LudoTheme
  maxPlayers: 2 | 3 | 4
  /** 0 = free trial */
  entry_fee_cents: number
}

export type JoinResult =
  | 'ok'
  | 'insufficient_funds'
  | 'already_full'
  | 'not_found'
  | 'trial_limit_reached'
  | 'error'

interface LudoContextValue {
  /** Live list of open contests from the lobby */
  openContests: OpenContest[]
  isLobbyLoading: boolean

  /** How many free trial matches remain today */
  trialRemaining: number

  /** Currently active contest this user is in (booked or in_progress) */
  activeContestId: string | null
  setActiveContestId: (id: string | null) => void

  /** Host a new contest. Returns contest_id on success, or null on failure. */
  hostContest: (opts: HostOptions) => Promise<string | null>
  hostError: string | null

  /** Join an open contest by ID. */
  joinContest: (contestId: string) => Promise<JoinResult>

  /** Refresh the open contests list manually */
  refreshLobby: () => Promise<void>

  /** Refresh trial remaining count */
  refreshTrialRemaining: () => Promise<void>
}

// ---------------------------------------------------------------------------
// Context
// ---------------------------------------------------------------------------

const LudoContext = React.createContext<LudoContextValue | undefined>(undefined)

export function LudoProvider({ children }: { children: React.ReactNode }) {
  const { user, refreshProfile } = useAuth()

  const [openContests, setOpenContests] = React.useState<OpenContest[]>([])
  const [isLobbyLoading, setIsLobbyLoading] = React.useState(true)
  const [trialRemaining, setTrialRemaining] = React.useState(3)
  const [activeContestId, setActiveContestId] = React.useState<string | null>(null)
  const [hostError, setHostError] = React.useState<string | null>(null)

  // ── Lobby fetch ──────────────────────────────────────────────────────────

  const refreshLobby = React.useCallback(async () => {
    const { data, error } = await supabase.rpc('get_open_ludo_contests')
    if (!error && data) {
      setOpenContests(data as OpenContest[])
    }
    setIsLobbyLoading(false)
  }, [])

  // ── Trial remaining ──────────────────────────────────────────────────────

  const refreshTrialRemaining = React.useCallback(async () => {
    if (!user?.id) return
    const { data } = await supabase.rpc('get_ludo_trial_remaining', { p_user_id: user.id })
    setTrialRemaining(typeof data === 'number' ? data : 3)
  }, [user?.id])

  // ── Realtime: watch ludo_contests for INSERT / UPDATE ────────────────

  React.useEffect(() => {
    refreshLobby()

    const channel = supabase
      .channel('ludo-lobby')
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'ludo_contests' },
        () => {
          refreshLobby()
        },
      )
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'ludo_contest_players' },
        () => {
          // Seat counts on open contests change as players join — refresh
          // so the lobby's "2/4 seated" badges stay accurate.
          refreshLobby()
        },
      )
      .subscribe()

    return () => {
      supabase.removeChannel(channel)
    }
  }, [refreshLobby])

  // ── Load trial count on mount ───────────────────────────────────────────

  React.useEffect(() => {
    refreshTrialRemaining()
  }, [refreshTrialRemaining])

  // ── Actions ──────────────────────────────────────────────────────────────

  const hostContest = React.useCallback(
    async (opts: HostOptions): Promise<string | null> => {
      if (!user?.id) return null
      setHostError(null)

      const { data, error } = await supabase.rpc('host_ludo_contest', {
        p_host_id: user.id,
        p_theme: opts.theme,
        p_max_players: opts.maxPlayers,
        p_entry_fee_cents: opts.entry_fee_cents,
      })

      if (error || !data) {
        setHostError('Failed to create contest. Please try again.')
        return null
      }

      const result = data as string
      if (result.startsWith('err:')) {
        const code = result.replace('err:', '')
        if (code === 'trial_limit_reached') {
          setHostError('Daily free trial limit reached (3 matches per day). Deposit to continue playing.')
        } else if (code === 'insufficient_funds') {
          setHostError('Insufficient wallet balance. Please deposit funds first.')
        } else {
          setHostError('Could not create contest. Please try again.')
        }
        return null
      }

      await Promise.all([refreshProfile(), refreshTrialRemaining()])
      return result // UUID
    },
    [user?.id, refreshProfile, refreshTrialRemaining],
  )

  const joinContest = React.useCallback(
    async (contestId: string): Promise<JoinResult> => {
      if (!user?.id) return 'error'

      const { data, error } = await supabase.rpc('join_ludo_contest', {
        p_contest_id: contestId,
        p_user_id: user.id,
      })

      if (error) return 'error'

      const result = (data as string) as JoinResult

      if (result === 'ok') {
        await Promise.all([refreshProfile(), refreshTrialRemaining()])
        setActiveContestId(contestId)
      }

      return result
    },
    [user?.id, refreshProfile, refreshTrialRemaining],
  )

  const value: LudoContextValue = {
    openContests,
    isLobbyLoading,
    trialRemaining,
    activeContestId,
    setActiveContestId,
    hostContest,
    hostError,
    joinContest,
    refreshLobby,
    refreshTrialRemaining,
  }

  return <LudoContext.Provider value={value}>{children}</LudoContext.Provider>
}

export function useLudo(): LudoContextValue {
  const ctx = React.useContext(LudoContext)
  if (!ctx) throw new Error('useLudo must be used inside <LudoProvider>')
  return ctx
}
