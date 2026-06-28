/**
 * src/lib/checkers-context.tsx
 *
 * Provides matchmaking state, contest actions, and real-time lobby updates
 * for the Checkers 3D game. Wraps the Supabase RPCs defined in
 * 0004_checkers_matchmaking.sql and the real-time channel for contest discovery.
 *
 * Usage:
 *   Wrap the checkers route subtree in <CheckersProvider>.
 *   Consume with useCheckers() inside any child component.
 */

import * as React from 'react'
import { supabase } from '#/utils/supabase'
import { useAuth } from '#/lib/auth-context'
import type { CheckersVariant, CheckersTheme, Database } from '#/types/database.types'

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type OpenContest = {
  id: string
  host_username: string
  variant: CheckersVariant
  theme: CheckersTheme
  entry_fee_cents: number
  room_code: string
  created_at: string
}

export type ContestRow = Database['public']['Tables']['checkers_contests']['Row']

export type HostOptions = {
  variant: CheckersVariant
  theme: CheckersTheme
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

export type TrialRemaining = {
  english: number
  russian: number
}

interface CheckersContextValue {
  /** Live list of open contests from the lobby */
  openContests: OpenContest[]
  isLobbyLoading: boolean

  /** How many free trial matches remain today per variant */
  trialRemaining: TrialRemaining

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

  /** Refresh trial remaining counts */
  refreshTrialRemaining: () => Promise<void>
}

// ---------------------------------------------------------------------------
// Context
// ---------------------------------------------------------------------------

const CheckersContext = React.createContext<CheckersContextValue | undefined>(undefined)

export function CheckersProvider({ children }: { children: React.ReactNode }) {
  const { user, refreshProfile } = useAuth()

  const [openContests, setOpenContests] = React.useState<OpenContest[]>([])
  const [isLobbyLoading, setIsLobbyLoading] = React.useState(true)
  const [trialRemaining, setTrialRemaining] = React.useState<TrialRemaining>({ english: 3, russian: 3 })
  const [activeContestId, setActiveContestId] = React.useState<string | null>(null)
  const [hostError, setHostError] = React.useState<string | null>(null)

  // ── Lobby fetch ──────────────────────────────────────────────────────────

  const refreshLobby = React.useCallback(async () => {
    const { data, error } = await supabase.rpc('get_open_checkers_contests')
    if (!error && data) {
      setOpenContests(data as OpenContest[])
    }
    setIsLobbyLoading(false)
  }, [])

  // ── Trial remaining ──────────────────────────────────────────────────────

  const refreshTrialRemaining = React.useCallback(async () => {
    if (!user?.id) return
    const [engRes, rusRes] = await Promise.all([
      supabase.rpc('get_checkers_trial_remaining', { p_user_id: user.id, p_variant: 'english' }),
      supabase.rpc('get_checkers_trial_remaining', { p_user_id: user.id, p_variant: 'russian' }),
    ])
    setTrialRemaining({
      english: typeof engRes.data === 'number' ? engRes.data : 3,
      russian: typeof rusRes.data === 'number' ? rusRes.data : 3,
    })
  }, [user?.id])

  // ── Realtime: watch checkers_contests for INSERT / UPDATE ────────────────

  React.useEffect(() => {
    refreshLobby()

    const channel = supabase
      .channel('checkers-lobby')
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'checkers_contests' },
        () => {
          // Re-fetch the full open list on any change — simpler and avoids
          // partial-update bugs compared to patching the array in place.
          refreshLobby()
        },
      )
      .subscribe()

    return () => {
      supabase.removeChannel(channel)
    }
  }, [refreshLobby])

  // ── Load trial counts on mount ───────────────────────────────────────────

  React.useEffect(() => {
    refreshTrialRemaining()
  }, [refreshTrialRemaining])

  // ── Actions ──────────────────────────────────────────────────────────────

  const hostContest = React.useCallback(
    async (opts: HostOptions): Promise<string | null> => {
      if (!user?.id) return null
      setHostError(null)

      const { data, error } = await supabase.rpc('host_checkers_contest', {
        p_host_id: user.id,
        p_variant: opts.variant,
        p_theme: opts.theme,
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
          setHostError('Daily free trial limit reached (3 matches per variant). Deposit to continue playing.')
        } else if (code === 'insufficient_funds') {
          setHostError('Insufficient wallet balance. Please deposit funds first.')
        } else {
          setHostError('Could not create contest. Please try again.')
        }
        return null
      }

      // Refresh wallet balance and trial counts
      await Promise.all([refreshProfile(), refreshTrialRemaining()])
      return result // UUID
    },
    [user?.id, refreshProfile, refreshTrialRemaining],
  )

  const joinContest = React.useCallback(
    async (contestId: string): Promise<JoinResult> => {
      if (!user?.id) return 'error'

      const { data, error } = await supabase.rpc('join_checkers_contest', {
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

  const value: CheckersContextValue = {
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

  return <CheckersContext.Provider value={value}>{children}</CheckersContext.Provider>
}

export function useCheckers(): CheckersContextValue {
  const ctx = React.useContext(CheckersContext)
  if (!ctx) throw new Error('useCheckers must be used inside <CheckersProvider>')
  return ctx
}
