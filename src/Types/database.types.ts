// Generated to match supabase/migrations/0001_init.sql
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
    }
    Views: Record<string, never>
    Functions: Record<string, never>
  }
}
