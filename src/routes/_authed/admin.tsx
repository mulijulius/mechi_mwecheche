import { Outlet, createFileRoute, redirect } from '@tanstack/react-router'
import { Sidebar } from '#/components/layout/sidebar'
import { supabase } from '#/utils/supabase'

export const Route = createFileRoute('/_authed/admin')({
  beforeLoad: async () => {
    const { data: sessionData } = await supabase.auth.getSession()
    const userId = sessionData.session?.user.id
    if (!userId) {
      throw redirect({ to: '/signin' })
    }

    const { data: profile } = await supabase
      .from('profiles')
      .select('role')
      .eq('id', userId)
      .single()

    if (profile?.role !== 'admin') {
      throw redirect({ to: '/dashboard' })
    }
  },
  component: AdminLayout,
})

function AdminLayout() {
  return (
    <div className="flex bg-arena-bg">
      <Sidebar variant="admin" />
      <main className="flex-1 p-6">
        <Outlet />
      </main>
    </div>
  )
}
