import * as React from 'react'
import { Link, createFileRoute, useNavigate } from '@tanstack/react-router'
import { CheckCircle2, KeyRound, Loader2 } from 'lucide-react'
import { AuthLayout } from '#/components/layout/auth-layout'
import { Button } from '#/components/ui/button'
import { Input } from '#/components/ui/input'
import { Label } from '#/components/ui/label'
import { supabase } from '#/utils/supabase'

export const Route = createFileRoute('/reset-password')({
  component: ResetPasswordPage,
})

function ResetPasswordPage() {
  const navigate = useNavigate()
  const [password, setPassword] = React.useState('')
  const [confirmPassword, setConfirmPassword] = React.useState('')
  const [isSubmitting, setIsSubmitting] = React.useState(false)
  const [error, setError] = React.useState<string | null>(null)
  const [success, setSuccess] = React.useState(false)

  // Supabase places the user in a recovery session automatically when they
  // arrive here via the link from resetPasswordForEmail(). No extra code
  // is needed to "activate" that session — supabase-js handles the URL
  // fragment/token exchange on load.

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError(null)

    if (password !== confirmPassword) {
      setError('Passwords do not match.')
      return
    }
    if (password.length < 8) {
      setError('Password must be at least 8 characters.')
      return
    }

    setIsSubmitting(true)
    const { error: updateError } = await supabase.auth.updateUser({ password })
    setIsSubmitting(false)

    if (updateError) {
      setError(updateError.message)
      return
    }

    setSuccess(true)
    setTimeout(() => navigate({ to: '/signin' }), 2000)
  }

  if (success) {
    return (
      <AuthLayout
        eyebrow="All set"
        title="Password updated."
        description="You can now sign in with your new password."
      >
        <div className="flex items-center gap-2 rounded-lg border border-arena-emerald/30 bg-arena-emerald/10 p-5 text-arena-emerald">
          <CheckCircle2 className="size-5 shrink-0" />
          <p className="text-sm">
            Redirecting you to sign in…
          </p>
        </div>
      </AuthLayout>
    )
  }

  return (
    <AuthLayout
      eyebrow="Account recovery"
      title="Set a new password."
      description="Choose a new password to finish recovering your account."
    >
      <div className="mb-4 flex items-center gap-2 text-arena-gold">
        <KeyRound className="size-5" />
        <h2 className="font-display text-2xl font-semibold text-arena-text">
          New password
        </h2>
      </div>

      <form onSubmit={handleSubmit} className="flex flex-col gap-4">
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="password">New password</Label>
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

        <div className="flex flex-col gap-1.5">
          <Label htmlFor="confirmPassword">Confirm new password</Label>
          <Input
            id="confirmPassword"
            type="password"
            autoComplete="new-password"
            placeholder="Repeat password"
            minLength={8}
            value={confirmPassword}
            onChange={(e) => setConfirmPassword(e.target.value)}
            required
          />
        </div>

        {error && (
          <p className="rounded-md border border-arena-red/30 bg-arena-red/10 px-3 py-2 text-sm text-arena-red">
            {error}
          </p>
        )}

        <Button type="submit" size="lg" className="w-full" disabled={isSubmitting}>
          {isSubmitting && <Loader2 className="size-4 animate-spin" />}
          Update password
        </Button>
      </form>

      <Link
        to="/signin"
        className="mt-6 inline-block text-sm font-medium text-arena-gold hover:underline"
      >
        Back to sign in
      </Link>
    </AuthLayout>
  )
}