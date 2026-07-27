-- ============================================================================
-- RE-SAVED, NAME FIX ONLY — no SQL below this box changed.
--
-- This migration previously existed on disk as a file literally named
-- "0011 paynexus payments" — spaces instead of underscores, and missing the
-- .sql extension. supabase db push / migration up only picks up files
-- matching supabase/migrations/*.sql, so that file was never recognized as
-- a migration and was never applied. public.paynexus_payments and the
-- paynexus_create_pending_deposit / paynexus_resolve_deposit functions it
-- defines below have therefore never existed in the database — which is
-- exactly why paynexus-deposit's RPC call fails every time with "we had
-- trouble saving the record": it's calling a function that was never
-- created. (src/types/database.types.ts already refers to this file by its
-- correct name, "0011_paynexus_payments.sql" — that's the name it was
-- always supposed to have.)
--
-- Fix: delete the malformed "0011 paynexus payments" file from
-- supabase/migrations and put this one in its place, then push/apply
-- migrations again (this one and 0012 together).
-- ============================================================================

-- ============================================================================
-- Migration: 0011_paynexus_payments
-- Purpose:   PayNexus (paynexus.co.ke) M-Pesa STK Push deposit integration.
--            Tracks each STK push attempt from initiation through webhook
--            confirmation, and atomically credits the player wallet once
--            PayNexus confirms M-Pesa payment completed.
--
-- Scope note: PayNexus's documented API only exposes payment COLLECTION
-- (STK Push initiate + status/webhooks). There is no disbursement/B2C
-- endpoint, so this migration — and the paynexus-deposit / paynexus-webhook
-- Edge Functions that use it — only cover deposits. Withdrawals still need a
-- separate mechanism; see chat notes.
-- ============================================================================

-- ----------------------------------------------------------------------------
-- PAYNEXUS_PAYMENTS
-- One row per STK push attempt. Linked 1:1 to a public.transactions row
-- (type = 'deposit') created at the same time, so the two can never drift.
-- ----------------------------------------------------------------------------

create table public.paynexus_payments (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles (id) on delete cascade,
  transaction_id uuid not null references public.transactions (id) on delete cascade,
  status public.transaction_status not null default 'pending',
  amount_cents bigint not null check (amount_cents > 0),
  phone text not null,
  reference text not null unique,
  checkout_request_id text unique,
  merchant_request_id text,
  payment_id_external bigint,
  idempotency_key text not null unique,
  mpesa_receipt text,
  raw_webhook_payload jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

comment on table public.paynexus_payments is 'Lifecycle of M-Pesa STK Push deposits initiated via the PayNexus (paynexus.co.ke) API. One row per attempt, linked to a transactions row.';

create index paynexus_payments_user_id_idx on public.paynexus_payments (user_id);
create index paynexus_payments_status_idx on public.paynexus_payments (status);

create trigger paynexus_payments_set_updated_at
  before update on public.paynexus_payments
  for each row execute procedure public.set_updated_at();

-- ----------------------------------------------------------------------------
-- ROW LEVEL SECURITY
-- Players can see their own PayNexus payment attempts (handy for the wallet
-- dialog's realtime subscription). No insert/update policy is granted to
-- authenticated users by design — all writes go through the two
-- security-definer functions below, called only from the service-role Edge
-- Functions (paynexus-deposit, paynexus-webhook).
-- ----------------------------------------------------------------------------

alter table public.paynexus_payments enable row level security;

create policy "Users can view their own paynexus payments"
  on public.paynexus_payments for select
  using (auth.uid() = user_id or public.is_admin());

-- ----------------------------------------------------------------------------
-- FUNCTION: paynexus_create_pending_deposit
-- Called by the paynexus-deposit Edge Function immediately after PayNexus
-- accepts an STK Push initiate request. Creates the transactions row and the
-- paynexus_payments row in one atomic statement.
-- ----------------------------------------------------------------------------

create function public.paynexus_create_pending_deposit(
  p_user_id uuid,
  p_amount_cents bigint,
  p_phone text,
  p_reference text,
  p_checkout_request_id text,
  p_merchant_request_id text,
  p_payment_id_external bigint,
  p_idempotency_key text
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_transaction_id uuid;
  v_payment_id uuid;
begin
  insert into public.transactions (user_id, type, status, amount_cents, mpesa_phone)
  values (p_user_id, 'deposit', 'pending', p_amount_cents, p_phone)
  returning id into v_transaction_id;

  insert into public.paynexus_payments (
    user_id, transaction_id, status, amount_cents, phone, reference,
    checkout_request_id, merchant_request_id, payment_id_external, idempotency_key
  )
  values (
    p_user_id, v_transaction_id, 'pending', p_amount_cents, p_phone, p_reference,
    p_checkout_request_id, p_merchant_request_id, p_payment_id_external, p_idempotency_key
  )
  returning id into v_payment_id;

  return v_payment_id;
end;
$$;

revoke all on function public.paynexus_create_pending_deposit(uuid, bigint, text, text, text, text, bigint, text) from public;
grant execute on function public.paynexus_create_pending_deposit(uuid, bigint, text, text, text, text, bigint, text) to service_role;

-- ----------------------------------------------------------------------------
-- FUNCTION: paynexus_resolve_deposit
-- Called by the paynexus-webhook Edge Function when PayNexus reports a
-- payment.completed or payment.failed event. Idempotent (safe to call twice
-- for the same reference — e.g. on webhook redelivery): row is locked with
-- FOR UPDATE and only acted on while still 'pending'. Marking the deposit
-- completed and crediting the wallet happen in the same statement, so a
-- deposit can never end up 'completed' without the balance being updated.
-- ----------------------------------------------------------------------------

create function public.paynexus_resolve_deposit(
  p_reference text,
  p_new_status public.transaction_status,
  p_mpesa_receipt text,
  p_raw_payload jsonb
)
returns text -- 'ok' | 'not_found' | 'already_resolved' | 'invalid_status'
language plpgsql
security definer
set search_path = public
as $$
declare
  v_payment public.paynexus_payments%rowtype;
begin
  if p_new_status not in ('completed', 'failed') then
    return 'invalid_status';
  end if;

  select * into v_payment
  from public.paynexus_payments
  where reference = p_reference
  for update;

  if not found then
    return 'not_found';
  end if;

  if v_payment.status <> 'pending' then
    return 'already_resolved';
  end if;

  update public.paynexus_payments
  set status = p_new_status,
      mpesa_receipt = p_mpesa_receipt,
      raw_webhook_payload = p_raw_payload
  where id = v_payment.id;

  update public.transactions
  set status = p_new_status,
      mpesa_receipt = p_mpesa_receipt
  where id = v_payment.transaction_id;

  if p_new_status = 'completed' then
    update public.wallets
    set balance_cents = balance_cents + v_payment.amount_cents
    where user_id = v_payment.user_id;
  end if;

  return 'ok';
end;
$$;

revoke all on function public.paynexus_resolve_deposit(text, public.transaction_status, text, jsonb) from public;
grant execute on function public.paynexus_resolve_deposit(text, public.transaction_status, text, jsonb) to service_role;

-- ----------------------------------------------------------------------------
-- REALTIME
-- The deposit dialog subscribes to postgres_changes on its own
-- paynexus_payments row to know the moment the webhook resolves it. Without
-- publication membership + full replica identity this fires with an empty/
-- partial payload.new — see 0010's note, which hit the identical symptom for
-- Ludo move sync. Idempotent: safe to re-run.
-- ----------------------------------------------------------------------------

do $$
begin
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime'
      and schemaname = 'public'
      and tablename = 'paynexus_payments'
  ) then
    alter publication supabase_realtime add table public.paynexus_payments;
  end if;
end $$;

alter table public.paynexus_payments replica identity full;
