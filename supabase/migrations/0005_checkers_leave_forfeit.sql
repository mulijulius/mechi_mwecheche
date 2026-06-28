-- ============================================================================
-- Migration: 0005_checkers_leave_forfeit.sql
-- Purpose:   Lets a player leave a checkers contest mid-flow.
--              - If the contest is still 'open' (no challenger yet), leaving
--                cancels it and refunds the host's stake (if any).
--              - If the contest is 'booked' or 'in_progress', leaving forfeits
--                the match: the remaining player is awarded the pot and the
--                contest is marked 'completed' with forfeited_by set, so the
--                UI can show "Opponent left — you win" instead of a generic
--                game-over message.
-- ============================================================================

-- ----------------------------------------------------------------------------
-- Track who (if anyone) forfeited by leaving, for history/support purposes
-- and so clients can distinguish a forfeit from a normal completed game.
-- ----------------------------------------------------------------------------

alter table public.checkers_contests
  add column forfeited_by uuid references public.profiles (id);

comment on column public.checkers_contests.forfeited_by is
  'Set when a player leaves an open/booked/in_progress contest. Null for normal completions.';

-- ----------------------------------------------------------------------------
-- leave_checkers_contest(contest_id, user_id) → text
-- Returns: 'cancelled' | 'forfeited' | 'not_found' | 'not_a_player' | 'already_over' | 'error'
-- ----------------------------------------------------------------------------

create function public.leave_checkers_contest(
  p_contest_id  uuid,
  p_user_id     uuid
)
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  v_contest      public.checkers_contests%rowtype;
  v_is_player    boolean;
  v_opponent_id  uuid;
begin
  -- 1. Lock the contest row
  select * into v_contest
  from public.checkers_contests
  where id = p_contest_id
  for update;

  if not found then
    return 'not_found';
  end if;

  -- 2. Confirm the caller is actually seated in this contest
  select exists (
    select 1 from public.checkers_contest_players
    where contest_id = p_contest_id and user_id = p_user_id
  ) into v_is_player;

  if not v_is_player then
    return 'not_a_player';
  end if;

  -- 3. Already finished / cancelled — nothing to do
  if v_contest.status in ('completed', 'cancelled') then
    return 'already_over';
  end if;

  -- 4a. Contest still open (no opponent yet) — cancel and refund the host
  if v_contest.status = 'open' then
    if v_contest.entry_fee_cents > 0 then
      update public.wallets
      set balance_cents = balance_cents + v_contest.entry_fee_cents,
          updated_at    = now()
      where user_id = v_contest.host_id;

      insert into public.transactions (user_id, match_id, type, status, amount_cents)
      values (v_contest.host_id, null, 'refund', 'completed', v_contest.entry_fee_cents);
    end if;

    update public.checkers_contests
    set status       = 'cancelled',
        forfeited_by = p_user_id,
        completed_at = now()
    where id = p_contest_id;

    return 'cancelled';
  end if;

  -- 4b. Contest booked / in_progress — forfeit. Opponent takes the pot.
  select user_id into v_opponent_id
  from public.checkers_contest_players
  where contest_id = p_contest_id and user_id <> p_user_id
  limit 1;

  update public.checkers_contests
  set status       = 'completed',
      winner_id    = v_opponent_id,
      forfeited_by = p_user_id,
      completed_at = now()
  where id = p_contest_id;

  if v_opponent_id is not null and v_contest.pot_cents > 0 then
    update public.wallets
    set balance_cents = balance_cents + v_contest.pot_cents,
        updated_at    = now()
    where user_id = v_opponent_id;

    insert into public.transactions (user_id, match_id, type, status, amount_cents)
    values (v_opponent_id, null, 'payout', 'completed', v_contest.pot_cents);
  end if;

  return 'forfeited';
exception
  when others then
    return 'error';
end;
$$;

comment on function public.leave_checkers_contest is
  'Player leaves a contest. Cancels+refunds if still open; forfeits the pot to the opponent if booked/in_progress.';
