import * as React from 'react'
import type { Session, User } from '@supabase/supabase-js'
import { supabase } from '#/utils/supabase'
import { adminCan } from '#/lib/admin-permissions'
import type { Database, AdminCapability } from '#/types/database.types'

type Profile = Database['public']['Tables']['profiles']['Row']
type Wallet = Database['public']['Tables']['wallets']['Row']

interface AuthContextValue {
  session: Session | null
  user: User | null
  profile: Profile | null
  wallet: Wallet | null
  isLoading: boolean
  /** True once the profile has loaded and role === 'admin' && admin_status === 'approved'. */
  isApprovedAdmin: boolean
  /** True for an approved super_admin specifically. */
  isSuperAdmin: boolean
  /** Capability check against the signed-in admin's sub-role. Always false for players. */
  can: (capability: AdminCapability) => boolean
  refreshProfile: () => Promise<void>
  signOut: () => Promise<void>
}

const AuthContext = React.createContext<AuthContextValue | undefined>(undefined)

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [session, setSession] = React.useState<Session | null>(null)
  const [profile, setProfile] = React.useState<Profile | null>(null)
  const [wallet, setWallet] = React.useState<Wallet | null>(null)
  const [isLoading, setIsLoading] = React.useState(true)

  const loadProfileAndWallet = React.useCallback(async (userId: string) => {
    const [profileRes, walletRes] = await Promise.all([
      supabase.from('profiles').select('*').eq('id', userId).single(),
      supabase.from('wallets').select('*').eq('user_id', userId).single(),
    ])
    if (profileRes.data) setProfile(profileRes.data)
    if (walletRes.data) setWallet(walletRes.data)
  }, [])

  const refreshProfile = React.useCallback(async () => {
    if (session?.user.id) {
      await loadProfileAndWallet(session.user.id)
    }
  }, [session?.user.id, loadProfileAndWallet])

  React.useEffect(() => {
    let isMounted = true

    supabase.auth.getSession().then(({ data }) => {
      if (!isMounted) return
      setSession(data.session)
      if (data.session?.user.id) {
        loadProfileAndWallet(data.session.user.id).finally(() => {
          if (isMounted) setIsLoading(false)
        })
      } else {
        setIsLoading(false)
      }
    })

    const { data: listener } = supabase.auth.onAuthStateChange(
      (_event, newSession) => {
        setSession(newSession)
        if (newSession?.user.id) {
          loadProfileAndWallet(newSession.user.id)
        } else {
          setProfile(null)
          setWallet(null)
        }
      },
    )

    return () => {
      isMounted = false
      listener.subscription.unsubscribe()
    }
  }, [loadProfileAndWallet])

  // Live-update wallet balance across the app via Supabase Realtime
  React.useEffect(() => {
    if (!session?.user.id) return

    const channel = supabase
      .channel(`wallet-${session.user.id}`)
      .on(
        'postgres_changes',
        {
          event: 'UPDATE',
          schema: 'public',
          table: 'wallets',
          filter: `user_id=eq.${session.user.id}`,
        },
        (payload) => {
          setWallet(payload.new as Wallet)
        },
      )
      .subscribe()

    return () => {
      supabase.removeChannel(channel)
    }
  }, [session?.user.id])

  // Presence heartbeat: marks this user as "active" for the admin
  // statistics/traffic views (`last_seen_at` on profiles). Fires once on
  // sign-in, then every 60s while the tab is open and signed in.
  React.useEffect(() => {
    if (!session?.user.id) return

    let isMounted = true
    const beat = () => {
      if (isMounted) supabase.rpc('touch_presence')
    }

    beat()
    const interval = window.setInterval(beat, 60_000)

    return () => {
      isMounted = false
      window.clearInterval(interval)
    }
  }, [session?.user.id])

  const signOut = React.useCallback(async () => {
    await supabase.auth.signOut()
  }, [])

  const isApprovedAdmin = profile?.role === 'admin' && profile.admin_status === 'approved'
  const isSuperAdmin = isApprovedAdmin && profile?.admin_role === 'super_admin'

  const can = React.useCallback(
    (capability: AdminCapability) => {
      if (!isApprovedAdmin) return false
      return adminCan(profile?.admin_role ?? null, capability)
    },
    [isApprovedAdmin, profile?.admin_role],
  )

  const value = React.useMemo(
    () => ({
      session,
      user: session?.user ?? null,
      profile,
      wallet,
      isLoading,
      isApprovedAdmin,
      isSuperAdmin,
      can,
      refreshProfile,
      signOut,
    }),
    [session, profile, wallet, isLoading, isApprovedAdmin, isSuperAdmin, can, refreshProfile, signOut],
  )

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}

export function useAuth() {
  const ctx = React.useContext(AuthContext)
  if (!ctx) throw new Error('useAuth must be used within an AuthProvider')
  return ctx
}
