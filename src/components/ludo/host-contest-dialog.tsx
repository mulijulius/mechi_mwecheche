/**
 * src/components/ludo/host-contest-dialog.tsx
 *
 * Dialog for hosting a new Ludo contest: pick theme, player count (2-4),
 * and stake (or free trial). Mirrors
 * src/components/checkers/host-contest-dialog.tsx — the main difference is
 * a player-count selector (2/3/4) replacing checkers' rule-variant selector
 * (English/Russian), since Ludo seats vary but has one ruleset.
 */

import * as React from 'react'
import { useNavigate } from '@tanstack/react-router'
import { Users, Zap, Wallet as WalletIcon } from 'lucide-react'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '#/components/ui/dialog'
import { Button } from '#/components/ui/button'
import { Input } from '#/components/ui/input'
import { Label } from '#/components/ui/label'
import { RadioGroup, RadioGroupItem } from '#/components/ui/radio-group'
import { useLudo, type HostOptions } from '#/lib/ludo-context'
import { useAuth } from '#/lib/auth-context'
import { formatKes } from '#/utils/format'

const THEMES: { id: HostOptions['theme']; label: string; swatch: string }[] = [
  { id: 'classic', label: 'Classic',  swatch: 'linear-gradient(135deg,#E53935,#43A047,#FBC02D,#1E88E5)' },
  { id: 'royal',   label: 'Royal',    swatch: 'linear-gradient(135deg,#E53977,#3FB68B,#F2C14E,#7C4DFF)' },
  { id: 'sunset',  label: 'Sunset',   swatch: 'linear-gradient(135deg,#D7263D,#4F9D69,#FFB400,#2A6F97)' },
  { id: 'ocean',   label: 'Ocean',    swatch: 'linear-gradient(135deg,#EF5350,#26A69A,#FFD54F,#29B6F6)' },
]

const PLAYER_COUNTS: { value: 2 | 3 | 4; label: string }[] = [
  { value: 2, label: '2 Players' },
  { value: 3, label: '3 Players' },
  { value: 4, label: '4 Players' },
]

const STAKE_PRESETS_CENTS = [0, 5000, 10000, 25000, 50000] // 0 = free trial, then KES 50/100/250/500

interface HostContestDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
}

