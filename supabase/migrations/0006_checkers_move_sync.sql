-- ============================================================================
-- Migration: 0006_checkers_move_sync.sql
-- Purpose:   Persist live board state on checkers_contests so moves made by
--            one player are visible to the other in real time.
--
-- Why this is needed:
--   The 3D checkers engine (GameEngine.js) previously ran entirely inside
--   each player's own browser tab. Calling engine.move() only updated that
--   tab's local in-memory board — nothing was ever written to the database,
--   so the opponent's tab never learned a move had happened. Their engine
--   still expected the same player to move, which is why they saw
--   "It's not your turn" even after waiting for their turn.
--
--   The fix: the board + whose turn it is now lives in this table.
--   seed_checkers_board() writes the starting position once when a match
--   begins; every move after that goes through make_checkers_move(), which
--   atomically validates turn ownership and persists the new state. Both
--   clients subscribe to postgres_changes on this row and re-render from
--   the authoritative board_state/turn columns instead of trusting their
--   own local engine.
-- ============================================================================

alter table public.checkers_contests
  add column board_state jsonb,
  add column turn        text check (turn in ('black', 'white')),
  add column move_count  smallint not null default 0;

comment on column public.checkers_contests.board_state is
  'Authoritative 8x8 board as JSON (row-major array of {color,king}|null). Null until the match starts.';
comment on column public.checkers_contests.turn is
  'Color to move next. Null until the match starts.';

-- ---------------------------------------------------------------------------
-- make_checkers_move(contest_id, user_id, board_state, turn, move_count,
--                     game_over, winner_id)
--
-- The client (which already has the full rules engine — RuleProcessor.js)
-- validates the move locally, computes the resulting board/turn, and sends
-- the result here to persist. This function's job is NOT to re-derive
-- checkers rules in SQL; it's to atomically:
--   1. Confirm the contest is in_progress/booked and the caller is seated.
--   2. Confirm it is actually the caller's turn (race-condition guard — the
--      "WHERE turn = caller's color" clause means if two moves land at the
--      same time, only the first one wins; the second UPDATE matches 0 rows
--      and the function reports 'not_your_turn').
--   3. Persist the new board/turn so the realtime UPDATE fires for both
--      clients.
--   4. Optionally close out the match (game_over) and pay out the pot via
--      the existing complete_checkers_contest() flow.
--
-- Returns: 'ok' | 'not_found' | 'not_a_player' | 'not_in_progress' | 'not_your_turn'
-- ---------------------------------------------------------------------------

create function public.make_checkers_move(
  p_contest_id  uuid,
  p_user_id     uuid,
  p_board_state jsonb,
  p_turn        text,
  p_move_count  smallint,
  p_game_over   boolean default false,
  p_winner_id   uuid default null
)
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  v_contest    public.checkers_contests%rowtype;
  v_my_color   text;
  v_updated    int;
begin
  select * into v_contest
  from public.checkers_contests
  where id = p_contest_id
  for update;

  if not found then
    return 'not_found';
  end if;

  if v_contest.status not in ('booked', 'in_progress') then
    return 'not_in_progress';
  end if;

  select color into v_my_color
  from public.checkers_contest_players
  where contest_id = p_contest_id and user_id = p_user_id;

  if v_my_color is null then
    return 'not_a_player';
  end if;

  -- Determine whose turn it currently is on the server. The very first move
  -- of a match happens before any board_state/turn has been written, so we
  -- fall back to 'black' (host moves first), matching GameEngine's _reset().
  if coalesce(v_contest.turn, 'black') <> v_my_color then
    return 'not_your_turn';
  end if;

  -- Belt-and-suspenders guard: the `for update` lock above already
  -- serializes concurrent callers for this contest, so by the time we get
  -- here v_contest.turn is current and the check on line 95 has already
  -- rejected an out-of-turn caller. The `and coalesce(turn,...) = v_my_color`
  -- clause below is a defensive backstop in case that assumption ever
  -- breaks (e.g. a future refactor that reads v_contest outside the lock) —
  -- it costs nothing and means a stale read can never silently overwrite a
  -- newer move.
  update public.checkers_contests
  set board_state = p_board_state,
      turn         = p_turn,
      move_count   = p_move_count,
      status       = 'in_progress'
  where id = p_contest_id
    and coalesce(turn, 'black') = v_my_color
  returning 1 into v_updated;

  if v_updated is null then
    return 'not_your_turn';
  end if;

  if p_game_over then
    perform public.complete_checkers_contest(p_contest_id, p_winner_id);
  end if;

  return 'ok';
end;
$$;

comment on function public.make_checkers_move is
  'Atomically persists a validated move so the opponent''s client receives it via realtime. Client validates move legality with RuleProcessor.js before calling this.';

-- ---------------------------------------------------------------------------
-- seed_checkers_board(contest_id, user_id, board_state, turn, move_count)
--
-- Separate from make_checkers_move() on purpose: writing the *starting*
-- board isn't a move by either player and shouldn't be gated on whose turn
-- it is. Both clients independently generate the same deterministic
-- starting layout (RuleProcessor.initialBoard() takes no randomness) and
-- race to call this once when board_state is still null. Only the first
-- writer wins; the loser's call is a harmless, expected no-op — both
-- outcomes leave the same board in place, so there's nothing to reconcile.
--
-- Returns: 'ok' (we wrote it) | 'already_seeded' (someone else already did,
-- which is not an error) | 'not_found' | 'not_a_player' | 'not_in_progress'
-- ---------------------------------------------------------------------------

create function public.seed_checkers_board(
  p_contest_id  uuid,
  p_user_id     uuid,
  p_board_state jsonb,
  p_turn        text,
  p_move_count  smallint
)
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  v_contest  public.checkers_contests%rowtype;
  v_updated  int;
begin
  select * into v_contest
  from public.checkers_contests
  where id = p_contest_id
  for update;

  if not found then
    return 'not_found';
  end if;

  if v_contest.status not in ('booked', 'in_progress') then
    return 'not_in_progress';
  end if;

  if not exists (
    select 1 from public.checkers_contest_players
    where contest_id = p_contest_id and user_id = p_user_id
  ) then
    return 'not_a_player';
  end if;

  update public.checkers_contests
  set board_state = p_board_state,
      turn         = p_turn,
      move_count   = p_move_count,
      status       = 'in_progress'
  where id = p_contest_id
    and board_state is null
  returning 1 into v_updated;

  if v_updated is null then
    return 'already_seeded';
  end if;

  return 'ok';
end;
$$;

comment on function public.seed_checkers_board is
  'Writes the starting board exactly once, racing safely against the opponent''s tab doing the same on first mount. Not gated by turn ownership, only by board_state being null.';

-- complete_checkers_contest already requires status in ('booked','in_progress'),
-- which still holds immediately after the update above, so the game-over path
-- composes correctly with no further changes needed there.
