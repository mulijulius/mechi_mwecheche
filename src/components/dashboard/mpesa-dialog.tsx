import * as React from 'react'
import { CheckCircle2, Loader2, Smartphone, XCircle } from 'lucide-react'
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
import { supabase } from '#/utils/supabase'

type Mode = 'deposit' | 'withdraw'
type Stage = 'form' | 'awaiting-pin' | 'success' | 'failed' | 'error'

interface MpesaDialogProps {
  mode: Mode
  open: boolean
  onOpenChange: (open: boolean) => void
}

// STK push prompts on the customer's phone expire after ~60-90s on M-Pesa's
// side. If we haven't heard back from paynexus-webhook by then, stop waiting
// and tell the player rather than spinning forever.
const AWAIT_TIMEOUT_MS = 90_000

export function MpesaDialog({ mode, open, onOpenChange }: MpesaDialogProps) {
  const [phone, setPhone] = React.useState('')
  const [amount, setAmount] = React.useState('')
  const [stage, setStage] = React.useState<Stage>('form')
  const [errorMessage, setErrorMessage] = React.useState('')
  const [paymentRowId, setPaymentRowId] = React.useState<string | null>(null)

  const isDeposit = mode === 'deposit'

  // Once paynexus-deposit hands back a paynexus_payments row id, watch that
  // row via Realtime and react the instant paynexus-webhook resolves it —
  // no polling. See migration 0011 for why the row needs to be in the
  // supabase_realtime publication with REPLICA IDENTITY FULL for payload.new
  // to reliably contain `status`.
  React.useEffect(() => {
    if (!paymentRowId) return

    const timeout = setTimeout(() => {
      setStage((current) => (current === 'awaiting-pin' ? 'failed' : current))
      setErrorMessage(
        'No confirmation received in time. Check your M-Pesa messages — if you were charged, contact support with your phone number.',
      )
    }, AWAIT_TIMEOUT_MS)

    const channel = supabase
      .channel(`paynexus-payment-${paymentRowId}`)
      .on(
        'postgres_changes',
        {
          event: 'UPDATE',
          schema: 'public',
          table: 'paynexus_payments',
          filter: `id=eq.${paymentRowId}`,
        },
        (payload) => {
          const newStatus = (payload.new as { status?: string }).status
          if (newStatus === 'completed') {
            clearTimeout(timeout)
            setStage('success')
          } else if (newStatus === 'failed') {
            clearTimeout(timeout)
            setStage('failed')
            setErrorMessage('The payment was not completed. You may have cancelled the M-Pesa prompt.')
          }
        },
      )
      .subscribe()

    return () => {
      clearTimeout(timeout)
      supabase.removeChannel(channel)
    }
  }, [paymentRowId])

  function reset() {
    setStage('form')
    setErrorMessage('')
    setPhone('')
    setAmount('')
    setPaymentRowId(null)
  }

  function close() {
    onOpenChange(false)
    // Let the dialog's close animation finish before wiping the form.
    setTimeout(reset, 200)
  }

  async function handleDepositSubmit(e: React.FormEvent) {
    e.preventDefault()
    setStage('awaiting-pin')
    setErrorMessage('')

    const { data, error } = await supabase.functions.invoke('paynexus-deposit', {
      body: { amount: Number(amount), phone },
    })

    if (error || !data?.success) {
      setStage('error')
      setErrorMessage(data?.message ?? error?.message ?? 'Something went wrong. Please try again.')
      return
    }

    setPaymentRowId(data.data.paymentRowId as string)
  }

  function handleWithdrawSubmit(e: React.FormEvent) {
    e.preventDefault()
    // PayNexus (paynexus.co.ke) only exposes payment COLLECTION endpoints
    // (STK Push initiate + status) — there is no disbursement/B2C endpoint
    // to send money out to a player's phone. Rather than fake a success like
    // the old stub did, tell the player plainly so no one thinks a payout is
    // coming. Swap this for a real call once a payout path exists.
    setStage('failed')
    setErrorMessage('Withdrawals are not yet available. Please contact support to cash out your balance.')
  }

  return (
    <Dialog open={open} onOpenChange={(next) => (next ? onOpenChange(next) : close())}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>
            {isDeposit ? 'Deposit via M-Pesa' : 'Withdraw to M-Pesa'}
          </DialogTitle>
          {stage === 'form' && (
            <DialogDescription>
              {isDeposit
                ? "You'll receive an STK push prompt on your phone to complete this deposit."
                : 'Funds are sent to your M-Pesa number. Withdrawals are usually instant.'}
            </DialogDescription>
          )}
        </DialogHeader>

        {stage === 'form' && (
          <form onSubmit={isDeposit ? handleDepositSubmit : handleWithdrawSubmit} className="flex flex-col gap-4">
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
              <Button type="button" variant="outline" onClick={close}>
                Cancel
              </Button>
              <Button type="submit" variant={isDeposit ? 'emerald' : 'default'}>
                {isDeposit ? 'Send STK push' : 'Request withdrawal'}
              </Button>
            </DialogFooter>
          </form>
        )}

        {stage === 'awaiting-pin' && (
          <div className="flex flex-col items-center gap-3 py-8 text-center">
            <Loader2 className="size-8 animate-spin text-arena-gold" />
            <p className="font-medium text-arena-text">Check your phone</p>
            <p className="text-sm text-arena-text-dim">
              Enter your M-Pesa PIN on the prompt sent to {phone} to complete this deposit.
            </p>
          </div>
        )}

        {stage === 'success' && (
          <div className="flex flex-col items-center gap-3 py-8 text-center">
            <CheckCircle2 className="size-8 text-arena-emerald" />
            <p className="font-medium text-arena-text">Deposit successful</p>
            <p className="text-sm text-arena-text-dim">Your wallet balance has been updated.</p>
            <Button className="mt-2" onClick={close}>
              Done
            </Button>
          </div>
        )}

        {(stage === 'failed' || stage === 'error') && (
          <div className="flex flex-col items-center gap-3 py-8 text-center">
            <XCircle className="size-8 text-arena-red" />
            <p className="font-medium text-arena-text">
              {isDeposit ? 'Deposit not completed' : 'Withdrawal unavailable'}
            </p>
            <p className="rounded-md border border-arena-red/30 bg-arena-red/10 px-3 py-2 text-sm text-arena-red">
              {errorMessage}
            </p>
            <div className="mt-2 flex gap-2">
              <Button variant="outline" onClick={close}>
                Close
              </Button>
              {isDeposit && (
                <Button variant="emerald" onClick={reset}>
                  Try again
                </Button>
              )}
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  )
}
