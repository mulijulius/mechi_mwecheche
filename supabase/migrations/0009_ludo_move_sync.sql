-- ============================================================================
-- Migration: 0009_ludo_move_sync.sql
-- Purpose:   Persist live game state on ludo_contests so dice rolls and moves
--            made by one player are visible to every other seated player in
--            real time.
--
-- Mirrors 0006_checkers_move_sync.sql exactly in spirit: the Ludo engine
-- (public/ludo/js/GameEngine.js) runs entirely client-side using the same
-- rules used by every other seated client. The client that acts (rolls or
-- moves) computes the resulting state and persists it here; every client
-- subscribes to postgres_changes on this row and re-renders from the
-- authoritative game_state/current_seat columns instead of trusting its own
-- local engine instance.
-- ============================================================================

alter table public.ludo_contests
  add column game_state    jsonb,
  add column current_seat  smallint check (current_seat in (0, 1, 2, 3)),
  add column move_count    integer not null default 0;

comment on column public.ludo_contests.game_state is
  'Authoritative LudoGameState as JSON (players/tokens/dice/phase). Null until the match starts.';
comment on column public.ludo_contests.current_seat is
  'Seat index (0-3) whose turn it currently is. Null until the match starts.';

-- ---------------------------------------------------------------------------
-- make_ludo_move(contest_id, user_id, game_state, current_seat, move_count,
--                 game_over, winner_id)
--
-- The client already has the full rules engine (RuleProcessor.js /
-- GameEngine.js) and computes the resulting state locally — whether that
-- state change was a dice roll, a token move, or an auto-skip. This
-- function's job is NOT to re-derive Ludo rules in SQL; it's to atomically:
--   1. Confirm the contest is booked/in_progress and the caller is seated
--      and hasn't left.
--   2. Confirm it is actually the caller's seat's turn (race-condition guard,
--      same pattern as make_checkers_move's `where turn = caller's color`).
--   3. Persist the new game_state/current_seat so the realtime UPDATE fires
--      for every seated client.
--   4. Optionally close out the match and pay out the pot via
--      complete_ludo_contest().
--
-- Returns: 'ok' | 'not_found' | 'not_a_player' | 'not_in_progress' | 'not_your_turn'
-- ---------------------------------------------------------------------------

create function public.make_ludo_move(
  p_contest_id    uuid,
  p_user_id       uuid,
  p_game_state    jsonb,
  p_current_seat  smallint,
  p_move_count    integer,
  p_game_over     boolean default false,
  p_winner_id     uuid default null
)
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  v_contest   public.ludo_contests%rowtype;
  v_my_seat   smallint;
  v_updated   int;
begin
  select * into v_contest
  from public.ludo_contests
  where id = p_contest_id
  for update;

  if not found then
    return 'not_found';
  end if;

  if v_contest.status not in ('booked', 'in_progress') then
    return 'not_in_progress';
  end if;

  select seat into v_my_seat
  from public.ludo_contest_players
  where contest_id = p_contest_id and user_id = p_user_id and left_at is null;

  if v_my_seat is null then
    return 'not_a_player';
  end if;

  -- The very first action of a match happens before any game_state/
  -- current_seat has been written, so fall back to seat 0 (host moves
  -- first), matching the engine's initial turnIndex of 0.
  if coalesce(v_contest.current_seat, 0) <> v_my_seat then
    return 'not_your_turn';
  end if;

  update public.ludo_contests
  set game_state   = p_game_state,
      current_seat = p_current_seat,
      move_count   = p_move_count,
      status       = 'in_progress'
  where id = p_contest_id
    and coalesce(current_seat, 0) = v_my_seat
  returning 1 into v_updated;

  if v_updated is null then
    return 'not_your_turn';
  end if;

  if p_game_over then
    perform public.complete_ludo_contest(p_contest_id, p_winner_id);
  end if;

  return 'ok';
end;
$$;

comment on function public.make_ludo_move is
  'Atomically persists a validated dice roll / move / turn-advance so every seated client receives it via realtime. Client validates legality with RuleProcessor.js before calling this.';

-- ---------------------------------------------------------------------------
-- seed_ludo_board(contest_id, user_id, game_state, current_seat, move_count)
--
-- Separate from make_ludo_move() on purpose, exactly as seed_checkers_board()
-- is separate from make_checkers_move(): writing the starting state isn't a
-- move by any player and shouldn't be gated on whose turn it is. Every
-- seated client independently builds the same deterministic starting state
-- (createGame() takes no randomness beyond the dice, which haven't been
-- rolled yet) and races to call this once when game_state is still null.
-- Only the first writer wins; the others are harmless, expected no-ops.
--
-- Returns: 'ok' (we wrote it) | 'already_seeded' | 'not_found' | 'not_a_player' | 'not_in_progress'
-- ---------------------------------------------------------------------------

create function public.seed_ludo_board(
  p_contest_id    uuid,
  p_user_id       uuid,
  p_game_state    jsonb,
  p_current_seat  smallint,
  p_move_count    integer
)
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  v_contest  public.ludo_contests%rowtype;
  v_updated  int;
begin
  select * into v_contest
  from public.ludo_contests
  where id = p_contest_id
  for update;

  if not found then
    return 'not_found';
  end if;

  if v_contest.status not in ('booked', 'in_progress') then
    return 'not_in_progress';
  end if;

  if not exists (
    select 1 from public.ludo_contest_players
    where contest_id = p_contest_id and user_id = p_user_id
  ) then
    return 'not_a_player';
  end if;

  update public.ludo_contests
  set game_state   = p_game_state,
      current_seat = p_current_seat,
      move_count   = p_move_count,
      status       = 'in_progress'
  where id = p_contest_id
    and game_state is null
  returning 1 into v_updated;

  if v_updated is null then
    return 'already_seeded';
  end if;

  return 'ok';
end;
$$;

comment on function public.seed_ludo_board is
  'Writes the starting Ludo state exactly once, racing safely against other seated clients doing the same on first mount. Not gated by turn ownership, only by game_state being null.';

-- complete_ludo_contest already requires status in ('booked','in_progress'),
-- which still holds immediately after the update above, so the game-over
-- path composes correctly with no further changes needed there.
