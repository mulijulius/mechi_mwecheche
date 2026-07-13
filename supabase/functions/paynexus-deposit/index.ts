// Initiates an M-Pesa STK Push deposit via PayNexus (https://paynexus.co.ke).
//
// Auth: caller must be a signed-in player. The frontend calls this with
//   supabase.functions.invoke('paynexus-deposit', { body: { amount, phone } })
// which attaches the player's Supabase Auth JWT automatically — no PayNexus
// key ever reaches the browser.
//
// Flow:
//   1. Validate the amount + phone the player entered.
//   2. Ask PayNexus to send an STK Push (POST /api/mpesa/payment/initiate),
//      authenticated with the secret key (server-side only).
//   3. On success, atomically write a 'pending' transactions row +
//      paynexus_payments row (via the paynexus_create_pending_deposit RPC)
//      and return its id so the client can watch for completion.
//
// IMPORTANT: the wallet balance is only ever credited by paynexus-webhook,
// once PayNexus confirms the customer actually entered their M-Pesa PIN —
// never from this function. This function only ever creates 'pending' rows.

import { withSupabase } from 'npm:@supabase/server@^1'

const PAYNEXUS_BASE_URL = 'https://paynexus.co.ke'
const MIN_AMOUNT_KES = 10

interface DepositRequest {
  amount?: number // whole KES, matches the existing dialog's <Input type="number">
  phone?: string // any common Kenyan format, e.g. 0712345678 or 254712345678
}

// Matches PayNexus's actual documented response shape
// (https://paynexus.co.ke/docs/stk-push) — note there is no payment_id or
// merchant_request_id field. An earlier version of this function assumed
// fields that don't exist in PayNexus's real API, which — combined with the
// wrong endpoint path below — was why deposits were failing.
interface PayNexusInitiateResponse {
  success: boolean
  message?: string
  data?: {
    reference: string
    checkout_request_id: string
    amount: number
    phone: string
    status: string
  }
}

// Normalizes common Kenyan phone formats to PayNexus's expected 2547XXXXXXXX
// / 2541XXXXXXXX shape. Returns null if it doesn't look like a valid
// Safaricom-style Kenyan mobile number.
function normalizePhone(raw: string): string | null {
  const digits = raw.replace(/\D/g, '')
  let normalized: string | null = null

  if (digits.startsWith('254') && digits.length === 12) {
    normalized = digits
  } else if (digits.startsWith('0') && digits.length === 10) {
    normalized = `254${digits.slice(1)}`
  } else if (digits.length === 9) {
    normalized = `254${digits}`
  }

  if (!normalized) return null
  return /^254[17]\d{8}$/.test(normalized) ? normalized : null
}

export default {
  fetch: withSupabase({ auth: 'user' }, async (req, ctx) => {
    let body: DepositRequest
    try {
      body = await req.json()
    } catch {
      // NOTE: every error response in this function uses the default 200
      // status, not 4xx/5xx. supabase-js's functions.invoke() discards the
      // response body whenever the status is non-2xx (data becomes null and
      // you only get a generic "non-2xx status code" error) — see
      // https://github.com/supabase/functions-js/issues/45. Encoding
      // success/failure in the JSON body's `success` field is the documented
      // workaround and is what the frontend dialog relies on.
      return Response.json({ success: false, message: 'Invalid request body.' })
    }

    const userId = ctx.userClaims.sub as string

    const amount = Math.trunc(Number(body.amount))
    if (!Number.isFinite(amount) || amount < MIN_AMOUNT_KES) {
      return Response.json({ success: false, message: `Enter an amount of at least KES ${MIN_AMOUNT_KES}.` })
    }

    const phone = normalizePhone(body.phone ?? '')
    if (!phone) {
      return Response.json({ success: false, message: 'Enter a valid Kenyan M-Pesa number, e.g. 0712345678.' })
    }

    const secretKey = Deno.env.get('PAYNEXUS_SECRET_KEY')
    if (!secretKey) {
      console.error('paynexus-deposit: PAYNEXUS_SECRET_KEY is not set')
      return Response.json({ success: false, message: 'Deposits are temporarily unavailable. Please try again shortly.' })
    }

    const idempotencyKey = crypto.randomUUID()

    let payNexusRes: Response
    try {
      // PayNexus's real STK Push endpoint is /api/mpesa/payment/initiate —
      // NOT /api/payments/initiate. The old path doesn't exist on their
      // server at all, which is why every deposit attempt was failing with
      // "Could not reach the payment gateway." Their documented request
      // body only takes amount, phone, and description — account_reference
      // and idempotency_key aren't part of their API, so they're dropped.
      payNexusRes = await fetch(`${PAYNEXUS_BASE_URL}/api/mpesa/payment/initiate`, {
        method: 'POST',
        headers: {
          'X-API-Key': secretKey,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          amount,
          phone,
          description: 'SkillForge Arena wallet deposit',
        }),
      })
    } catch (err) {
      console.error('paynexus-deposit: network error calling PayNexus', err)
      return Response.json({ success: false, message: 'Could not reach the payment gateway. Please try again.' })
    }

    let payNexusJson: PayNexusInitiateResponse
    try {
      payNexusJson = await payNexusRes.json()
    } catch {
      console.error('paynexus-deposit: non-JSON response from PayNexus', payNexusRes.status)
      return Response.json({ success: false, message: 'The payment gateway returned an unexpected response.' })
    }

    if (!payNexusRes.ok || !payNexusJson.success || !payNexusJson.data) {
      console.error('paynexus-deposit: initiate rejected', payNexusRes.status, payNexusJson)
      return Response.json({
        success: false,
        message: payNexusJson.message ?? 'The STK push could not be sent. Please try again.',
      })
    }

    const { reference, checkout_request_id } = payNexusJson.data

    const { data: paymentRowId, error } = await ctx.supabaseAdmin.rpc('paynexus_create_pending_deposit', {
      p_user_id: userId,
      p_amount_cents: amount * 100,
      p_phone: phone,
      p_reference: reference,
      p_checkout_request_id: checkout_request_id,
      // PayNexus's real API doesn't return a separate merchant_request_id
      // or numeric payment_id (only checkout_request_id + reference), so
      // these are stored as null. The columns allow it — see 0011.
      p_merchant_request_id: null,
      p_payment_id_external: null,
      p_idempotency_key: idempotencyKey,
    })

    if (error) {
      // PayNexus has already sent the STK push at this point — the player's
      // phone will still ring — but we failed to record it locally. Log
      // loudly so this can be reconciled by looking the reference up in the
      // PayNexus dashboard.
      console.error('paynexus-deposit: failed to record pending deposit', error, reference)
      return Response.json({
        success: false,
        message: `Your phone should receive a payment prompt, but we had trouble saving the record. If you complete the payment, contact support with this reference: ${reference}`,
      })
    }

    return Response.json({
      success: true,
      data: { paymentRowId, reference, checkoutRequestId: checkout_request_id },
    })
  }),
}
