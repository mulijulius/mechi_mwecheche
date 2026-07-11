// Generated to match supabase/migrations/0001_init.sql, 0002_security_questions.sql,
// 0003_admin_roles.sql, 0004_checkers_matchmaking.sql, 0005_checkers_leave_forfeit.sql,
// 0006_checkers_move_sync.sql, 0007_checkers_zero_stake_payout_fix.sql,
// 0008_ludo_matchmaking.sql, and 0009_ludo_move_sync.sql.
// Regenerate with: npx supabase gen types typescript --project-id <id> > src/types/database.types.ts
// 0010_ludo_realtime_publication.sql and 0011_paynexus_payments.sql have been
// folded in by hand below — re-run the command above to get an authoritative
// version once you have a moment.

// Standard Supabase-generated helper for jsonb columns. paynexus_payments is
// the first table here with one (raw_webhook_payload).
export type Json = string | number | boolean | null | { [key: string]: Json | undefined } | Array<Json>

export type GameSlug = 'ludo' | 'checkers' | 'chess' | 'billiards' | 'solitaire'

export type MatchStatus =
  | 'open'
  | 'filling'
  | 'in_progress'
  | 'completed'
  | 'cancelled'

export type TransactionType = 'deposit' | 'withdrawal' | 'stake' | 'payout' | 'refund'

export type TransactionStatus = 'pending' | 'completed' | 'failed' | 'reversed'

/** Sub-role for admin accounts only. Always null on player profiles. */
export type AdminRole = 'super_admin' | 'support' | 'finance_manager'

/** Approval lifecycle for admin accounts only. Always null on player profiles. */
export type AdminStatus = 'pending' | 'approved' | 'rejected'

export type SupportMessageSender = 'player' | 'admin'

// ---------------------------------------------------------------------------
// Checkers-specific types (from 0004_checkers_matchmaking.sql)
// ---------------------------------------------------------------------------

export type CheckersVariant = 'english' | 'russian'

export type CheckersTheme = 'classic' | 'green' | 'midnight' | 'red' | 'ivory'

export type ContestStatus = 'open' | 'booked' | 'in_progress' | 'completed' | 'cancelled'

/**
 * Mirrors the board shape produced by RuleProcessor.initialBoard() in
 * public/checkers/js/RuleProcessor.js — an 8x8 row-major grid of either a
 * piece or null. Persisted as jsonb on checkers_contests.board_state so both
 * players' clients can render the exact same authoritative state
 * (0006_checkers_move_sync.sql).
 */
export type CheckersSquare = { color: 'black' | 'white'; king: boolean } | null
export type CheckersBoard = CheckersSquare[][]

// ---------------------------------------------------------------------------
// Ludo-specific types (from 0008_ludo_matchmaking.sql, 0009_ludo_move_sync.sql)
// ---------------------------------------------------------------------------

export type LudoTheme = 'classic' | 'royal' | 'sunset' | 'ocean'

export type LudoColor = 'red' | 'green' | 'yellow' | 'blue'

export type LudoTokenState = 'home' | 'active' | 'finished'

export interface LudoToken {
  id: string
  color: LudoColor
  state: LudoTokenState
  /** -1 while in the yard; 0-50 on the shared ring; 51-56 home stretch; 57 finished. */
  pathIndex: number
}

export interface LudoPlayerState {
  id: string
  color: LudoColor
  isActive: boolean
  consecutiveSixes: number
  tokens: LudoToken[]
}

/**
 * Mirrors the shape produced by RuleProcessor.initialState() /
 * GameEngine.snapshot in public/ludo/js/{RuleProcessor,GameEngine}.js.
 * Persisted as jsonb on ludo_contests.game_state so every seated client
 * renders the exact same authoritative state (0009_ludo_move_sync.sql).
 */
export interface LudoGameState {
  matchId: string
  players: LudoPlayerState[]
  currentTurnPlayerId: string
  turnIndex: number
  phase: 'rolling' | 'moving' | 'finished'
  lastDiceValue: number | null
  consecutiveSixCount: number
  winnerOrder: string[]
  createdAt: number
  updatedAt: number
}

/**
 * Single source of truth for what each admin sub-role can do, mirrored from
 * the has_admin_capability() Postgres function in 0003_admin_roles.sql.
 */
export type AdminCapability =
  | 'manage_users'
  | 'approve_admins'
  | 'financial_records'
  | 'withdraw_funds'
  | 'statistics'
  | 'presence'
  | 'player_chat'

