import * as React from 'react'
import { Link, createFileRoute, useNavigate } from '@tanstack/react-router'
import { Loader2, UserPlus } from 'lucide-react'
import { AuthLayout } from '#/components/layout/auth-layout'
import { Button } from '#/components/ui/button'
import { Input } from '#/components/ui/input'
import { Label } from '#/components/ui/label'
import { supabase } from '#/utils/supabase'

export const Route = createFileRoute('/signup')({
  component: SignUpPage,
})

function SignUpPage() {
  const navigate = useNavigate()
  const [fullName, setFullName] = React.useState('')
  const [username, setUsername] = React.useState('')
  const [email, setEmail] = React.useState('')
  const [phone, setPhone] = React.useState('')
  const [password, setPassword] = React.useState('')
  const [isSubmitting, setIsSubmitting] = React.useState(false)
  const [error, setError] = React.useState<string | null>(null)
  const [success, setSuccess] = React.useState(false)

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError(null)
    setIsSubmitting(true)

    const { data, error: signUpError } = await supabase.auth.signUp({
      email,
      password,
      options: {
        data: {
          username,
          full_name: fullName,
          phone_number: phone,
        },
      },
    })

    setIsSubmitting(false)

    if (signUpError) {
      setError(signUpError.message)
      return
    }

    // Profile + wallet rows are created automatically by the
    // handle_new_user() trigger defined in supabase/migrations/0001_init.sql
    if (data.session) {
      navigate({ to: '/dashboard' })
    } else {
      // Email confirmation is required before a session exists
      setSuccess(true)
    }
  }

  if (success) {
    return (
      <AuthLayout
        eyebrow="Almost there"
        title="Check your inbox."
        description="Confirm your email to activate your account and wallet."
      >
        <div className="rounded-lg border border-arena-emerald/30 bg-arena-emerald/10 p-5">
          <h2 className="mb-1 font-display text-lg font-semibold text-arena-text">
            Confirmation email sent
          </h2>
          <p className="text-sm text-arena-text-dim">
            We sent a confirmation link to <span className="text-arena-text">{email}</span>.
            Once confirmed, sign in to enter the floor.
          </p>
        </div>
        <Link to="/signin" className="mt-6 inline-block text-sm font-medium text-arena-gold hover:underline">
          Back to sign in
        </Link>
      </AuthLayout>
    )
  }

  return (
    <AuthLayout
      eyebrow="Join the floor"
      title="Five games. One wallet."
      description="Create an account to host or join stake-based matches, paid out instantly via M-Pesa."
    >
      <h2 className="mb-1 font-display text-2xl font-semibold text-arena-text">
        Create an account
      </h2>
      <p className="mb-6 text-sm text-arena-text-dim">
        Already playing?{' '}
        <Link to="/signin" className="font-medium text-arena-gold hover:underline">
          Sign in
        </Link>
      </p>

      <form onSubmit={handleSubmit} className="flex flex-col gap-4">
        <div className="grid grid-cols-2 gap-3">
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="fullName">Full name</Label>
            <Input
              id="fullName"
              placeholder="Jane Wanjiru"
              value={fullName}
              onChange={(e) => setFullName(e.target.value)}
              required
            />
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="username">Username</Label>
            <Input
              id="username"
              placeholder="jwanjiru"
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              required
            />
          </div>
        </div>

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
          <Label htmlFor="phone">M-Pesa phone number</Label>
          <Input
            id="phone"
            type="tel"
            inputMode="numeric"
            placeholder="07XX XXX XXX"
            value={phone}
            onChange={(e) => setPhone(e.target.value)}
            required
          />
        </div>

        <div className="flex flex-col gap-1.5">
          <Label htmlFor="password">Password</Label>
          <Input
            id="password"
            type="password"
            autoComplete="new-password"
            placeholder="At least 8 characters"
            minLength={8}
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
          {isSubmitting ? <Loader2 className="size-4 animate-spin" /> : <UserPlus className="size-4" />}
          Create account
        </Button>

        <p className="text-center text-xs text-arena-text-dim">
          By signing up you agree this platform involves real-money stakes.
          You must be 18+ to participate.
        </p>
      </form>
    </AuthLayout>
  )
}
