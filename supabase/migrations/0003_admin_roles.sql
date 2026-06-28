-- ============================================================================
-- Migration: 0003_admin_roles.sql
-- Project:   SkillForge Arena
-- Purpose:   Split the flat 'admin' role into three admin sub-roles
--            (super_admin, support, finance_manager), gate admin accounts
--            behind super-admin approval, add presence tracking for
--            active/offline users, and a support chat channel.
--
--            Players are completely unaffected by the approval gate — they
--            register and sign in immediately, same as before. Only rows
--            with role = 'admin' ever touch admin_status.
-- ============================================================================

-- ----------------------------------------------------------------------------
-- ENUM TYPES
-- ----------------------------------------------------------------------------

-- The three admin sub-roles. NULL on a profile means "not an admin" (player).
create type public.admin_role as enum ('super_admin', 'support', 'finance_manager');

-- Lifecycle of an admin account request. Players never get this status.
create type public.admin_status as enum ('pending', 'approved', 'rejected');

create type public.support_message_sender as enum ('player', 'admin');

-- ----------------------------------------------------------------------------
-- PROFILES: add admin sub-role, approval status, and presence columns
-- ----------------------------------------------------------------------------

alter table public.profiles
  add column admin_role public.admin_role,
  add column admin_status public.admin_status,
  add column last_seen_at timestamptz not null default now();

comment on column public.profiles.admin_role is
  'Sub-role for admin accounts only (super_admin / support / finance_manager). Always null for players.';
comment on column public.profiles.admin_status is
  'Approval lifecycle for admin accounts only. Always null for players — players are never gated.';
comment on column public.profiles.last_seen_at is
  'Updated by a heartbeat from the client on every authenticated page load; used to derive active vs offline.';

-- Backfill: if this migration runs against a database that already has
-- admin rows from before admin_role/admin_status existed, treat them as
-- pre-existing super admins so they aren't locked out, and so the
-- consistency constraint below doesn't fail on migration.
update public.profiles
set admin_role = 'super_admin', admin_status = 'approved'
where role = 'admin' and admin_role is null;

-- Keep data consistent: only admins may carry an admin_role/admin_status,
-- and every admin must carry both (an admin row without a sub-role or
-- status is not a valid state).
alter table public.profiles
  add constraint profiles_admin_fields_consistent check (
    (role = 'admin' and admin_role is not null and admin_status is not null)
    or
    (role = 'player' and admin_role is null and admin_status is null)
  );

create index profiles_admin_status_idx on public.profiles (admin_status) where role = 'admin';
create index profiles_last_seen_at_idx on public.profiles (last_seen_at);

-- ----------------------------------------------------------------------------
-- SIGNUP TRIGGER: support admin role requests at signup time
--
-- Players (the default) are created exactly as before: role = 'player',
-- admin_role/admin_status left null, immediately able to sign in — no
-- approval step, no limit on how many accounts they create.
--
-- An admin signup is requested by passing raw_user_meta_data:
--   { "requested_role": "admin", "requested_admin_role": "super_admin" | "support" | "finance_manager" }
-- That account is created with role = 'admin' and admin_status = 'pending'.
-- It cannot pass the admin area's beforeLoad guard (see app code) until a
-- super admin approves it. The very first super admin must be approved
-- directly in the database (see bootstrap note at the bottom of this file).
-- ----------------------------------------------------------------------------

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer set search_path = public
as $$
declare
  v_requested_role text := new.raw_user_meta_data ->> 'requested_role';
  v_requested_admin_role text := new.raw_user_meta_data ->> 'requested_admin_role';
begin
  if v_requested_role = 'admin' and v_requested_admin_role in ('super_admin', 'support', 'finance_manager') then
    insert into public.profiles (id, username, full_name, phone_number, role, admin_role, admin_status)
    values (
      new.id,
      coalesce(new.raw_user_meta_data ->> 'username', split_part(new.email, '@', 1)),
      new.raw_user_meta_data ->> 'full_name',
      new.raw_user_meta_data ->> 'phone_number',
      'admin',
      v_requested_admin_role::public.admin_role,
      'pending'
    );
  else
    insert into public.profiles (id, username, full_name, phone_number, role)
    values (
      new.id,
      coalesce(new.raw_user_meta_data ->> 'username', split_part(new.email, '@', 1)),
      new.raw_user_meta_data ->> 'full_name',
      new.raw_user_meta_data ->> 'phone_number',
      'player'
    );
  end if;

  insert into public.wallets (user_id, balance_cents)
  values (new.id, 0);

  return new;
end;
$$;

-- ----------------------------------------------------------------------------
-- PERMISSION HELPER FUNCTIONS
-- Centralized here so RLS policies and RPCs share one definition of each
-- capability instead of re-deriving it ad hoc per policy.
-- ----------------------------------------------------------------------------

