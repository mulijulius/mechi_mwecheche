import * as React from 'react'
import { createFileRoute, redirect } from '@tanstack/react-router'
import { Activity, Gamepad2, Loader2, Users, Wifi, WifiOff } from 'lucide-react'
import { Card, CardContent, CardHeader, CardTitle } from '#/components/ui/card'
import { Badge } from '#/components/ui/badge'
import { Avatar, AvatarFallback } from '#/components/ui/avatar'
import { StatCard } from '#/components/dashboard/stat-card'
import { supabase } from '#/utils/supabase'
import { formatRelativeTime } from '#/utils/format'
import type { Database } from '#/types/database.types'

export const Route = createFileRoute('/_authed/admin/traffic')({
  beforeLoad: async () => {
    const { data: sessionData } = await supabase.auth.getSession()
    const userId = sessionData.session?.user.id
    if (!userId) throw redirect({ to: '/signin' })

    const { data: profile } = await supabase
      .from('profiles')
      .select('admin_status')
      .eq('id', userId)
      .single()

    // Statistics/traffic + presence are available to every approved admin
    // sub-role per the brief — no further narrowing needed here beyond the
    // base admin approval check already done by the parent /admin route.
    if (profile?.admin_status !== 'approved') throw redirect({ to: '/admin' })
  },
  component: AdminTrafficPage,
})

type Profile = Database['public']['Tables']['profiles']['Row']

// A user is considered "active" if they've sent a presence heartbeat in
// the last 2 minutes (see touch_presence() in 0003_admin_roles.sql and the
// interval in src/lib/auth-context.tsx).
const ACTIVE_WINDOW_MS = 2 * 60 * 1000

function isActive(lastSeenAt: string) {
  return Date.now() - new Date(lastSeenAt).getTime() < ACTIVE_WINDOW_MS
}

function AdminTrafficPage() {
  const [profiles, setProfiles] = React.useState<Array<Profile>>([])
  const [matchCounts, setMatchCounts] = React.useState({ active: 0, total: 0 })
  const [isLoading, setIsLoading] = React.useState(true)

  React.useEffect(() => {
    let isMounted = true

    async function load() {
      const [profilesRes, activeMatchesRes, totalMatchesRes] = await Promise.all([
        supabase.from('profiles').select('*').order('last_seen_at', { ascending: false }),
        supabase
          .from('matches')
          .select('id', { count: 'exact', head: true })
          .in('status', ['filling', 'in_progress']),
        supabase.from('matches').select('id', { count: 'exact', head: true }),
      ])

      if (isMounted) {
        setProfiles(profilesRes.data ?? [])
        setMatchCounts({
          active: activeMatchesRes.count ?? 0,
          total: totalMatchesRes.count ?? 0,
        })
        setIsLoading(false)
      }
    }

    load()
    // Refresh every 30s so the active/offline split stays current without
    // requiring a manual reload.
    const interval = window.setInterval(load, 30_000)
    return () => {
      isMounted = false
      window.clearInterval(interval)
    }
  }, [])

  const activeUsers = profiles.filter((p) => isActive(p.last_seen_at))
  const offlineUsers = profiles.filter((p) => !isActive(p.last_seen_at))
  const activePlayers = activeUsers.filter((p) => p.role === 'player')
  const activeAdmins = activeUsers.filter((p) => p.role === 'admin')

  return (
    <div>
      <div className="mb-6">
        <p className="font-mono text-xs uppercase tracking-[0.2em] text-arena-gold">
          Admin console · Traffic
        </p>
        <h1 className="mt-1 font-display text-2xl font-semibold text-arena-text">
          Server traffic &amp; statistics
        </h1>
        <p className="mt-1 text-sm text-arena-text-dim">
          Live view of who&rsquo;s online right now, derived from a presence heartbeat sent every
          60 seconds by each signed-in client.
        </p>
      </div>

      {isLoading ? (
        <div className="flex items-center justify-center gap-2 py-16 text-sm text-arena-text-dim">
          <Loader2 className="size-4 animate-spin" />
          Loading statistics…
        </div>
      ) : (
        <>
          <div className="mb-6 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <StatCard label="Online now" value={activeUsers.length.toString()} icon={Wifi} accent="emerald" />
            <StatCard label="Offline" value={offlineUsers.length.toString()} icon={WifiOff} accent="default" />
            <StatCard label="Active matches" value={matchCounts.active.toString()} icon={Gamepad2} accent="gold" />
            <StatCard label="Total registered users" value={profiles.length.toString()} icon={Users} accent="default" />
          </div>

          <div className="mb-6 grid grid-cols-1 gap-4 lg:grid-cols-2">
            <Card className="p-5">
              <p className="text-xs uppercase tracking-wider text-arena-text-dim">
                Online players
              </p>
              <p className="mt-1 font-mono text-2xl font-semibold text-arena-text tabular">
                {activePlayers.length}
              </p>
            </Card>
            <Card className="p-5">
              <p className="text-xs uppercase tracking-wider text-arena-text-dim">
                Online admin staff
              </p>
              <p className="mt-1 font-mono text-2xl font-semibold text-arena-text tabular">
                {activeAdmins.length}
              </p>
            </Card>
          </div>

          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Activity className="size-4 text-arena-emerald" />
                Live presence
              </CardTitle>
            </CardHeader>
            <CardContent className="p-0">
              {profiles.length === 0 ? (
                <div className="px-5 py-10 text-center text-sm text-arena-text-dim">
                  No users yet.
                </div>
              ) : (
                <ul className="divide-y divide-arena-border">
                  {profiles.map((p) => {
                    const online = isActive(p.last_seen_at)
                    return (
                      <li key={p.id} className="flex items-center justify-between px-5 py-3">
                        <div className="flex items-center gap-3">
                          <Avatar>
                            <AvatarFallback>{p.username.slice(0, 2).toUpperCase()}</AvatarFallback>
                          </Avatar>
                          <div>
                            <p className="flex items-center gap-2 text-sm font-medium text-arena-text">
                              {p.full_name || p.username}
                              {p.role === 'admin' && <Badge variant="gold">{p.admin_role}</Badge>}
                            </p>
                            <p className="text-xs text-arena-text-dim">@{p.username}</p>
                          </div>
                        </div>
                        <div className="text-right">
                          <Badge variant={online ? 'emerald' : 'default'}>
                            {online ? 'Online' : 'Offline'}
                          </Badge>
                          <p className="mt-1 text-xs text-arena-text-dim">
                            last seen {formatRelativeTime(p.last_seen_at)}
                          </p>
                        </div>
                      </li>
                    )
                  })}
                </ul>
              )}
            </CardContent>
          </Card>
        </>
      )}
    </div>
  )
}
