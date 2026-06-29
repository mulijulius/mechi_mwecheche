-- ============================================================================
-- Migration: 0007_checkers_zero_stake_payout_fix.sql
-- Purpose:   Fix complete_checkers_contest() throwing on zero-stake matches,
--            which broke the *winning* move in a checkers game.
--
-- Root cause:
--   complete_checkers_contest() always inserts a row into public.transactions
--   for the payout (or refund, on a draw), using v_contest.pot_cents /
--   entry_fee_cents as amount_cents. That column has
--   `check (amount_cents > 0)`. For a free / zero-stake contest (pot_cents
--   or entry_fee_cents = 0), that insert violates the check constraint and
--   throws — and since complete_checkers_contest() is called from inside
--   make_checkers_move()'s own transaction (the move that just ended the
--   game), the whole move gets rolled back. The client sees a generic
--   Postgres error and shows "Move failed — syncing...", but only on the
--   exact move that finishes the game — every move before that never
--   touches this code path at all, which is why it looked like "the game
--   works until the very last move."
--
-- Fix:
--   Treat a zero (or negative, defensively) amount as "nothing to record" —
--   skip the wallet credit and ledger insert for that amount instead of
--   attempting a 0-amount transaction row. The contest still gets marked
--   completed with the correct winner_id either way; only the money
--   movement is skipped when there's no money to move.
-- ============================================================================

create or replace function public.complete_checkers_contest(
  p_contest_id  uuid,
  p_winner_id   uuid   -- null = draw → refund both
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_contest  public.checkers_contests%rowtype;
  v_player   record;
begin
  select * into v_contest
  from public.checkers_contests
  where id = p_contest_id
  for update;

  if not found or v_contest.status not in ('booked', 'in_progress') then
    return;
  end if;

  update public.checkers_contests
  set status       = 'completed',
      winner_id    = p_winner_id,
      completed_at = now()
  where id = p_contest_id;

  -- Payout winner, or refund both on draw. Only move money (and write a
  -- ledger row) when there's actually a positive amount to move — a free
  -- / zero-stake match has nothing to pay out, and attempting to insert
  -- amount_cents = 0 would violate transactions' `check (amount_cents > 0)`.
  if p_winner_id is not null then
    if v_contest.pot_cents > 0 then
      update public.wallets
      set balance_cents = balance_cents + v_contest.pot_cents,
          updated_at    = now()
      where user_id = p_winner_id;

      insert into public.transactions (user_id, match_id, type, status, amount_cents)
      values (p_winner_id, null, 'payout', 'completed', v_contest.pot_cents);
    end if;
  else
    -- Draw: refund each player their stake
    for v_player in
      select user_id from public.checkers_contest_players where contest_id = p_contest_id
    loop
      if v_contest.entry_fee_cents > 0 then
        update public.wallets
        set balance_cents = balance_cents + v_contest.entry_fee_cents,
            updated_at    = now()
        where user_id = v_player.user_id;

        insert into public.transactions (user_id, match_id, type, status, amount_cents)
        values (v_player.user_id, null, 'refund', 'completed', v_contest.entry_fee_cents);
      end if;
    end loop;
  end if;
end;
$$;

comment on function public.complete_checkers_contest is
  'Marks a checkers contest complete and pays out the winner (or refunds both on a draw). Skips wallet/ledger writes entirely for zero-stake matches, since transactions.amount_cents has check (amount_cents > 0) and a 0-amount entry has nothing to record.';
