/**
 * src/components/checkers/host-contest-dialog.tsx
 *
 * Modal for creating a new Checkers contest. Lets the host pick:
 *   - Variant (English / Russian)
 *   - Board Theme
 *   - Entry fee (Free Trial or custom KES amount)
 *
 * Calls useCheckers().hostContest() and navigates to the game room on success.
 */

import * as React from 'react'
import { useNavigate } from '@tanstack/react-router'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '#/components/ui/dialog'
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
import { Badge } from '#/components/ui/badge'
import { useCheckers } from '#/lib/checkers-context'
import { useAuth } from '#/lib/auth-context'
import { formatKes } from '#/utils/format'
import type { CheckersVariant, CheckersTheme } from '#/types/database.types'

const THEME_LABELS: Record<CheckersTheme, string> = {
  classic:  'Classic Wood',
  green:    'Tournament Green',
  midnight: 'Midnight Blue',
  red:      'Championship Red',
  ivory:    'Ivory & Ebony',
}

const VARIANT_DESC: Record<CheckersVariant, string> = {
  english: 'Forward-only movement, kings step once. Capture is mandatory.',
  russian: 'Flying kings, capture in all directions. Kings continue after promotion.',
}

interface Props {
  open: boolean
  onOpenChange: (open: boolean) => void
}

