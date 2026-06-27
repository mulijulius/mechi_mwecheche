import { ArrowDownToLine, ArrowUpFromLine, Wallet } from 'lucide-react'
import { Button } from '#/components/ui/button'
import { formatKes } from '#/utils/format'

interface WalletHudProps {
  balanceCents: number
  lockedCents: number
  onDeposit: () => void
  onWithdraw: () => void
}

export function WalletHud({
  balanceCents,
  lockedCents,
  onDeposit,
  onWithdraw,
}: WalletHudProps) {
  return (
    <div className="flex items-center gap-3 rounded-lg border border-arena-border bg-arena-surface-2 px-4 py-2">
      <Wallet className="size-4 text-arena-gold" />
      <div className="leading-tight">
        <p className="text-[10px] uppercase tracking-wider text-arena-text-dim">
          Balance
        </p>
        <p className="font-mono text-sm font-semibold text-arena-text tabular">
          {formatKes(balanceCents)}
        </p>
      </div>
      {lockedCents > 0 && (
        <div className="hidden leading-tight sm:block">
          <p className="text-[10px] uppercase tracking-wider text-arena-text-dim">
            Locked
          </p>
          <p className="font-mono text-sm font-semibold text-arena-text-dim tabular">
            {formatKes(lockedCents)}
          </p>
        </div>
      )}
      <div className="ml-2 flex items-center gap-1.5 border-l border-arena-border pl-3">
        <Button size="icon" variant="ghost" onClick={onDeposit} title="Deposit via M-Pesa">
          <ArrowDownToLine className="size-4 text-arena-emerald" />
        </Button>
        <Button size="icon" variant="ghost" onClick={onWithdraw} title="Withdraw to M-Pesa">
          <ArrowUpFromLine className="size-4 text-arena-gold" />
        </Button>
      </div>
    </div>
  )
}
