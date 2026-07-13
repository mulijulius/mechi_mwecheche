// Receives payment status webhooks from PayNexus (https://paynexus.co.ke).
//
// This is a PUBLIC endpoint — PayNexus calls it directly with no Supabase
// Auth JWT, so it must be deployed with JWT verification OFF:
//   supabase functions deploy paynexus-webhook --no-verify-jwt
// Authentication instead relies entirely on the HMAC signature check below,
// exactly like a Stripe/GitHub-style webhook.
//
// Register this URL in the PayNexus merchant dashboard under Webhooks:
//   https://<your-project-ref>.supabase.co/functions/v1/paynexus-webhook
// and copy the webhook secret it gives you into PAYNEXUS_WEBHOOK_SECRET
// (supabase secrets set PAYNEXUS_WEBHOOK_SECRET=whsec_...).

import { withSupabase } from 'npm:@supabase/server@^1'

const MAX_TIMESTAMP_SKEW_SECONDS = 300

interface PayNexusWebhookPayload {
  event: 'payment.completed' | 'payment.failed' | string
  timestamp: string
  data: {
    reference: string
    transaction_id?: string
    provider_transaction_id?: string
    [key: string]: unknown
  }
}

// PayNexus signs the raw JSON body with HMAC-SHA256 and sends the hex digest
// in X-PayNexus-Signature. Their own dashboard sample verification snippet
// does `ltrim($signature, 'sha256=')` before comparing, which means the
// header can arrive as either a bare hex digest OR prefixed with "sha256=" —
// strip that prefix the same way so both shapes verify correctly.
// crypto.subtle.verify does a constant-time comparison internally, which is
// important here — comparing signatures with a plain === would leak timing
// information.
async function verifySignature(rawBody: string, signatureHeader: string, secret: string): Promise<boolean> {
  const signatureHex = signatureHeader.trim().replace(/^sha256=/i, '')
  if (!/^[0-9a-f]+$/i.test(signatureHex) || signatureHex.length % 2 !== 0) return false

  const key = await crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['verify'],
  )

  const signatureBytes = new Uint8Array(signatureHex.match(/.{1,2}/g)!.map((byte) => parseInt(byte, 16)))

  return crypto.subtle.verify('HMAC', key, signatureBytes, new TextEncoder().encode(rawBody))
}

export default {
  fetch: withSupabase({ auth: 'none' }, async (req, ctx) => {
    const webhookSecret = Deno.env.get('PAYNEXUS_WEBHOOK_SECRET')
    if (!webhookSecret) {
      console.error('paynexus-webhook: PAYNEXUS_WEBHOOK_SECRET is not set')
      return Response.json({ received: false }, { status: 500 })
    }

    const signature = req.headers.get('X-PayNexus-Signature')
    const timestampHeader = req.headers.get('X-PayNexus-Timestamp')
    const rawBody = await req.text()

    if (!signature) {
      return Response.json({ received: false, message: 'Missing signature header' }, { status: 401 })
    }

    // PayNexus's own "How to Verify Webhooks" instructions only reference
    // X-PayNexus-Signature, not a timestamp header — so this check only
    // fires when the header is actually present, rather than hard-rejecting
    // every real webhook because PayNexus never sends one.
    if (timestampHeader) {
      const ageSeconds = Math.abs(Date.now() / 1000 - Number(timestampHeader))
      if (!Number.isFinite(ageSeconds) || ageSeconds > MAX_TIMESTAMP_SKEW_SECONDS) {
        return Response.json({ received: false, message: 'Stale webhook timestamp' }, { status: 401 })
      }
    }

    let validSignature = false
    try {
      validSignature = await verifySignature(rawBody, signature, webhookSecret)
    } catch (err) {
      console.error('paynexus-webhook: signature verification error', err)
    }

    if (!validSignature) {
      console.error('paynexus-webhook: invalid signature')
      return Response.json({ received: false, message: 'Invalid signature' }, { status: 403 })
    }

    let payload: PayNexusWebhookPayload
    try {
      payload = JSON.parse(rawBody)
    } catch {
      return Response.json({ received: false, message: 'Malformed JSON' }, { status: 400 })
    }

    const reference = payload.data?.reference
    if (!reference) {
      return Response.json({ received: false, message: 'Missing data.reference' }, { status: 400 })
    }

    if (payload.event !== 'payment.completed' && payload.event !== 'payment.failed') {
      // Unrecognized event type (e.g. a future event PayNexus adds later) —
      // acknowledge so PayNexus doesn't retry, but don't touch the ledger.
      return Response.json({ received: true, note: 'event ignored' })
    }

    const newStatus = payload.event === 'payment.completed' ? 'completed' : 'failed'
    const mpesaReceipt = payload.data.provider_transaction_id ?? payload.data.transaction_id ?? null

    const { data: result, error } = await ctx.supabaseAdmin.rpc('paynexus_resolve_deposit', {
      p_reference: reference,
      p_new_status: newStatus,
      p_mpesa_receipt: mpesaReceipt,
      p_raw_payload: payload,
    })

    if (error) {
      console.error('paynexus-webhook: paynexus_resolve_deposit failed', error, reference)
      // 500 so PayNexus retries — this is a transient/our-side failure, not
      // a reason to give up on the event.
      return Response.json({ received: false }, { status: 500 })
    }

    if (result === 'not_found') {
      // Happens if paynexus-deposit's RPC call failed after PayNexus had
      // already accepted the initiate request (see its logged warning).
      // Returning 200 stops PayNexus from retrying forever; reconcile
      // manually via the PayNexus dashboard using this reference.
      console.error('paynexus-webhook: no local payment row for reference', reference)
    }

    return Response.json({ received: true, result })
  }),
}