export function HostContestDialog({ open, onOpenChange }: HostContestDialogProps) {
  const navigate = useNavigate()
  const { hostContest, hostError, trialRemaining } = useLudo()
  const { wallet } = useAuth()

  const [theme, setTheme] = React.useState<HostOptions['theme']>('classic')
  const [maxPlayers, setMaxPlayers] = React.useState<2 | 3 | 4>(4)
  const [stakeCents, setStakeCents] = React.useState<number>(0)
  const [customStake, setCustomStake] = React.useState('')
  const [isHosting, setIsHosting] = React.useState(false)

  const effectiveStake = customStake ? Math.round(parseFloat(customStake) * 100) || 0 : stakeCents
  const isFreeTrial = effectiveStake === 0
  const canAfford = wallet ? (wallet.balance_cents - wallet.locked_cents) >= effectiveStake : false
  const canHost = isFreeTrial ? trialRemaining > 0 : canAfford

  async function handleHost() {
    setIsHosting(true)
    const contestId = await hostContest({
      theme,
      maxPlayers,
      entry_fee_cents: effectiveStake,
    })
    setIsHosting(false)

    if (contestId) {
      onOpenChange(false)
      navigate({ to: '/dashboard/ludo/$contestId', params: { contestId } })
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md border-arena-border bg-arena-surface text-arena-text">
        <DialogHeader>
          <DialogTitle className="font-display text-arena-text">Host a Ludo Table</DialogTitle>
        </DialogHeader>

        <div className="space-y-5">
          {/* Theme picker */}
          <div>
            <Label className="text-xs uppercase tracking-wide text-arena-text-dim">Board Theme</Label>
            <div className="mt-2 grid grid-cols-4 gap-2">
              {THEMES.map((t) => (
                <button
                  key={t.id}
                  type="button"
                  onClick={() => setTheme(t.id)}
                  className={`flex flex-col items-center gap-1.5 rounded-lg border p-2 text-[11px] transition-colors ${
                    theme === t.id
                      ? 'border-arena-gold bg-arena-gold/10 text-arena-gold'
                      : 'border-arena-border text-arena-text-dim hover:border-arena-text-dim'
                  }`}
                >
                  <span
                    className="size-6 rounded-full border border-white/20"
                    style={{ background: t.swatch }}
                  />
                  {t.label}
                </button>
              ))}
            </div>
          </div>

          {/* Player count */}
          <div>
            <Label className="text-xs uppercase tracking-wide text-arena-text-dim">Table Size</Label>
            <div className="mt-2 grid grid-cols-3 gap-2">
              {PLAYER_COUNTS.map((pc) => (
                <button
                  key={pc.value}
                  type="button"
                  onClick={() => setMaxPlayers(pc.value)}
                  className={`flex items-center justify-center gap-1.5 rounded-lg border p-2 text-xs font-medium transition-colors ${
                    maxPlayers === pc.value
                      ? 'border-arena-gold bg-arena-gold/10 text-arena-gold'
                      : 'border-arena-border text-arena-text-dim hover:border-arena-text-dim'
                  }`}
                >
                  <Users className="size-3.5" />
                  {pc.label}
                </button>
              ))}
            </div>
          </div>

          {/* Stake */}
          <div>
            <Label className="text-xs uppercase tracking-wide text-arena-text-dim">Stake</Label>
            <RadioGroup
              value={customStake ? 'custom' : String(stakeCents)}
              onValueChange={(v) => {
                if (v === 'custom') return
                setCustomStake('')
                setStakeCents(Number(v))
              }}
              className="mt-2 grid grid-cols-3 gap-2"
            >
              {STAKE_PRESETS_CENTS.map((cents) => (
                <label
                  key={cents}
                  className={`flex cursor-pointer items-center justify-center gap-1.5 rounded-lg border p-2 text-xs font-medium transition-colors ${
                    !customStake && stakeCents === cents
                      ? 'border-arena-gold bg-arena-gold/10 text-arena-gold'
                      : 'border-arena-border text-arena-text-dim hover:border-arena-text-dim'
                  }`}
                >
                  <RadioGroupItem value={String(cents)} className="hidden" />
                  {cents === 0 ? (
                    <span className="flex items-center gap-1"><Zap className="size-3" /> Free</span>
                  ) : (
                    formatKes(cents)
                  )}
                </label>
              ))}
              <label
                className={`col-span-2 flex cursor-pointer items-center gap-1.5 rounded-lg border p-2 text-xs font-medium transition-colors ${
                  customStake ? 'border-arena-gold bg-arena-gold/10 text-arena-gold' : 'border-arena-border text-arena-text-dim'
                }`}
              >
                <RadioGroupItem value="custom" className="hidden" />
                Custom (KES)
                <Input
                  type="number"
                  min={0}
                  step="1"
                  placeholder="0"
                  value={customStake}
                  onChange={(e) => setCustomStake(e.target.value)}
                  className="h-6 w-20 border-none bg-transparent p-0 text-xs focus-visible:ring-0"
                />
              </label>
            </RadioGroup>
          </div>

          {isFreeTrial ? (
            <p className="flex items-center gap-1.5 text-xs text-arena-emerald">
              <Zap className="size-3.5" />
              {trialRemaining} free trial{trialRemaining === 1 ? '' : 's'} remaining today
            </p>
          ) : (
            <p className="flex items-center gap-1.5 text-xs text-arena-text-dim">
              <WalletIcon className="size-3.5" />
              Wallet balance: {wallet ? formatKes(wallet.balance_cents - wallet.locked_cents) : '—'}
            </p>
          )}

          {hostError && <p className="text-xs text-arena-red">{hostError}</p>}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button onClick={handleHost} disabled={!canHost || isHosting}>
            {isHosting ? 'Creating table…' : 'Host Table'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
