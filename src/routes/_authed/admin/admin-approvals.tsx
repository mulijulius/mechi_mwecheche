import * as React from 'react'
import { createFileRoute, redirect } from '@tanstack/react-router'
import { Check, Loader2, Trash2, UserCog, X } from 'lucide-react'
import { Card, CardContent, CardHeader, CardTitle } from '#/components/ui/card'
import { Badge } from '#/components/ui/badge'
import { Button } from '#/components/ui/button'
import { Avatar, AvatarFallback } from '#/components/ui/avatar'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '#/components/ui/select'
import { supabase } from '#/utils/supabase'
import { formatRelativeTime } from '#/utils/format'
import { ADMIN_ROLE_LABEL } from '#/lib/admin-permissions'
import { useAuth } from '#/lib/auth-context'
import type { AdminRole, Database } from '#/types/database.types'

export const Route = createFileRoute('/_authed/admin/approvals')({
  beforeLoad: async () => {
    const { data: sessionData } = await supabase.auth.getSession()
    const userId = sessionData.session?.user.id
    if (!userId) throw redirect({ to: '/signin' })

    const { data: profile } = await supabase
      .from('profiles')
      .select('admin_role, admin_status')
      .eq('id', userId)
      .single()

    if (profile?.admin_role !== 'super_admin' || profile.admin_status !== 'approved') {
      throw redirect({ to: '/admin' })
    }
  },
  component: AdminApprovalsPage,
})

type Profile = Database['public']['Tables']['profiles']['Row']