-- True for any admin who has been approved (any sub-role).
create or replace function public.is_approved_admin()
returns boolean
language sql
security definer set search_path = public
stable
as $$
  select exists (
    select 1 from public.profiles
    where id = auth.uid()
      and role = 'admin'
      and admin_status = 'approved'
  );
$$;

-- Backwards-compatible with the original is_admin() used in 0001_init.sql
-- policies — now means "approved admin of any sub-role".
create or replace function public.is_admin()
returns boolean
language sql
security definer set search_path = public
stable
as $$
  select public.is_approved_admin();
$$;

create or replace function public.is_super_admin()
returns boolean
language sql
security definer set search_path = public
stable
as $$
  select exists (
    select 1 from public.profiles
    where id = auth.uid()
      and role = 'admin'
      and admin_status = 'approved'
      and admin_role = 'super_admin'
  );
$$;

create or replace function public.current_admin_role()
returns public.admin_role
language sql
security definer set search_path = public
stable
as $$
  select admin_role from public.profiles
  where id = auth.uid() and role = 'admin' and admin_status = 'approved';
$$;

-- Single source of truth for the capability matrix described in the brief:
--   super_admin      -> everything
--   support          -> player_chat, presence, statistics
--   finance_manager  -> financial_records, statistics
-- Capability keys: 'manage_users', 'approve_admins', 'financial_records',
--                   'withdraw_funds', 'statistics', 'presence', 'player_chat'
create or replace function public.has_admin_capability(p_capability text)
returns boolean
language sql
security definer set search_path = public
stable
as $$
  select case public.current_admin_role()
    when 'super_admin' then
      p_capability in (
        'manage_users', 'approve_admins', 'financial_records',
        'withdraw_funds', 'statistics', 'presence', 'player_chat'
      )
    when 'support' then
      p_capability in ('statistics', 'presence', 'player_chat')
    when 'finance_manager' then
      p_capability in ('statistics', 'financial_records')
    else false
  end;
$$;

grant execute on function public.is_admin() to authenticated;
grant execute on function public.is_approved_admin() to authenticated;
grant execute on function public.is_super_admin() to authenticated;
grant execute on function public.current_admin_role() to authenticated;
grant execute on function public.has_admin_capability(text) to authenticated;

-- ----------------------------------------------------------------------------
-- PRESENCE: heartbeat RPC
-- Called by the client on app focus / a periodic interval while signed in.
-- "Active" vs "offline" is then derived in the app layer as
-- now() - last_seen_at < some threshold (e.g. 2 minutes), so no extra
-- column is needed for the boolean itself.
-- ----------------------------------------------------------------------------

create or replace function public.touch_presence()
returns void
language sql
security definer set search_path = public
as $$
  update public.profiles set last_seen_at = now() where id = auth.uid();
$$;

grant execute on function public.touch_presence() to authenticated;

-- ----------------------------------------------------------------------------
-- ADMIN APPROVAL RPCs (super admin only)
-- ----------------------------------------------------------------------------

-- Approve or reject a pending admin account. Only a super admin may call
-- this. Rejecting does not delete the auth user — it just blocks them from
-- the admin area; a super admin can still see and delete the row from the
-- Approvals page if they want the account gone entirely.
create or replace function public.review_admin_request(p_user_id uuid, p_decision public.admin_status)
returns void
language plpgsql
security definer set search_path = public
as $$
begin
  if not public.is_super_admin() then
    raise exception 'Only a super admin can review admin requests.';
  end if;

  if p_decision not in ('approved', 'rejected') then
    raise exception 'Decision must be approved or rejected.';
  end if;

  update public.profiles
  set admin_status = p_decision
  where id = p_user_id and role = 'admin';
end;
$$;

grant execute on function public.review_admin_request(uuid, public.admin_status) to authenticated;

