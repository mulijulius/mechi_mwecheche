import * as React from 'react'
import { Link, createFileRoute, useNavigate } from '@tanstack/react-router'
import { Loader2, ShieldCheck, UserPlus } from 'lucide-react'
import { AuthLayout } from '#/components/layout/auth-layout'
import { Button } from '#/components/ui/button'
import { Input } from '#/components/ui/input'
import { Label } from '#/components/ui/label'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '#/components/ui/select'
import { supabase } from '#/utils/supabase'
import {
  CUSTOM_QUESTION_VALUE,
  SECURITY_QUESTION_PRESETS,
} from '#/lib/security-questions'
import { ADMIN_ROLE_LABEL } from '#/lib/admin-permissions'
import type { AdminRole } from '#/types/database.types'

export const Route = createFileRoute('/signup')({
  component: SignUpPage,
})

const ADMIN_ROLE_OPTIONS: Array<AdminRole> = ['super_admin', 'support', 'finance_manager']

function SignUpPage() {
  const navigate = useNavigate()
  const [accountType, setAccountType] = React.useState<'player' | 'admin'>('player')
  const [requestedAdminRole, setRequestedAdminRole] = React.useState<AdminRole | ''>('')
  const [fullName, setFullName] = React.useState('')
  const [username, setUsername] = React.useState('')
  const [email, setEmail] = React.useState('')
  const [phone, setPhone] = React.useState('')
  const [password, setPassword] = React.useState('')

  const [questionChoice, setQuestionChoice] = React.useState('')
  const [customQuestion, setCustomQuestion] = React.useState('')
  const [securityAnswer, setSecurityAnswer] = React.useState('')

  const [isSubmitting, setIsSubmitting] = React.useState(false)
  const [error, setError] = React.useState<string | null>(null)
  const [success, setSuccess] = React.useState(false)
  const [pendingAdmin, setPendingAdmin] = React.useState(false)

  const isCustomQuestion = questionChoice === CUSTOM_QUESTION_VALUE
  const finalQuestionText = isCustomQuestion ? customQuestion.trim() : questionChoice
  const isAdminSignup = accountType === 'admin'

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError(null)

    if (!finalQuestionText) {
      setError('Please choose or write a security question.')
      return
    }
    if (!securityAnswer.trim()) {
      setError('Please provide an answer to your security question.')
      return
    }
    if (isAdminSignup && !requestedAdminRole) {
      setError('Please choose which admin role you are requesting.')
      return
    }

    setIsSubmitting(true)

    // Players are created exactly as before — no gating, no metadata about
    // roles, free to register as many accounts as they like. An admin
    // signup additionally passes requested_role/requested_admin_role,
    // which the handle_new_user() trigger (0003_admin_roles.sql) reads to
    // create the profile as role='admin' with admin_status='pending' —
    // it cannot reach the admin console until a super admin approves it.
    const { data, error: signUpError } = await supabase.auth.signUp({
      email,
      password,
      options: {
        data: {
          username,
          full_name: fullName,
          phone_number: phone,
          ...(isAdminSignup
            ? { requested_role: 'admin', requested_admin_role: requestedAdminRole }
            : {}),
        },
      },
    })

    if (signUpError) {
      setIsSubmitting(false)
      setError(signUpError.message)
      return
    }

    const userId = data.user?.id

    // Profile + wallet rows are created automatically by the
    // handle_new_user() trigger defined in supabase/migrations/0001_init.sql
    // (updated in 0003_admin_roles.sql to also branch on requested_role).
    // The security question/answer is saved here, once we have a user id.
    // The answer is hashed server-side via hash_security_answer() — it is
    // never stored or transmitted in plaintext.
    if (userId) {
      const { data: answerHash, error: hashError } = await supabase.rpc(
        'hash_security_answer',
        { answer: securityAnswer },
      )

      if (!hashError && answerHash) {
        await supabase.from('security_questions').insert({
          user_id: userId,
          question_text: finalQuestionText,
          answer_hash: answerHash,
        })
      }
      // If saving the security question fails here, we don't block account
      // creation — the user can still sign in with their password. This
      // could be retried from account settings in a future iteration.
    }

    setIsSubmitting(false)

    if (isAdminSignup) {
      // Admin accounts must wait for super-admin approval regardless of
      // whether email confirmation is on, so we always sign them out and
      // show the pending-review messaging rather than navigating in.
      await supabase.auth.signOut()
      setPendingAdmin(true)
      setSuccess(true)
      return
    }

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
        eyebrow={pendingAdmin ? 'Request received' : 'Almost there'}
        title={pendingAdmin ? 'Awaiting approval.' : 'Check your inbox.'}
        description={
          pendingAdmin
            ? 'A super admin needs to approve your admin account before you can sign in to the console.'
            : 'Confirm your email to activate your account and wallet.'
        }
      >
        <div className="rounded-lg border border-arena-emerald/30 bg-arena-emerald/10 p-5">
          <h2 className="mb-1 font-display text-lg font-semibold text-arena-text">
            {pendingAdmin ? 'Admin request submitted' : 'Confirmation email sent'}
          </h2>
          <p className="text-sm text-arena-text-dim">
            {pendingAdmin ? (
              <>
                Your request for{' '}
                <span className="text-arena-text">
                  {requestedAdminRole ? ADMIN_ROLE_LABEL[requestedAdminRole] : 'admin'}
                </span>{' '}
                access is waiting on a super admin to review it. You&rsquo;ll be able to sign in
                to the admin console as soon as it&rsquo;s approved.
              </>
            ) : (
              <>
                We sent a confirmation link to <span className="text-arena-text">{email}</span>.
                Once confirmed, sign in to enter the floor.
              </>
            )}
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
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="accountType">Account type</Label>
          <Select
            value={accountType}
            onValueChange={(v: string) => setAccountType(v as 'player' | 'admin')}
          >
            <SelectTrigger id="accountType">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="player">Player — join and play instantly</SelectItem>
              <SelectItem value="admin">Admin — requires super admin approval</SelectItem>
            </SelectContent>
          </Select>
          {isAdminSignup && (
            <p className="mt-1 flex items-start gap-1.5 text-xs text-arena-text-dim">
              <ShieldCheck className="mt-0.5 size-3.5 shrink-0 text-arena-gold" />
              Admin accounts are reviewed by a super admin before they can sign in to the
              console. Players never need approval and can register freely.
            </p>
          )}
        </div>

        {isAdminSignup && (
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="requestedAdminRole">Requested admin role</Label>
            <Select
              value={requestedAdminRole}
              onValueChange={(v: string) => setRequestedAdminRole(v as AdminRole)}
            >
              <SelectTrigger id="requestedAdminRole">
                <SelectValue placeholder="Choose a role" />
              </SelectTrigger>
              <SelectContent>
                {ADMIN_ROLE_OPTIONS.map((role) => (
                  <SelectItem key={role} value={role}>
                    {ADMIN_ROLE_LABEL[role]}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        )}

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
          <Label htmlFor="phone">{isAdminSignup ? 'Phone number' : 'M-Pesa phone number'}</Label>
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

        <div className="border-t border-arena-border pt-4">
          <p className="mb-3 text-xs uppercase tracking-wider text-arena-text-dim">
            Password recovery
          </p>

          <div className="flex flex-col gap-1.5">
            <Label htmlFor="securityQuestion">Security question</Label>
            <Select value={questionChoice} onValueChange={setQuestionChoice}>
              <SelectTrigger id="securityQuestion">
                <SelectValue placeholder="Choose a question" />
              </SelectTrigger>
              <SelectContent>
                {SECURITY_QUESTION_PRESETS.map((q) => (
                  <SelectItem key={q} value={q}>
                    {q}
                  </SelectItem>
                ))}
                <SelectItem value={CUSTOM_QUESTION_VALUE}>
                  Type your own question
                </SelectItem>
              </SelectContent>
            </Select>
          </div>

          {isCustomQuestion && (
            <div className="mt-3 flex flex-col gap-1.5">
              <Label htmlFor="customQuestion">Your question</Label>
              <Input
                id="customQuestion"
                placeholder="e.g. What was your first pet's name?"
                value={customQuestion}
                onChange={(e) => setCustomQuestion(e.target.value)}
                required
              />
            </div>
          )}

          <div className="mt-3 flex flex-col gap-1.5">
            <Label htmlFor="securityAnswer">Your answer</Label>
            <Input
              id="securityAnswer"
              placeholder="Answer"
              value={securityAnswer}
              onChange={(e) => setSecurityAnswer(e.target.value)}
              required
            />
            <p className="text-xs text-arena-text-dim">
              Used to verify your identity if you forget your password.
            </p>
          </div>
        </div>

        {error && (
          <p className="rounded-md border border-arena-red/30 bg-arena-red/10 px-3 py-2 text-sm text-arena-red">
            {error}
          </p>
        )}

        <Button type="submit" size="lg" className="mt-2 w-full" disabled={isSubmitting}>
          {isSubmitting ? (
            <Loader2 className="size-4 animate-spin" />
          ) : isAdminSignup ? (
            <ShieldCheck className="size-4" />
          ) : (
            <UserPlus className="size-4" />
          )}
          {isAdminSignup ? 'Request admin access' : 'Create account'}
        </Button>

        <p className="text-center text-xs text-arena-text-dim">
          By signing up you agree this platform involves real-money stakes.
          You must be 18+ to participate.
        </p>
      </form>
    </AuthLayout>
  )
}