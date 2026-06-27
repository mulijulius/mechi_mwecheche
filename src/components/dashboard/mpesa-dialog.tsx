import * as React from 'react'
import { Loader2, Smartphone } from 'lucide-react'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '#/components/ui/dialog'
import { Button } from '#/components/ui/button'
import { Input } from '#/components/ui/input'
import { Label } from '#/components/ui/label'

type Mode = 'deposit' | 'withdraw'

interface MpesaDialogProps {
  mode: Mode
  open: boolean
  onOpenChange: (open: boolean) => void
}

export function MpesaDialog({ mode, open, onOpenChange }: MpesaDialogProps) {
  const [phone, setPhone] = React.useState('')
  const [amount, setAmount] = React.useState('')
  const [isSubmitting, setIsSubmitting] = React.useState(false)

  const isDeposit = mode === 'deposit'

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setIsSubmitting(true)
    // NOTE: This is a UI stub. A real STK Push (deposit) or B2C payout
    // (withdrawal) must be triggered from a trusted backend that holds the
    // Daraja consumer key/secret — never from the browser. Wire this up to
    // a Supabase Edge Function once the payments service exists.
    await new Promise((resolve) => setTimeout(resolve, 900))
    setIsSubmitting(false)
    onOpenChange(false)
    setPhone('')
    setAmount('')
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>
            {isDeposit ? 'Deposit via M-Pesa' : 'Withdraw to M-Pesa'}
          </DialogTitle>
          <DialogDescription>
            {isDeposit
              ? "You'll receive an STK push prompt on your phone to complete this deposit."
              : 'Funds are sent to your M-Pesa number. Withdrawals are usually instant.'}
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="flex flex-col gap-4">
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="mpesa-phone">M-Pesa phone number</Label>
            <div className="relative">
              <Smartphone className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-arena-text-dim" />
              <Input
                id="mpesa-phone"
                type="tel"
                inputMode="numeric"
                placeholder="07XX XXX XXX"
                className="pl-9"
                value={phone}
                onChange={(e) => setPhone(e.target.value)}
                required
              />
            </div>
          </div>

          <div className="flex flex-col gap-1.5">
            <Label htmlFor="mpesa-amount">Amount (KES)</Label>
            <Input
              id="mpesa-amount"
              type="number"
              min={10}
              step={1}
              placeholder="500"
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
              required
            />
          </div>

          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
            <Button type="submit" variant={isDeposit ? 'emerald' : 'default'} disabled={isSubmitting}>
              {isSubmitting && <Loader2 className="size-4 animate-spin" />}
              {isDeposit ? 'Send STK push' : 'Request withdrawal'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
