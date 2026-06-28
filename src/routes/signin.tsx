import * as React from 'react'
import { Link, createFileRoute, useNavigate } from '@tanstack/react-router'
import { Loader2, LogIn } from 'lucide-react'
import { AuthLayout } from '#/components/layout/auth-layout'
import { Button } from '#/components/ui/button'
import { Input } from '#/components/ui/input'
import { Label } from '#/components/ui/label'
import { supabase } from '#/utils/supabase'

export const Route = createFileRoute('/signin')({
  component: SignInPage,
})

function SignInPage() {
  const navigate = useNavigate()
  const [email, setEmail] = React.useState('')
  const [password, setPassword] = React.useState('')
  const [isSubmitting, setIsSubmitting] = React.useState(false)
  const [error, setError] = React.useState<string | null>(null)

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError(null)
    setIsSubmitting(true)

    const { data: signInData, error: signInError } = await supabase.auth.signInWithPassword({
      email,
      password,
    })

    if (signInError) {
      setIsSubmitting(false)
      setError(signInError.message)
      return
    }

    // Route admins to the admin console (which itself redirects to the
    // pending-review screen if they aren't approved yet) and players to
    // their dashboard, same as before.
    const userId = signInData.user?.id
    const { data: profile } = userId
      ? await supabase.from('profiles').select('role').eq('id', userId).single()
      : { data: null }

    setIsSubmitting(false)
    navigate({ to: profile?.role === 'admin' ? '/admin' : '/dashboard' })
  }

  return (
    <AuthLayout
      eyebrow="Welcome back"
      title="The table's still open."
      description="Sign in to check your balance, rejoin a match, or host a new table."
    >
      <h2 className="mb-1 font-display text-2xl font-semibold text-arena-text">
        Sign in
      </h2>
      <p className="mb-6 text-sm text-arena-text-dim">
        New here?{' '}
        <Link to="/signup" className="font-medium text-arena-gold hover:underline">
          Create an account
        </Link>
      </p>

      <form onSubmit={handleSubmit} className="flex flex-col gap-4">
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="email">Email</Label>
          <Input
            id="email"
            type="email"
            autoComplete="email"
            placeholder="you@example.com"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            required
          />
        </div>

        <div className="flex flex-col gap-1.5">
          <div className="flex items-center justify-between">
            <Label htmlFor="password">Password</Label>
            <Link to="/forgot-password" className="text-xs text-arena-text-dim hover:text-arena-gold">
              Forgot password?
            </Link>
          </div>
          <Input
            id="password"
            type="password"
            autoComplete="current-password"
            placeholder="••••••••"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            required
          />
        </div>

        {error && (
          <p className="rounded-md border border-arena-red/30 bg-arena-red/10 px-3 py-2 text-sm text-arena-red">
            {error}
          </p>
        )}

        <Button type="submit" size="lg" className="mt-2 w-full" disabled={isSubmitting}>
          {isSubmitting ? <Loader2 className="size-4 animate-spin" /> : <LogIn className="size-4" />}
          Sign in
        </Button>
      </form>
    </AuthLayout>
  )
}