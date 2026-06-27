import * as React from 'react'
import { Link, createFileRoute } from '@tanstack/react-router'
import { CheckCircle2, Loader2, ShieldQuestion } from 'lucide-react'
import { AuthLayout } from '#/components/layout/auth-layout'
import { Button } from '#/components/ui/button'
import { Input } from '#/components/ui/input'
import { Label } from '#/components/ui/label'
import { supabase } from '#/utils/supabase'

export const Route = createFileRoute('/forgot-password')({
  component: ForgotPasswordPage,
})

type Step = 'email' | 'question' | 'sent'

function ForgotPasswordPage() {
  const [step, setStep] = React.useState<Step>('email')
  const [email, setEmail] = React.useState('')
  const [question, setQuestion] = React.useState<string | null>(null)
  const [answer, setAnswer] = React.useState('')
  const [isSubmitting, setIsSubmitting] = React.useState(false)
  const [error, setError] = React.useState<string | null>(null)

  async function handleEmailSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError(null)
    setIsSubmitting(true)

    const { data, error: rpcError } = await supabase.rpc('get_security_question', {
      p_email: email,
    })

    setIsSubmitting(false)

    // Deliberately vague error: we don't reveal whether the email exists,
    // only whether a security question is available to continue recovery.
    if (rpcError || !data) {
      setError(
        "We couldn't find a security question for that email. Check the address or contact support.",
      )
      return
    }

    setQuestion(data)
    setStep('question')
  }

  async function handleAnswerSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError(null)
    setIsSubmitting(true)

    const { data: isCorrect, error: verifyError } = await supabase.rpc(
      'verify_security_answer',
      { p_email: email, p_answer: answer },
    )

    if (verifyError || !isCorrect) {
      setIsSubmitting(false)
      setError('That answer is incorrect. Please try again.')
      return
    }

    // Answer verified. We still rely on Supabase's official email-based
    // reset to actually change the password — there is no secure way to
    // set a new password directly from the browser without either an
    // active session or a verified reset token from Supabase. This keeps
    // the security question as a genuine gate while letting Supabase
    // handle the cryptographically-signed reset link itself.
    const { error: resetError } = await supabase.auth.resetPasswordForEmail(email, {
      redirectTo: `${window.location.origin}/reset-password`,
    })

    setIsSubmitting(false)

    if (resetError) {
      setError(resetError.message)
      return
    }

    setStep('sent')
  }

  return (
    <AuthLayout
      eyebrow="Account recovery"
      title="Forgot your password?"
      description="Answer your security question to confirm it's you, then we'll send a reset link."
    >
      {step === 'email' && (
        <>
          <h2 className="mb-1 font-display text-2xl font-semibold text-arena-text">
            Reset your password
          </h2>
          <p className="mb-6 text-sm text-arena-text-dim">
            Enter the email on your account to get started.
          </p>

          <form onSubmit={handleEmailSubmit} className="flex flex-col gap-4">
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

            {error && (
              <p className="rounded-md border border-arena-red/30 bg-arena-red/10 px-3 py-2 text-sm text-arena-red">
                {error}
              </p>
            )}

            <Button type="submit" size="lg" className="w-full" disabled={isSubmitting}>
              {isSubmitting && <Loader2 className="size-4 animate-spin" />}
              Continue
            </Button>
          </form>
        </>
      )}

      {step === 'question' && question && (
        <>
          <div className="mb-4 flex items-center gap-2 text-arena-gold">
            <ShieldQuestion className="size-5" />
            <h2 className="font-display text-2xl font-semibold text-arena-text">
              Answer your security question
            </h2>
          </div>
          <p className="mb-6 rounded-md border border-arena-border bg-arena-surface-2 px-3 py-2 text-sm text-arena-text">
            {question}
          </p>

          <form onSubmit={handleAnswerSubmit} className="flex flex-col gap-4">
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="answer">Your answer</Label>
              <Input
                id="answer"
                placeholder="Answer"
                value={answer}
                onChange={(e) => setAnswer(e.target.value)}
                required
                autoFocus
              />
            </div>

            {error && (
              <p className="rounded-md border border-arena-red/30 bg-arena-red/10 px-3 py-2 text-sm text-arena-red">
                {error}
              </p>
            )}

            <Button type="submit" size="lg" className="w-full" disabled={isSubmitting}>
              {isSubmitting && <Loader2 className="size-4 animate-spin" />}
              Verify & send reset link
            </Button>
          </form>
        </>
      )}

      {step === 'sent' && (
        <>
          <div className="mb-4 flex items-center gap-2 text-arena-emerald">
            <CheckCircle2 className="size-5" />
            <h2 className="font-display text-2xl font-semibold text-arena-text">
              Check your inbox
            </h2>
          </div>
          <div className="rounded-lg border border-arena-emerald/30 bg-arena-emerald/10 p-5">
            <p className="text-sm text-arena-text-dim">
              We verified your answer and sent a password reset link to{' '}
              <span className="text-arena-text">{email}</span>. Follow the
              link to set a new password.
            </p>
          </div>
        </>
      )}

      <Link
        to="/signin"
        className="mt-6 inline-block text-sm font-medium text-arena-gold hover:underline"
      >
        Back to sign in
      </Link>
    </AuthLayout>
  )
}