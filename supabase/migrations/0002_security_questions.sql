-- ============================================================================
-- Migration: 0002_security_questions.sql
-- Project:   SkillForge Arena
-- Purpose:   Password recovery via security question + answer, set at signup.
-- ============================================================================

-- pgcrypto is already enabled in 0001_init.sql (provides gen_random_uuid()).
-- It also provides crypt()/gen_salt(), which we use to hash answers below —
-- security answers must NEVER be stored in plaintext, same as a password.
create extension if not exists "pgcrypto";

-- ----------------------------------------------------------------------------
-- SECURITY QUESTIONS
-- One row per user. question_text is free text so "Type your own question"
-- is supported alongside the preset options. answer_hash stores a bcrypt
-- hash (via crypt/gen_salt('bf')) of a normalized (trimmed, lowercased)
-- version of the answer — never the raw answer itself.
-- ----------------------------------------------------------------------------

create table public.security_questions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null unique references public.profiles (id) on delete cascade,
  question_text text not null,
  answer_hash text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

comment on table public.security_questions is
  'Stores one password-recovery security question + hashed answer per user. Answers are hashed with pgcrypto, never stored in plaintext.';

create trigger security_questions_set_updated_at
  before update on public.security_questions
  for each row execute procedure public.set_updated_at();

-- ----------------------------------------------------------------------------
-- ROW LEVEL SECURITY
-- ----------------------------------------------------------------------------

alter table public.security_questions enable row level security;

-- Users can see that a question exists (to display it during recovery) and
-- read/manage their own row, but answer_hash should never be selected
-- directly by the client in practice — verification happens through the
-- verify_security_answer() function below instead.
create policy "Users can view their own security question"
  on public.security_questions for select
  using (auth.uid() = user_id);

create policy "Users can insert their own security question"
  on public.security_questions for insert
  with check (auth.uid() = user_id);

create policy "Users can update their own security question"
  on public.security_questions for update
  using (auth.uid() = user_id);

-- ----------------------------------------------------------------------------
-- FUNCTIONS
-- ----------------------------------------------------------------------------

-- Hashes an answer for storage. Normalizes (trim + lowercase) before hashing
-- so "Nairobi", "nairobi ", and "NAIROBI" all match on verification.
create function public.hash_security_answer(answer text)
returns text
language sql
immutable
as $$
  select crypt(lower(trim(answer)), gen_salt('bf'));
$$;

-- Returns the question_text for a given username/email, so the recovery
-- flow can prompt the user with their question before they provide an
-- answer. Does not require auth (used pre-login), so it intentionally
-- leaks only the question text, never whether the account exists in a
-- way that's distinguishable from "no question set".
create function public.get_security_question(p_email text)
returns text
language plpgsql
security definer set search_path = public
stable
as $$
declare
  v_user_id uuid;
  v_question text;
begin
  select id into v_user_id from auth.users where email = p_email;
  if v_user_id is null then
    return null;
  end if;

  select question_text into v_question
  from public.security_questions
  where user_id = v_user_id;

  return v_question;
end;
$$;

-- Verifies a candidate answer against the stored hash for a given email.
-- Returns true/false only — never exposes the hash itself to the caller.
create function public.verify_security_answer(p_email text, p_answer text)
returns boolean
language plpgsql
security definer set search_path = public
stable
as $$
declare
  v_user_id uuid;
  v_hash text;
begin
  select id into v_user_id from auth.users where email = p_email;
  if v_user_id is null then
    return false;
  end if;

  select answer_hash into v_hash
  from public.security_questions
  where user_id = v_user_id;

  if v_hash is null then
    return false;
  end if;

  return v_hash = crypt(lower(trim(p_answer)), v_hash);
end;
$$;

-- Allow anonymous/public callers to invoke the two recovery RPCs above
-- (they're SECURITY DEFINER and only ever return a question string or a
-- boolean — no sensitive data is exposed). Direct table access to
-- security_questions remains restricted to the owning user via RLS.
grant execute on function public.get_security_question(text) to anon, authenticated;
grant execute on function public.verify_security_answer(text, text) to anon, authenticated;