import { createFileRoute } from '@tanstack/react-router'
import { Clock3, ShieldAlert } from 'lucide-react'
import { Card, CardContent } from '#/components/ui/card'
import { useAuth } from '#/lib/auth-context'
import { ADMIN_ROLE_LABEL } from '#/lib/admin-permissions'

export const Route = createFileRoute('/_authed/admin/pending')({
  component: AdminPendingPage,
})

function AdminPendingPage() {
  const { profile, signOut } = useAuth()
  const isRejected = profile?.admin_status === 'rejected'
  const roleLabel = profile?.admin_role ? ADMIN_ROLE_LABEL[profile.admin_role] : 'admin'

  return (
    <div className="flex min-h-screen items-center justify-center bg-arena-bg px-6">
      <Card className="max-w-md p-8 text-center">
        <CardContent className="flex flex-col items-center gap-4 p-0">
          {isRejected ? (
            <ShieldAlert className="size-10 text-arena-red" />
          ) : (
            <Clock3 className="size-10 text-arena-gold" />
          )}

          <div>
            <h1 className="font-display text-xl font-semibold text-arena-text">
              {isRejected ? 'Admin request declined' : 'Awaiting super admin approval'}
            </h1>
            <p className="mt-2 text-sm text-arena-text-dim">
              {isRejected ? (
                <>
                  Your request for <span className="text-arena-text">{roleLabel}</span> access
                  was declined by a super admin. If you believe this is a mistake, contact the
                  platform owner directly.
                </>
              ) : (
                <>
                  Your <span className="text-arena-text">{roleLabel}</span> account has been
                  created, but a super admin needs to approve it before you can access the
                  console. You&rsquo;ll be able to sign in normally once approved — no further
                  action is needed from you right now.
                </>
              )}
            </p>
          </div>

          <button
            onClick={() => signOut()}
            className="mt-2 text-sm font-medium text-arena-gold hover:underline"
          >
            Sign out
          </button>
        </CardContent>
      </Card>
    </div>
  )
}
