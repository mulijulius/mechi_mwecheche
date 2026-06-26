-- ============================================================================
-- Migration: 0001_init.sql
-- Project:   SkillForge Arena — multi-game real-money competition platform
-- Purpose:   Initial schema — profiles, wallets, games, matches, transactions
-- ============================================================================

-- Required for gen_random_uuid()
create extension if not exists "pgcrypto";

-- ----------------------------------------------------------------------------
-- ENUM TYPES
-- ----------------------------------------------------------------------------

create type public.user_role as enum ('player', 'admin');
create type public.user_status as enum ('active', 'suspended', 'banned');
create type public.game_slug as enum ('ludo', 'checkers', 'chess', 'billiards', 'solitaire');
create type public.match_status as enum ('open', 'filling', 'in_progress', 'completed', 'cancelled');
create type public.transaction_type as enum ('deposit', 'withdrawal', 'stake', 'payout', 'refund');
create type public.transaction_status as enum ('pending', 'completed', 'failed', 'reversed');

-- ----------------------------------------------------------------------------
-- PROFILES
-- One row per auth.users entry. Created automatically via trigger on signup.
-- ----------------------------------------------------------------------------

create table public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  username text not null unique,
  full_name text,
  phone_number text,
  avatar_url text,
  role public.user_role not null default 'player',
  status public.user_status not null default 'active',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

comment on table public.profiles is 'Public profile data for each platform user, 1:1 with auth.users.';

-- ----------------------------------------------------------------------------
-- WALLETS
-- One wallet per user. Balance stored in integer cents (KES) to avoid float
-- rounding issues. locked_cents represents funds held as an active stake.
-- ----------------------------------------------------------------------------

create table public.wallets (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null unique references public.profiles (id) on delete cascade,
  balance_cents bigint not null default 0 check (balance_cents >= 0),
  locked_cents bigint not null default 0 check (locked_cents >= 0),
  currency text not null default 'KES',
  updated_at timestamptz not null default now()
);

comment on table public.wallets is 'Player wallet balances. All amounts in integer cents.';

-- ----------------------------------------------------------------------------
-- GAMES
-- Static catalogue of the five supported games.
-- ----------------------------------------------------------------------------

create table public.games (
  id uuid primary key default gen_random_uuid(),
  slug public.game_slug not null unique,
  name text not null,
  description text,
  min_players int not null default 2,
  max_players int not null default 2,
  is_active boolean not null default true,
  created_at timestamptz not null default now()
);

comment on table public.games is 'Catalogue of playable games on the platform.';

-- ----------------------------------------------------------------------------
-- MATCHES
-- A hosted, stakeable game session. Pot accumulates as players join.
-- ----------------------------------------------------------------------------

create table public.matches (
  id uuid primary key default gen_random_uuid(),
  game_id uuid not null references public.games (id),
  host_id uuid not null references public.profiles (id),
  stake_cents bigint not null check (stake_cents > 0),
  pot_cents bigint not null default 0 check (pot_cents >= 0),
  max_players int not null default 2 check (max_players >= 2),
  status public.match_status not null default 'open',
  winner_id uuid references public.profiles (id),
  created_at timestamptz not null default now(),
  started_at timestamptz,
  completed_at timestamptz
);

comment on table public.matches is 'A single hosted match/table for a game, with stake and pot tracking.';

create index matches_game_id_idx on public.matches (game_id);
create index matches_status_idx on public.matches (status);
create index matches_host_id_idx on public.matches (host_id);

-- ----------------------------------------------------------------------------
-- MATCH PLAYERS
-- Join table: which users are seated in which match.
-- ----------------------------------------------------------------------------

create table public.match_players (
  id uuid primary key default gen_random_uuid(),
  match_id uuid not null references public.matches (id) on delete cascade,
  user_id uuid not null references public.profiles (id),
  seat int not null,
  joined_at timestamptz not null default now(),
  unique (match_id, user_id),
  unique (match_id, seat)
);

comment on table public.match_players is 'Seats a player has taken in a given match.';

-- ----------------------------------------------------------------------------
-- TRANSACTIONS
-- Ledger of all money movement: Mpesa deposits/withdrawals, stakes, payouts.
-- ----------------------------------------------------------------------------

create table public.transactions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles (id),
  match_id uuid references public.matches (id),
  type public.transaction_type not null,
  status public.transaction_status not null default 'pending',
  amount_cents bigint not null check (amount_cents > 0),
  mpesa_receipt text,
  mpesa_phone text,
  created_at timestamptz not null default now()
);