export function HostContestDialog({ open, onOpenChange }: Props) {
  const navigate = useNavigate()
  const { wallet } = useAuth()
  const { hostContest, hostError, trialRemaining } = useCheckers()

  const [variant, setVariant] = React.useState<CheckersVariant>('english')
  const [theme, setTheme] = React.useState<CheckersTheme>('classic')
  const [feeMode, setFeeMode] = React.useState<'free' | 'paid'>('free')
  const [feeKes, setFeeKes] = React.useState('')
  const [isLoading, setIsLoading] = React.useState(false)
  const [localError, setLocalError] = React.useState<string | null>(null)

  const trialsLeft = trialRemaining[variant]
  const availableBalanceKes = wallet ? (wallet.balance_cents - wallet.locked_cents) / 100 : 0

  function handleFeeKesChange(val: string) {
    // Allow only digits and one dot
    if (/^\d*\.?\d{0,2}$/.test(val)) setFeeKes(val)
  }

  async function handleSubmit() {
    setLocalError(null)
    const entry_fee_cents = feeMode === 'free' ? 0 : Math.round(parseFloat(feeKes || '0') * 100)

    if (feeMode === 'paid') {
      if (!feeKes || entry_fee_cents <= 0) {
        setLocalError('Enter a valid entry fee amount.')
        return
      }
      if (entry_fee_cents > wallet!.balance_cents - wallet!.locked_cents) {
        setLocalError('Entry fee exceeds your available balance.')
        return
      }
    }

    setIsLoading(true)
    const contestId = await hostContest({ variant, theme, entry_fee_cents })
    setIsLoading(false)

    if (contestId) {
      onOpenChange(false)
      navigate({ to: '/dashboard/checkers/$contestId', params: { contestId } })
    }
  }

  const error = localError ?? hostError

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md border-arena-border bg-arena-surface text-arena-text">
        <DialogHeader>
          <DialogTitle className="font-display text-lg text-arena-text">
            Host a Checkers Match
          </DialogTitle>
        </DialogHeader>

        <div className="mt-4 space-y-5">
          {/* Variant */}
          <div className="space-y-1.5">
            <Label className="text-xs uppercase tracking-wider text-arena-text-dim">
              Rule Variant
            </Label>
            <Select value={variant} onValueChange={(v) => setVariant(v as CheckersVariant)}>
              <SelectTrigger className="border-arena-border bg-arena-surface-2 text-arena-text">
                <SelectValue />
              </SelectTrigger>
              <SelectContent className="border-arena-border bg-arena-surface-2">
                <SelectItem value="english">English Draughts</SelectItem>
                <SelectItem value="russian">Russian Checkers</SelectItem>
              </SelectContent>
            </Select>
            <p className="text-[11px] text-arena-text-dim">{VARIANT_DESC[variant]}</p>
          </div>

          {/* Theme */}
          <div className="space-y-1.5">
            <Label className="text-xs uppercase tracking-wider text-arena-text-dim">
              Board Theme
            </Label>
            <Select value={theme} onValueChange={(v) => setTheme(v as CheckersTheme)}>
              <SelectTrigger className="border-arena-border bg-arena-surface-2 text-arena-text">
                <SelectValue />
              </SelectTrigger>
              <SelectContent className="border-arena-border bg-arena-surface-2">
                {(Object.keys(THEME_LABELS) as CheckersTheme[]).map((t) => (
                  <SelectItem key={t} value={t}>{THEME_LABELS[t]}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {/* Entry fee */}
          <div className="space-y-2">
            <Label className="text-xs uppercase tracking-wider text-arena-text-dim">
              Entry Fee
            </Label>
            <div className="flex gap-2">
              <button
                type="button"
                onClick={() => setFeeMode('free')}
                className={[
                  'flex-1 rounded-md border py-2 text-sm font-medium transition-colors',
                  feeMode === 'free'
                    ? 'border-arena-emerald bg-[color-mix(in_srgb,var(--color-arena-emerald)_12%,transparent)] text-arena-emerald'
                    : 'border-arena-border bg-arena-surface-2 text-arena-text-dim hover:border-arena-text-dim',
                ].join(' ')}
              >
                Free Trial
                {trialsLeft < 3 && (
                  <span className="ml-1 text-[10px] opacity-70">({trialsLeft} left)</span>
                )}
              </button>
              <button
                type="button"
                onClick={() => setFeeMode('paid')}
                className={[
                  'flex-1 rounded-md border py-2 text-sm font-medium transition-colors',
                  feeMode === 'paid'
                    ? 'border-arena-gold bg-[color-mix(in_srgb,var(--color-arena-gold)_12%,transparent)] text-arena-gold'
                    : 'border-arena-border bg-arena-surface-2 text-arena-text-dim hover:border-arena-text-dim',
                ].join(' ')}
              >
                Paid Match
              </button>
            </div>

            {feeMode === 'free' && trialsLeft === 0 && (
              <p className="rounded-md border border-arena-red/30 bg-[color-mix(in_srgb,var(--color-arena-red)_8%,transparent)] px-3 py-2 text-xs text-arena-red">
                Daily free trial limit reached for {variant} checkers. Switch to a paid match or try again tomorrow.
              </p>
            )}

            {feeMode === 'paid' && (
              <div className="space-y-1">
                <div className="relative">
                  <span className="absolute left-3 top-1/2 -translate-y-1/2 text-sm text-arena-text-dim">
                    KES
                  </span>
                  <Input
                    className="border-arena-border bg-arena-surface-2 pl-12 text-arena-text"
                    placeholder="0.00"
                    value={feeKes}
                    onChange={(e) => handleFeeKesChange(e.target.value)}
                  />
                </div>
                <p className="text-[11px] text-arena-text-dim">
                  Available: {formatKes(availableBalanceKes * 100)}
                </p>
              </div>
            )}
          </div>

          {/* Summary */}
          {feeMode === 'paid' && feeKes && parseFloat(feeKes) > 0 && (
            <div className="rounded-md border border-arena-border bg-arena-surface-2 px-4 py-3 text-sm">
              <div className="flex justify-between text-arena-text-dim">
                <span>Your stake</span>
                <span className="font-mono text-arena-gold">{formatKes(parseFloat(feeKes) * 100)}</span>
              </div>
              <div className="mt-1 flex justify-between text-arena-text-dim">
                <span>Winner takes</span>
                <span className="font-mono text-arena-emerald">{formatKes(parseFloat(feeKes) * 200)}</span>
              </div>
            </div>
          )}

          {error && (
            <p className="rounded-md border border-arena-red/30 bg-[color-mix(in_srgb,var(--color-arena-red)_8%,transparent)] px-3 py-2 text-xs text-arena-red">
              {error}
            </p>
          )}

          <Button
            className="w-full"
            onClick={handleSubmit}
            disabled={isLoading || (feeMode === 'free' && trialsLeft === 0)}
          >
            {isLoading ? 'Creating…' : 'Create Contest'}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  )
}
