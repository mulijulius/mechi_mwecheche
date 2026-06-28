// Generated to match supabase/migrations/0001_init.sql, 0002_security_questions.sql
// and 0003_admin_roles.sql.
// Regenerate with: npx supabase gen types typescript --project-id <id> > src/types/database.types.ts

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

/**
 * Single source of truth for what each admin sub-role can do, mirrored from
 * the has_admin_capability() Postgres function in 0003_admin_roles.sql.
 * Kept here (rather than only in #/lib/admin-permissions.ts) so the type of
 * a capability key is shared with the RPC call sites.
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
        Relationships: [
          {
            foreignKeyName: 'wallets_user_id_fkey'
            columns: ['user_id']
            isOneToOne: true
            referencedRelation: 'profiles'
            referencedColumns: ['id']
          },
        ]
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
          max_players: number
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
          {
            foreignKeyName: 'matches_game_id_fkey'
            columns: ['game_id']
            isOneToOne: false
            referencedRelation: 'games'
            referencedColumns: ['id']
          },
          {
            foreignKeyName: 'matches_host_id_fkey'
            columns: ['host_id']
            isOneToOne: false
            referencedRelation: 'profiles'
            referencedColumns: ['id']
          },
          {
            foreignKeyName: 'matches_winner_id_fkey'
            columns: ['winner_id']
            isOneToOne: false
            referencedRelation: 'profiles'
            referencedColumns: ['id']
          },
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
          {
            foreignKeyName: 'match_players_match_id_fkey'
            columns: ['match_id']
            isOneToOne: false
            referencedRelation: 'matches'
            referencedColumns: ['id']
          },
          {
            foreignKeyName: 'match_players_user_id_fkey'
            columns: ['user_id']
            isOneToOne: false
            referencedRelation: 'profiles'
            referencedColumns: ['id']
          },
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
          {
            foreignKeyName: 'transactions_user_id_fkey'
            columns: ['user_id']
            isOneToOne: false
            referencedRelation: 'profiles'
            referencedColumns: ['id']
          },
          {
            foreignKeyName: 'transactions_match_id_fkey'
            columns: ['match_id']
            isOneToOne: false
            referencedRelation: 'matches'
            referencedColumns: ['id']
          },
        ]
      }
      security_questions: {
        Row: {
          id: string
          user_id: string
          question_text: string
          answer_hash: string
          created_at: string
          updated_at: string
        }
        Insert: {
          id?: string
          user_id: string
          question_text: string
          answer_hash: string
          created_at?: string
          updated_at?: string
        }
        Update: {
          id?: string
          user_id?: string
          question_text?: string
          answer_hash?: string
          created_at?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: 'security_questions_user_id_fkey'
            columns: ['user_id']
            isOneToOne: true
            referencedRelation: 'profiles'
            referencedColumns: ['id']
          },
        ]
      }
      support_messages: {
        Row: {
          id: string
          player_id: string
          sender: SupportMessageSender
          sender_id: string
          body: string
          created_at: string
        }
        Insert: {
          id?: string
          player_id: string
          sender: SupportMessageSender
          sender_id: string
          body: string
          created_at?: string
        }
        Update: {
          id?: string
          player_id?: string
          sender?: SupportMessageSender
          sender_id?: string
          body?: string
          created_at?: string
        }
        Relationships: [
          {
            foreignKeyName: 'support_messages_player_id_fkey'
            columns: ['player_id']
            isOneToOne: false
            referencedRelation: 'profiles'
            referencedColumns: ['id']
          },
          {
            foreignKeyName: 'support_messages_sender_id_fkey'
            columns: ['sender_id']
            isOneToOne: false
            referencedRelation: 'profiles'
            referencedColumns: ['id']
          },
        ]
      }
    }
    Views: Record<string, never>
    Functions: {
      hash_security_answer: {
        Args: { answer: string }
        Returns: string
      }
      get_security_question: {
        Args: { p_email: string }
        Returns: string | null
      }
      verify_security_answer: {
        Args: { p_email: string; p_answer: string }
        Returns: boolean
      }
      is_admin: {
        Args: Record<PropertyKey, never>
        Returns: boolean
      }
      is_approved_admin: {
        Args: Record<PropertyKey, never>
        Returns: boolean
      }
      is_super_admin: {
        Args: Record<PropertyKey, never>
        Returns: boolean
      }
      current_admin_role: {
        Args: Record<PropertyKey, never>
        Returns: AdminRole | null
      }
      has_admin_capability: {
        Args: { p_capability: AdminCapability }
        Returns: boolean
      }
      touch_presence: {
        Args: Record<PropertyKey, never>
        Returns: undefined
      }
      review_admin_request: {
        Args: { p_user_id: string; p_decision: AdminStatus }
        Returns: undefined
      }
      admin_set_role: {
        Args: { p_user_id: string; p_role: 'player' | 'admin'; p_admin_role?: AdminRole | null }
        Returns: undefined
      }
      admin_delete_user: {
        Args: { p_user_id: string }
        Returns: undefined
      }
    }
  }
}