comment on table public.transactions is 'Ledger of deposits, withdrawals, stakes and payouts. Source of truth for money movement.';

create index transactions_user_id_idx on public.transactions (user_id);
create index transactions_status_idx on public.transactions (status);
create index transactions_match_id_idx on public.transactions (match_id);

-- ----------------------------------------------------------------------------
-- TRIGGERS: auto-create profile + wallet on signup
-- ----------------------------------------------------------------------------

create function public.handle_new_user()
returns trigger
language plpgsql
security definer set search_path = public
as $$
begin
  insert into public.profiles (id, username, full_name)
  values (
    new.id,
    coalesce(new.raw_user_meta_data ->> 'username', split_part(new.email, '@', 1)),
    new.raw_user_meta_data ->> 'full_name'
  );

  insert into public.wallets (user_id, balance_cents)
  values (new.id, 0);

  return new;
end;
$$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute procedure public.handle_new_user();

-- ----------------------------------------------------------------------------
-- TRIGGERS: keep updated_at fresh
-- ----------------------------------------------------------------------------

create function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create trigger profiles_set_updated_at
  before update on public.profiles
  for each row execute procedure public.set_updated_at();

create trigger wallets_set_updated_at
  before update on public.wallets
  for each row execute procedure public.set_updated_at();

-- ----------------------------------------------------------------------------
-- SEED: the five games from the project brief
-- ----------------------------------------------------------------------------

insert into public.games (slug, name, description, min_players, max_players) values
  ('ludo', 'Ludo', 'Classic four-player race-to-home dice game.', 2, 4),
  ('checkers', 'Checkers', 'Traditional two-player draughts on an 8x8 board.', 2, 2),
  ('chess', 'Chess', 'Two-player strategy on the 64-square board.', 2, 2),
  ('billiards', 'Billiards', 'One-on-one 8-ball pool.', 2, 2),
  ('solitaire', 'Solitaire (Poker)', 'Single-player poker patience for stake-based high-score challenges.', 1, 1);

-- ----------------------------------------------------------------------------
-- ROW LEVEL SECURITY
-- ----------------------------------------------------------------------------

alter table public.profiles enable row level security;
alter table public.wallets enable row level security;
alter table public.games enable row level security;
alter table public.matches enable row level security;
alter table public.match_players enable row level security;
alter table public.transactions enable row level security;

-- Helper: is the current user an admin?
create function public.is_admin()
returns boolean
language sql
security definer set search_path = public
stable
as $$
  select exists (
    select 1 from public.profiles
    where id = auth.uid() and role = 'admin'
  );
$$;

-- PROFILES policies
create policy "Profiles are viewable by everyone"
  on public.profiles for select
  using (true);

create policy "Users can update their own profile"
  on public.profiles for update
  using (auth.uid() = id);

create policy "Admins can update any profile"
  on public.profiles for update
  using (public.is_admin());

-- WALLETS policies
create policy "Users can view their own wallet"
  on public.wallets for select
  using (auth.uid() = user_id or public.is_admin());

-- Note: wallet balance mutations should go through a service-role backend
-- function (Mpesa callback handler), never directly from the client.
-- No insert/update policy is granted to authenticated users here by design.

-- GAMES policies
create policy "Games are viewable by everyone"
  on public.games for select
  using (true);

create policy "Admins can manage games"
  on public.games for all
  using (public.is_admin());

-- MATCHES policies
create policy "Matches are viewable by everyone"
  on public.matches for select
  using (true);

create policy "Authenticated users can host a match"
  on public.matches for insert
  with check (auth.uid() = host_id);

create policy "Host or admin can update a match"
  on public.matches for update
  using (auth.uid() = host_id or public.is_admin());

-- MATCH PLAYERS policies
create policy "Match players are viewable by everyone"
  on public.match_players for select
  using (true);

create policy "Users can seat themselves in a match"
  on public.match_players for insert
  with check (auth.uid() = user_id);

-- TRANSACTIONS policies
create policy "Users can view their own transactions"
  on public.transactions for select
  using (auth.uid() = user_id or public.is_admin());

-- Inserts into transactions (deposits/withdrawals via Mpesa) should be
-- performed by a trusted backend (service role / edge function) that
-- verifies the Daraja callback before writing. No public insert policy.
