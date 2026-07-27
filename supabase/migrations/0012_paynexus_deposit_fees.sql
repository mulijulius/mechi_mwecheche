-- ============================================================================
-- Migration: 0012_paynexus_deposit_fees.sql
-- Purpose:   Tiered platform charge on every M-Pesa deposit. The charge is
--            computed from the gross deposit amount, withheld, and only the
--            net amount is credited to the player's wallet.
--
-- Fee table (as specified):
--   Minimum deposit   : KES 10
--   KES   10 -  30     -> KES 1
--   KES   31 -  50     -> KES 3
--   KES   51 -  80     -> KES 6
--   KES   81 - 100     -> KES 8
--   KES  101 - 500     -> KES 10
--   KES  501 and above -> KES 15
--
-- Note: the brief said "> 501" for the top tier, leaving KES 501 itself
-- undefined (the "101 - 500" tier stops at 500). Read literally that's a
-- one-shilling gap with no fee defined. Treating the tiers as contiguous —
-- 501 and up charged KES 15 — is the only reading with no gaps, so that's
-- what's implemented below. Flag it if KES 501 exactly was meant to fall
-- somewhere else.
--
-- amount_cents is always a whole-KES multiple (paynexus-deposit truncates
-- to whole KES before calling PayNexus), so comparing on cent boundaries
-- below (3000 = KES 30, 5000 = KES 50, etc.) lands exactly on the KES
-- boundaries from the table with no rounding edge cases.
-- ============================================================================

-- ----------------------------------------------------------------------------
-- Enforce the KES 10 minimum at the database layer too (previously only
-- checked in the paynexus-deposit Edge Function). Defense in depth: nothing
-- can insert a paynexus_payments row below the table's own minimum, however
-- it got there.
-- ----------------------------------------------------------------------------

alter table public.paynexus_payments
  add constraint paynexus_payments_amount_min_check check (amount_cents >= 1000);

-- ----------------------------------------------------------------------------
-- fee_cents columns
-- Both default to 0 and are only ever set to a non-zero value once a deposit
-- actually completes (see paynexus_resolve_deposit below) — a pending or
-- failed deposit moved no money, so there's nothing to charge a fee on.
--
-- amount_cents keeps meaning "gross amount charged on M-Pesa" everywhere it
-- already appears (matches the STK push + the M-Pesa receipt), so existing
-- displays of amount_cents are unaffected. amount_cents - fee_cents is what
-- actually landed in the wallet.
-- ----------------------------------------------------------------------------

alter table public.paynexus_payments
  add column fee_cents bigint not null default 0 check (fee_cents >= 0);

comment on column public.paynexus_payments.fee_cents is
  'Platform deposit charge withheld once this payment completes (see paynexus_deposit_fee_cents()). Stays 0 while pending/failed.';

alter table public.transactions
  add column fee_cents bigint not null default 0 check (fee_cents >= 0);

comment on column public.transactions.fee_cents is
  'Charge withheld from a deposit before crediting the wallet. Always 0 for non-deposit transaction types. amount_cents - fee_cents is the amount actually credited.';

-- ----------------------------------------------------------------------------
-- FUNCTION: paynexus_deposit_fee_cents
-- Pure lookup, no table access — the tiered charge table above, expressed
-- in cents so it lines up exactly with amount_cents (no float rounding).
-- ----------------------------------------------------------------------------

create function public.paynexus_deposit_fee_cents(p_amount_cents bigint)
returns bigint
language sql
immutable
as $$
  select case
    when p_amount_cents <= 3000  then 100::bigint  -- KES  10 -  30 -> KES 1
    when p_amount_cents <= 5000  then 300::bigint  -- KES  31 -  50 -> KES 3
    when p_amount_cents <= 8000  then 600::bigint  -- KES  51 -  80 -> KES 6
    when p_amount_cents <= 10000 then 800::bigint  -- KES  81 - 100 -> KES 8
    when p_amount_cents <= 50000 then 1000::bigint -- KES 101 - 500 -> KES 10
    else 1500::bigint                              -- KES 501+      -> KES 15
  end;
$$;

comment on function public.paynexus_deposit_fee_cents(bigint) is
  'Tiered platform charge for a given gross deposit amount (in cents). Pure function of the amount — see 0012_paynexus_deposit_fees.sql for the table.';

-- ----------------------------------------------------------------------------
-- FUNCTION: paynexus_resolve_deposit (replaces the 0011 version)
-- Same signature and same 'ok' | 'not_found' | 'already_resolved' |
-- 'invalid_status' contract as before. Only change: on a completed deposit,
-- the wallet is now credited amount_cents - fee_cents instead of the full
-- amount_cents, and both fee_cents columns are set to what was withheld.
-- ----------------------------------------------------------------------------

create or replace function public.paynexus_resolve_deposit(
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
  v_fee_cents bigint := 0;
  v_net_cents bigint;
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

  -- Only a completed deposit incurs the charge — a failed/cancelled STK
  -- push moved no money, so fee_cents stays at its 0 default and nothing
  -- is credited.
  if p_new_status = 'completed' then
    v_fee_cents := public.paynexus_deposit_fee_cents(v_payment.amount_cents);
    v_net_cents := greatest(v_payment.amount_cents - v_fee_cents, 0);
  end if;

  update public.paynexus_payments
  set status = p_new_status,
      mpesa_receipt = p_mpesa_receipt,
      raw_webhook_payload = p_raw_payload,
      fee_cents = v_fee_cents
  where id = v_payment.id;

  update public.transactions
  set status = p_new_status,
      mpesa_receipt = p_mpesa_receipt,
      fee_cents = v_fee_cents
  where id = v_payment.transaction_id;

  if p_new_status = 'completed' then
    update public.wallets
    set balance_cents = balance_cents + v_net_cents
    where user_id = v_payment.user_id;
  end if;

  return 'ok';
end;
$$;

comment on function public.paynexus_resolve_deposit(text, public.transaction_status, text, jsonb) is
  'Resolves a pending PayNexus deposit to completed/failed. On completed, withholds the tiered deposit charge (paynexus_deposit_fee_cents) and credits the wallet with the net amount only. Idempotent — row is locked and only acted on while still pending.';

-- create or replace preserves the grants from 0011 (revoked from public,
-- granted to service_role) — no need to restate them here.