export interface Database {
  __InternalSupabase: {
    PostgrestVersion: '12'
  }
  public: {
    Tables: {
      profiles: {
        Row: {
          id: string
          username: string
          full_name: string | null
          phone_number: string | null
          avatar_url: string | null
          role: 'player' | 'admin'
          status: 'active' | 'suspended' | 'banned'
          admin_role: AdminRole | null
          admin_status: AdminStatus | null
          last_seen_at: string
          created_at: string
          updated_at: string
        }
        Insert: {
          id: string
          username: string
          full_name?: string | null
          phone_number?: string | null
          avatar_url?: string | null
          role?: 'player' | 'admin'
          status?: 'active' | 'suspended' | 'banned'
          admin_role?: AdminRole | null
          admin_status?: AdminStatus | null
          last_seen_at?: string
          created_at?: string
          updated_at?: string
        }
        Update: {
          id?: string
          username?: string
          full_name?: string | null
          phone_number?: string | null
          avatar_url?: string | null
          role?: 'player' | 'admin'
          status?: 'active' | 'suspended' | 'banned'
          admin_role?: AdminRole | null
          admin_status?: AdminStatus | null
          last_seen_at?: string
          created_at?: string
          updated_at?: string
        }
        Relationships: []
      }
      wallets: {
        Row: {
          id: string
          user_id: string
          balance_cents: number
          locked_cents: number
          currency: string
          updated_at: string
        }
        Insert: {
          id?: string
          user_id: string
          balance_cents?: number
          locked_cents?: number
          currency?: string
          updated_at?: string
        }
        Update: {
          id?: string
          user_id?: string
          balance_cents?: number
          locked_cents?: number
          currency?: string
          updated_at?: string
        }
        Relationships: [{ foreignKeyName: 'wallets_user_id_fkey'; columns: ['user_id']; referencedRelation: 'profiles'; referencedColumns: ['id'] }]
      }
      games: {
        Row: {
          id: string
          slug: GameSlug
          name: string
          description: string | null
          min_players: number
          max_players: number
          is_active: boolean
          created_at: string
        }
        Insert: {
          id?: string
          slug: GameSlug
          name: string
          description?: string | null
          min_players?: number
          max_players?: number
          is_active?: boolean
          created_at?: string
        }
        Update: {
          id?: string
          slug?: GameSlug
          name?: string
          description?: string | null
          min_players?: number
          max_players?: number
          is_active?: boolean
          created_at?: string
        }
        Relationships: []
      }
      matches: {
        Row: {
          id: string
          game_id: string
          host_id: string
          stake_cents: number
          pot_cents: number
          max_players: number
          status: MatchStatus
          winner_id: string | null
          created_at: string
          started_at: string | null
          completed_at: string | null
        }
        Insert: {
          id?: string
          game_id: string
          host_id: string
          stake_cents: number
          pot_cents?: number
          max_players?: number
          status?: MatchStatus
          winner_id?: string | null
          created_at?: string
          started_at?: string | null
          completed_at?: string | null
        }
        Update: {
          id?: string
          game_id?: string
          host_id?: string
          stake_cents?: number
          pot_cents?: number
          max_players?: number
          status?: MatchStatus
          winner_id?: string | null
          created_at?: string
          started_at?: string | null
          completed_at?: string | null
        }
        Relationships: [
          { foreignKeyName: 'matches_game_id_fkey'; columns: ['game_id']; referencedRelation: 'games'; referencedColumns: ['id'] },
          { foreignKeyName: 'matches_host_id_fkey'; columns: ['host_id']; referencedRelation: 'profiles'; referencedColumns: ['id'] },
        ]
      }
      match_players: {
        Row: {
          id: string
          match_id: string
          user_id: string
          seat: number
          joined_at: string
        }
        Insert: {
          id?: string
          match_id: string
          user_id: string
          seat: number
          joined_at?: string
        }
        Update: {
          id?: string
          match_id?: string
          user_id?: string
          seat?: number
          joined_at?: string
        }
        Relationships: [
          { foreignKeyName: 'match_players_match_id_fkey'; columns: ['match_id']; referencedRelation: 'matches'; referencedColumns: ['id'] },
          { foreignKeyName: 'match_players_user_id_fkey'; columns: ['user_id']; referencedRelation: 'profiles'; referencedColumns: ['id'] },
        ]
      }
      transactions: {
        Row: {
          id: string
          user_id: string
          match_id: string | null
          type: TransactionType
          status: TransactionStatus
          amount_cents: number
          mpesa_receipt: string | null
          mpesa_phone: string | null
          created_at: string
        }
        Insert: {
          id?: string
          user_id: string
          match_id?: string | null
          type: TransactionType
          status?: TransactionStatus
          amount_cents: number
          mpesa_receipt?: string | null
          mpesa_phone?: string | null
          created_at?: string
        }
        Update: {
          id?: string
          user_id?: string
          match_id?: string | null
          type?: TransactionType
          status?: TransactionStatus
          amount_cents?: number
          mpesa_receipt?: string | null
          mpesa_phone?: string | null
          created_at?: string
        }
        Relationships: [
          { foreignKeyName: 'transactions_user_id_fkey'; columns: ['user_id']; referencedRelation: 'profiles'; referencedColumns: ['id'] },
        ]
      }
      // ---- Checkers-specific tables ----------------------------------------
      checkers_contests: {
        Row: {
          id: string
          host_id: string
          variant: CheckersVariant
          theme: CheckersTheme
          entry_fee_cents: number
          pot_cents: number
          status: ContestStatus
          winner_id: string | null
          forfeited_by: string | null
          room_code: string
          board_state: CheckersBoard | null
          turn: 'black' | 'white' | null
          move_count: number
          created_at: string
          booked_at: string | null
          started_at: string | null
          completed_at: string | null
        }
        Insert: {
          id?: string
          host_id: string
          variant?: CheckersVariant
          theme?: CheckersTheme
          entry_fee_cents?: number
          pot_cents?: number
          status?: ContestStatus
          winner_id?: string | null
          forfeited_by?: string | null
          room_code?: string
          board_state?: CheckersBoard | null
          turn?: 'black' | 'white' | null
          move_count?: number
          created_at?: string
          booked_at?: string | null
          started_at?: string | null
          completed_at?: string | null
        }
        Update: {
          id?: string
          host_id?: string
          variant?: CheckersVariant
          theme?: CheckersTheme
          entry_fee_cents?: number
          pot_cents?: number
          status?: ContestStatus
          winner_id?: string | null
          forfeited_by?: string | null
          room_code?: string
          board_state?: CheckersBoard | null
          turn?: 'black' | 'white' | null
          move_count?: number
          created_at?: string
          booked_at?: string | null
          started_at?: string | null
          completed_at?: string | null
        }
        Relationships: [
          { foreignKeyName: 'checkers_contests_host_id_fkey'; columns: ['host_id']; referencedRelation: 'profiles'; referencedColumns: ['id'] },
        ]
      }
      checkers_contest_players: {
        Row: {
          id: string
          contest_id: string
          user_id: string
          seat: number
          color: 'black' | 'white'
          joined_at: string
        }
        Insert: {
          id?: string
          contest_id: string
          user_id: string
          seat: number
          color: 'black' | 'white'
          joined_at?: string
        }
        Update: {
          id?: string
          contest_id?: string
          user_id?: string
          seat?: number
          color?: 'black' | 'white'
          joined_at?: string
        }
        Relationships: [
          { foreignKeyName: 'checkers_contest_players_contest_id_fkey'; columns: ['contest_id']; referencedRelation: 'checkers_contests'; referencedColumns: ['id'] },
          { foreignKeyName: 'checkers_contest_players_user_id_fkey'; columns: ['user_id']; referencedRelation: 'profiles'; referencedColumns: ['id'] },
        ]
      }
      checkers_trial_usage: {
        Row: {
          id: string
          user_id: string
          variant: CheckersVariant
          usage_date: string
          match_count: number
        }
        Insert: {
          id?: string
          user_id: string
          variant: CheckersVariant
          usage_date?: string
          match_count?: number
        }
        Update: {
          id?: string
          user_id?: string
          variant?: CheckersVariant
          usage_date?: string
          match_count?: number
        }
        Relationships: [
          { foreignKeyName: 'checkers_trial_usage_user_id_fkey'; columns: ['user_id']; referencedRelation: 'profiles'; referencedColumns: ['id'] },
        ]
      }
      // ---- Ludo-specific tables ---------------------------------------------
      ludo_contests: {
        Row: {
          id: string
          host_id: string
          theme: LudoTheme
          max_players: number
          entry_fee_cents: number
          pot_cents: number
          status: ContestStatus
          winner_id: string | null
          forfeited_by: string | null
          room_code: string
          game_state: LudoGameState | null
          current_seat: number | null
          move_count: number
          created_at: string
          booked_at: string | null
          started_at: string | null
          completed_at: string | null
        }
        Insert: {
          id?: string
          host_id: string
          theme?: LudoTheme
          max_players?: number
          entry_fee_cents?: number
          pot_cents?: number
          status?: ContestStatus
          winner_id?: string | null
          forfeited_by?: string | null
          room_code?: string
          game_state?: LudoGameState | null
          current_seat?: number | null
          move_count?: number
          created_at?: string
          booked_at?: string | null
          started_at?: string | null
          completed_at?: string | null
        }
        Update: {
          id?: string
          host_id?: string
          theme?: LudoTheme
          max_players?: number
          entry_fee_cents?: number
          pot_cents?: number
          status?: ContestStatus
          winner_id?: string | null
          forfeited_by?: string | null
          room_code?: string
          game_state?: LudoGameState | null
          current_seat?: number | null
          move_count?: number
          created_at?: string
          booked_at?: string | null
          started_at?: string | null
          completed_at?: string | null
        }
        Relationships: [
          { foreignKeyName: 'ludo_contests_host_id_fkey'; columns: ['host_id']; referencedRelation: 'profiles'; referencedColumns: ['id'] },
        ]
      }
      ludo_contest_players: {
        Row: {
          id: string
          contest_id: string
          user_id: string
          seat: number
          color: LudoColor
          left_at: string | null
          joined_at: string
        }
        Insert: {
          id?: string
          contest_id: string
          user_id: string
          seat: number
          color: LudoColor
          left_at?: string | null
          joined_at?: string
        }
        Update: {
          id?: string
          contest_id?: string
          user_id?: string
          seat?: number
          color?: LudoColor
          left_at?: string | null
          joined_at?: string
        }
        Relationships: [
          { foreignKeyName: 'ludo_contest_players_contest_id_fkey'; columns: ['contest_id']; referencedRelation: 'ludo_contests'; referencedColumns: ['id'] },
          { foreignKeyName: 'ludo_contest_players_user_id_fkey'; columns: ['user_id']; referencedRelation: 'profiles'; referencedColumns: ['id'] },
        ]
      }
      ludo_trial_usage: {
        Row: {
          id: string
          user_id: string
          usage_date: string
          match_count: number
        }
        Insert: {
          id?: string
          user_id: string
          usage_date?: string
          match_count?: number
        }
        Update: {
          id?: string
          user_id?: string
          usage_date?: string
          match_count?: number
        }
        Relationships: [
          { foreignKeyName: 'ludo_trial_usage_user_id_fkey'; columns: ['user_id']; referencedRelation: 'profiles'; referencedColumns: ['id'] },
        ]
      }
      paynexus_payments: {
        Row: {
          id: string
          user_id: string
          transaction_id: string
          status: TransactionStatus
          amount_cents: number
          phone: string
          reference: string
          checkout_request_id: string | null
          merchant_request_id: string | null
          payment_id_external: number | null
          idempotency_key: string
          mpesa_receipt: string | null
          raw_webhook_payload: Json | null
          created_at: string
          updated_at: string
        }
        Insert: {
          id?: string
          user_id: string
          transaction_id: string
          status?: TransactionStatus
          amount_cents: number
          phone: string
          reference: string
          checkout_request_id?: string | null
          merchant_request_id?: string | null
          payment_id_external?: number | null
          idempotency_key: string
          mpesa_receipt?: string | null
          raw_webhook_payload?: Json | null
          created_at?: string
          updated_at?: string
        }
        Update: {
          id?: string
          user_id?: string
          transaction_id?: string
          status?: TransactionStatus
          amount_cents?: number
          phone?: string
          reference?: string
          checkout_request_id?: string | null
          merchant_request_id?: string | null
          payment_id_external?: number | null
          idempotency_key?: string
          mpesa_receipt?: string | null
          raw_webhook_payload?: Json | null
          created_at?: string
          updated_at?: string
        }
        Relationships: [
          { foreignKeyName: 'paynexus_payments_user_id_fkey'; columns: ['user_id']; referencedRelation: 'profiles'; referencedColumns: ['id'] },
          { foreignKeyName: 'paynexus_payments_transaction_id_fkey'; columns: ['transaction_id']; referencedRelation: 'transactions'; referencedColumns: ['id'] },
        ]
      }
    }
    Views: Record<string, never>
    Functions: {
      is_admin: { Args: Record<string, never>; Returns: boolean }
      host_checkers_contest: {
        Args: {
          p_host_id: string
          p_variant: CheckersVariant
          p_theme: CheckersTheme
          p_entry_fee_cents: number
        }
        Returns: string   // contest UUID or 'err:...'
      }
      join_checkers_contest: {
        Args: { p_contest_id: string; p_user_id: string }
        Returns: string   // 'ok' | 'insufficient_funds' | 'already_full' | 'not_found' | 'trial_limit_reached'
      }
      leave_checkers_contest: {
        Args: { p_contest_id: string; p_user_id: string }
        Returns: string   // 'cancelled' | 'left' | 'forfeited' | 'not_found' | 'not_a_player' | 'already_over' | 'error'
      }
      complete_checkers_contest: {
        Args: { p_contest_id: string; p_winner_id: string | null }
        Returns: void
      }
      make_checkers_move: {
        Args: {
          p_contest_id: string
          p_user_id: string
          p_board_state: CheckersBoard
          p_turn: 'black' | 'white'
          p_move_count: number
          p_game_over?: boolean
          p_winner_id?: string | null
        }
        Returns: string   // 'ok' | 'not_found' | 'not_a_player' | 'not_in_progress' | 'not_your_turn'
      }
      seed_checkers_board: {
        Args: {
          p_contest_id: string
          p_user_id: string
          p_board_state: CheckersBoard
          p_turn: 'black' | 'white'
          p_move_count: number
        }
        Returns: string   // 'ok' | 'already_seeded' | 'not_found' | 'not_a_player' | 'not_in_progress'
      }
      get_checkers_trial_remaining: {
        Args: { p_user_id: string; p_variant: CheckersVariant }
        Returns: number
      }
      get_open_checkers_contests: {
        Args: Record<string, never>
        Returns: Array<{
          id: string
          host_username: string
          variant: CheckersVariant
          theme: CheckersTheme
          entry_fee_cents: number
          room_code: string
          created_at: string
        }>
      }
      // ---- Ludo-specific functions ------------------------------------------
      host_ludo_contest: {
        Args: {
          p_host_id: string
          p_theme: LudoTheme
          p_max_players: number
          p_entry_fee_cents: number
        }
        Returns: string   // contest UUID or 'err:...'
      }
      join_ludo_contest: {
        Args: { p_contest_id: string; p_user_id: string }
        Returns: string   // 'ok' | 'insufficient_funds' | 'already_full' | 'not_found' | 'trial_limit_reached'
      }
      leave_ludo_contest: {
        Args: { p_contest_id: string; p_user_id: string }
        Returns: string   // 'cancelled' | 'left' | 'forfeited' | 'completed' | 'not_found' | 'not_a_player' | 'already_over' | 'error'
      }
      complete_ludo_contest: {
        Args: { p_contest_id: string; p_winner_id: string | null }
        Returns: void
      }
      make_ludo_move: {
        Args: {
          p_contest_id: string
          p_user_id: string
          p_game_state: LudoGameState
          p_current_seat: number
          p_move_count: number
          p_game_over?: boolean
          p_winner_id?: string | null
        }
        Returns: string   // 'ok' | 'not_found' | 'not_a_player' | 'not_in_progress' | 'not_your_turn'
      }
      seed_ludo_board: {
        Args: {
          p_contest_id: string
          p_user_id: string
          p_game_state: LudoGameState
          p_current_seat: number
          p_move_count: number
        }
        Returns: string   // 'ok' | 'already_seeded' | 'not_found' | 'not_a_player' | 'not_in_progress'
      }
      get_ludo_trial_remaining: {
        Args: { p_user_id: string }
        Returns: number
      }
      get_open_ludo_contests: {
        Args: Record<string, never>
        Returns: Array<{
          id: string
          host_username: string
          theme: LudoTheme
          max_players: number
          seated_players: number
          entry_fee_cents: number
          room_code: string
          created_at: string
        }>
      }
      paynexus_create_pending_deposit: {
        Args: {
          p_user_id: string
          p_amount_cents: number
          p_phone: string
          p_reference: string
          p_checkout_request_id: string
          p_merchant_request_id: string
          p_payment_id_external: number
          p_idempotency_key: string
        }
        Returns: string // new paynexus_payments.id
      }
      paynexus_resolve_deposit: {
        Args: {
          p_reference: string
          p_new_status: TransactionStatus
          p_mpesa_receipt: string | null
          p_raw_payload: Json
        }
        Returns: string // 'ok' | 'not_found' | 'already_resolved' | 'invalid_status'
      }
    }
    Enums: {
      user_role: 'player' | 'admin'
      user_status: 'active' | 'suspended' | 'banned'
      game_slug: GameSlug
      match_status: MatchStatus
      transaction_type: TransactionType
      transaction_status: TransactionStatus
      admin_role: AdminRole
      admin_status: AdminStatus
      checkers_variant: CheckersVariant
      checkers_theme: CheckersTheme
      contest_status: ContestStatus
      ludo_theme: LudoTheme
      ludo_color: LudoColor
    }
    CompositeTypes: Record<string, never>
  }
}
