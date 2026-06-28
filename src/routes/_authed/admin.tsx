import { Outlet, createFileRoute, redirect } from '@tanstack/react-router'
import { Sidebar } from '#/components/layout/sidebar'
import { SidebarProvider, useSidebar } from '#/lib/sidebar-context'
import { cn } from '#/lib/utils'
import { supabase } from '#/utils/supabase'

export const Route = createFileRoute('/_authed/admin')({
  beforeLoad: async ({ location }) => {
    const { data: sessionData } = await supabase.auth.getSession()
    const userId = sessionData.session?.user.id
    if (!userId) {
      throw redirect({ to: '/signin' })
    }

    const { data: profile } = await supabase
      .from('profiles')
      .select('role, admin_role, admin_status')
      .eq('id', userId)
      .single()

    if (profile?.role !== 'admin') {
      throw redirect({ to: '/dashboard' })
    }

    // A pending/rejected admin account cannot reach the console — except
    // the pending-review page itself, which explains their status. This
    // gate never applies to players; they have no admin_status at all.
    if (profile.admin_status !== 'approved' && location.pathname !== '/admin/pending') {
      throw redirect({ to: '/admin/pending' })
    }

    // An approved admin shouldn't sit on the "awaiting review" screen.
    if (profile.admin_status === 'approved' && location.pathname === '/admin/pending') {
      throw redirect({ to: '/admin' })
    }
  },
  component: AdminLayout,
})

function AdminLayout() {
  return (
    <SidebarProvider>
      <AdminLayoutContent />
    </SidebarProvider>
  )
}

function AdminLayoutContent() {
  const { isOpen } = useSidebar()

  return (
    <div className="flex bg-arena-bg">
      <Sidebar variant="admin" />
      <main
        className={cn(
          'min-w-0 flex-1 p-6 pt-20',
          // The floating hamburger only needs clearance reserved when
          // it's actually visible — i.e. whenever the sidebar is closed,
          // at any screen width, not just below lg.
          !isOpen && 'lg:pt-20',
          isOpen && 'lg:pt-6',
        )}
      >
        <Outlet />
      </main>
    </div>
  )
}