function AdminApprovalsPage() {
  const { user } = useAuth()
  const [profiles, setProfiles] = React.useState<Array<Profile>>([])
  const [isLoading, setIsLoading] = React.useState(true)
  const [busyId, setBusyId] = React.useState<string | null>(null)
  const [error, setError] = React.useState<string | null>(null)

  const load = React.useCallback(async () => {
    const { data } = await supabase
      .from('profiles')
      .select('*')
      .order('created_at', { ascending: false })
    setProfiles(data ?? [])
    setIsLoading(false)
  }, [])

  React.useEffect(() => {
    load()
  }, [load])

  const pendingAdmins = profiles.filter(
    (p) => p.role === 'admin' && p.admin_status === 'pending',
  )
  const approvedAdmins = profiles.filter(
    (p) => p.role === 'admin' && p.admin_status === 'approved',
  )
  const players = profiles.filter((p) => p.role === 'player')

  async function reviewRequest(id: string, decision: 'approved' | 'rejected') {
    setBusyId(id)
    setError(null)
    const { error: rpcError } = await supabase.rpc('review_admin_request', {
      p_user_id: id,
      p_decision: decision,
    })
    if (rpcError) setError(rpcError.message)
    await load()
    setBusyId(null)
  }

  async function changeRole(id: string, role: 'player' | 'admin', adminRole: AdminRole | null) {
    setBusyId(id)
    setError(null)
    const { error: rpcError } = await supabase.rpc('admin_set_role', {
      p_user_id: id,
      p_role: role,
      p_admin_role: adminRole,
    })
    if (rpcError) setError(rpcError.message)
    await load()
    setBusyId(null)
  }

  async function deleteUser(id: string) {
    if (id === user?.id) return
    if (!window.confirm('Remove this user from the platform? This cannot be undone.')) return
    setBusyId(id)
    setError(null)
    const { error: rpcError } = await supabase.rpc('admin_delete_user', { p_user_id: id })
    if (rpcError) setError(rpcError.message)
    await load()
    setBusyId(null)
  }

  return (
    <div>
      <div className="mb-6">
        <p className="font-mono text-xs uppercase tracking-[0.2em] text-arena-gold">
          Admin console · Super admin
        </p>
        <h1 className="mt-1 font-display text-2xl font-semibold text-arena-text">
          User &amp; admin approvals
        </h1>
        <p className="mt-1 text-sm text-arena-text-dim">
          Players never need approval. Admin sign-ups (support, finance manager, or another
          super admin) wait here until you approve or reject them.
        </p>
      </div>

      {error && (
        <p className="mb-4 rounded-md border border-arena-red/30 bg-arena-red/10 px-3 py-2 text-sm text-arena-red">
          {error}
        </p>
      )}

      {isLoading ? (
        <div className="flex items-center justify-center gap-2 py-16 text-sm text-arena-text-dim">
          <Loader2 className="size-4 animate-spin" />
          Loading users…
        </div>
      ) : (
        <div className="flex flex-col gap-6">
          <Card>
            <CardHeader>
              <CardTitle>Pending admin requests ({pendingAdmins.length})</CardTitle>
            </CardHeader>
            <CardContent className="p-0">
              {pendingAdmins.length === 0 ? (
                <div className="px-5 py-8 text-center text-sm text-arena-text-dim">
                  No admin requests waiting on review.
                </div>
              ) : (
                <ul className="divide-y divide-arena-border">
                  {pendingAdmins.map((p) => (
                    <li key={p.id} className="flex items-center justify-between px-5 py-3">
                      <UserRow profile={p} />
                      <div className="flex items-center gap-2">
                        <Badge variant="gold">
                          {p.admin_role ? ADMIN_ROLE_LABEL[p.admin_role] : 'admin'}
                        </Badge>
                        <Button
                          size="sm"
                          variant="emerald"
                          disabled={busyId === p.id}
                          onClick={() => reviewRequest(p.id, 'approved')}
                        >
                          <Check className="size-4" />
                          Approve
                        </Button>
                        <Button
                          size="sm"
                          variant="destructive"
                          disabled={busyId === p.id}
                          onClick={() => reviewRequest(p.id, 'rejected')}
                        >
                          <X className="size-4" />
                          Reject
                        </Button>
                      </div>
                    </li>
                  ))}
                </ul>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Approved admins ({approvedAdmins.length})</CardTitle>
            </CardHeader>
            <CardContent className="p-0">
              <ul className="divide-y divide-arena-border">
                {approvedAdmins.map((p) => (
                  <li key={p.id} className="flex items-center justify-between px-5 py-3">
                    <UserRow profile={p} />
                    <div className="flex items-center gap-2">
                      <Select
                        value={p.admin_role ?? undefined}
                        onValueChange={(v: string) => changeRole(p.id, 'admin', v as AdminRole)}
                        disabled={busyId === p.id || p.id === user?.id}
                      >
                        <SelectTrigger className="w-44">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="super_admin">Super admin</SelectItem>
                          <SelectItem value="support">Support</SelectItem>
                          <SelectItem value="finance_manager">Finance manager</SelectItem>
                        </SelectContent>
                      </Select>
                      <Button
                        variant="ghost"
                        size="icon"
                        title="Remove user"
                        disabled={busyId === p.id || p.id === user?.id}
                        onClick={() => deleteUser(p.id)}
                      >
                        <Trash2 className="size-4 text-arena-red" />
                      </Button>
                    </div>
                  </li>
                ))}
              </ul>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Players ({players.length})</CardTitle>
            </CardHeader>
            <CardContent className="p-0">
              {players.length === 0 ? (
                <div className="px-5 py-8 text-center text-sm text-arena-text-dim">
                  No players yet.
                </div>
              ) : (
                <ul className="divide-y divide-arena-border">
                  {players.map((p) => (
                    <li key={p.id} className="flex items-center justify-between px-5 py-3">
                      <UserRow profile={p} />
                      <div className="flex items-center gap-2">
                        <Button
                          size="sm"
                          variant="outline"
                          disabled={busyId === p.id}
                          onClick={() => changeRole(p.id, 'admin', 'support')}
                        >
                          <UserCog className="size-4" />
                          Make admin
                        </Button>
                        <Button
                          variant="ghost"
                          size="icon"
                          title="Remove user"
                          disabled={busyId === p.id}
                          onClick={() => deleteUser(p.id)}
                        >
                          <Trash2 className="size-4 text-arena-red" />
                        </Button>
                      </div>
                    </li>
                  ))}
                </ul>
              )}
            </CardContent>
          </Card>
        </div>
      )}
    </div>
  )
}

function UserRow({ profile }: { profile: Profile }) {
  return (
    <div className="flex items-center gap-3">
      <Avatar>
        <AvatarFallback>{profile.username.slice(0, 2).toUpperCase()}</AvatarFallback>
      </Avatar>
      <div>
        <p className="text-sm font-medium text-arena-text">
          {profile.full_name || profile.username}
        </p>
        <p className="text-xs text-arena-text-dim">
          @{profile.username} · joined {formatRelativeTime(profile.created_at)}
        </p>
      </div>
    </div>
  )
}