-- Promote an existing player to an admin sub-role directly (the "add users
-- to his portal" capability), or change an existing admin's sub-role.
-- Super admin only. New admins added this way are auto-approved since the
-- super admin is vouching for them directly.
create or replace function public.admin_set_role(
  p_user_id uuid,
  p_role public.user_role,
  p_admin_role public.admin_role default null
)
returns void
language plpgsql
security definer set search_path = public
as $$
begin
  if not public.is_super_admin() then
    raise exception 'Only a super admin can change user roles.';
  end if;

  if p_role = 'admin' and p_admin_role is null then
    raise exception 'admin_role is required when assigning the admin role.';
  end if;

  update public.profiles
  set
    role = p_role,
    admin_role = case when p_role = 'admin' then p_admin_role else null end,
    admin_status = case when p_role = 'admin' then 'approved' else null end
  where id = p_user_id;
end;
$$;

grant execute on function public.admin_set_role(uuid, public.user_role, public.admin_role) to authenticated;

-- Removes a user from the platform ("can add and delete users from his
-- portal"). This deletes the public.profiles row (and, via cascade, their
-- wallet, security question, match_players seats, support messages, and
-- nulls out match host/winner refs is not applicable since matches.host_id
-- has no cascade — those are left as a historical record with a dangling
-- host reference is avoided by blocking deletion of users who have hosted
-- matches; remove them as a precaution rather than silently failing).
--
-- IMPORTANT: this removes the public profile/data row only. It does not
-- and cannot delete the underlying auth.users row from a client-callable
-- SQL function — that requires the Supabase service role (e.g. an Edge
-- Function calling supabase.auth.admin.deleteUser). Document this clearly
-- in the app so a fully deleted login is a deliberate follow-up step.
create or replace function public.admin_delete_user(p_user_id uuid)
returns void
language plpgsql
security definer set search_path = public
as $$
begin
  if not public.is_super_admin() then
    raise exception 'Only a super admin can delete users.';
  end if;

  if p_user_id = auth.uid() then
    raise exception 'You cannot delete your own account from this panel.';
  end if;

  if exists (select 1 from public.matches where host_id = p_user_id) then
    raise exception 'This user has hosted matches and cannot be removed from the application data. Suspend the account instead.';
  end if;

  delete from public.profiles where id = p_user_id;
end;
$$;

grant execute on function public.admin_delete_user(uuid) to authenticated;

-- ----------------------------------------------------------------------------
-- SUPPORT MESSAGES
-- Chat thread between a player and the support team. One thread per
-- player; any approved support/super_admin user can reply into it.
-- ----------------------------------------------------------------------------

create table public.support_messages (
  id uuid primary key default gen_random_uuid(),
  player_id uuid not null references public.profiles (id) on delete cascade,
  sender public.support_message_sender not null,
  sender_id uuid not null references public.profiles (id),
  body text not null check (char_length(trim(body)) > 0),
  created_at timestamptz not null default now()
);

comment on table public.support_messages is
  'Chat thread between a player and the support team. player_id identifies the thread; sender/sender_id identify who wrote a given message.';

create index support_messages_player_id_idx on public.support_messages (player_id, created_at);

alter table public.support_messages enable row level security;

create policy "Players can view their own support thread"
  on public.support_messages for select
  using (auth.uid() = player_id);

create policy "Players can message support"
  on public.support_messages for insert
  with check (auth.uid() = player_id and sender = 'player' and sender_id = auth.uid());

create policy "Support and super admins can view all support threads"
  on public.support_messages for select
  using (public.has_admin_capability('player_chat'));

create policy "Support and super admins can reply in any thread"
  on public.support_messages for insert
  with check (
    public.has_admin_capability('player_chat')
    and sender = 'admin'
    and sender_id = auth.uid()
  );

-- ----------------------------------------------------------------------------
-- ROW LEVEL SECURITY: replace the broad is_admin() policies from 0001 with
-- capability-scoped ones. We drop and recreate so the policy set exactly
-- matches the matrix in the brief, rather than layering on top of the old
-- one-admin-does-everything policies.
-- ----------------------------------------------------------------------------

-- PROFILES -------------------------------------------------------------

drop policy if exists "Admins can update any profile" on public.profiles;

create policy "Super admins can update any profile"
  on public.profiles for update
  using (public.is_super_admin());

create policy "Approved admins can view presence fields via base select"
  on public.profiles for select
  using (true); -- unchanged from 0001 ("viewable by everyone"); presence
                -- and stats reads go through this same broad select policy,
                -- consistent with profiles already being public.

create policy "Super admins can delete profiles"
  on public.profiles for delete
  using (public.is_super_admin());

-- WALLETS ----------------------------------------------------------------

drop policy if exists "Users can view their own wallet" on public.wallets;

create policy "Users can view their own wallet"
  on public.wallets for select
  using (
    auth.uid() = user_id
    or public.has_admin_capability('financial_records')
  );

-- TRANSACTIONS -------------------------------------------------------------

drop policy if exists "Users can view their own transactions" on public.transactions;

create policy "Users can view their own transactions"
  on public.transactions for select
  using (
    auth.uid() = user_id
    or public.has_admin_capability('financial_records')
  );

-- MATCHES / GAMES: super admin keeps the original admin powers; other admin
-- sub-roles do not manage games or matches per the brief, so the original
-- is_admin()-based policies on games/matches are intentionally narrowed to
-- super admin only.

drop policy if exists "Admins can manage games" on public.games;

create policy "Super admins can manage games"
  on public.games for all
  using (public.is_super_admin());

drop policy if exists "Host or admin can update a match" on public.matches;

create policy "Host or super admin can update a match"
  on public.matches for update
  using (auth.uid() = host_id or public.is_super_admin());

-- ----------------------------------------------------------------------------
-- BOOTSTRAP NOTE (manual, one-time, run by a project operator — not part of
-- the application code path):
--
-- The very first super admin can't approve themselves through the app
-- (nothing has approved them yet). After they sign up through the normal
-- admin signup flow, run this once from the Supabase SQL editor using your
-- own values:
--
--   update public.profiles
--   set admin_status = 'approved'
--   where id = '<their-auth-user-id>' and admin_role = 'super_admin';
-- ----------------------------------------------------------------------------
