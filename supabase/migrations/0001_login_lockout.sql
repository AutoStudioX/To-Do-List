-- Brute-force login protection — variant A (works on the Supabase Free plan).
--
-- Lockout logic lives in SECURITY DEFINER RPCs that the login form calls around
-- signInWithPassword. NOT unbypassable: an attacker who calls the GoTrue auth API
-- directly (with the public anon key) skips these RPCs. The real backstop for that
-- is Supabase's built-in per-IP rate limit (sign_in_sign_ups = 30 / 5 min / IP,
-- Dashboard → Authentication → Rate Limits). For this app that combination is
-- adequate. The unbypassable version needs the paid Password Verification hook
-- (Team/Enterprise plan only).
--
-- Run this whole file once in the Supabase SQL Editor. Then seed yourself as admin
-- (section 5). See CLAUDE.md → "Brute-force login protection".

-- ============================================================================
-- 1. Lockout state table — keyed by user_id, written ONLY via the functions below.
-- ============================================================================
create table if not exists public.login_lockout (
  user_id         uuid primary key references auth.users(id) on delete cascade,
  failed_attempts int not null default 0,
  locked_until    timestamptz,
  updated_at      timestamptz not null default now()
);

alter table public.login_lockout enable row level security;
revoke all on table public.login_lockout from anon, authenticated, public;

-- Clean up artifacts from the earlier (paid-hook) attempt, if present.
drop function if exists public.hook_password_verification_attempt(jsonb);
drop policy   if exists "auth admin manages lockout" on public.login_lockout;

-- ============================================================================
-- 2. Login-flow RPCs (SECURITY DEFINER → bypass RLS; callable by anon since login
--    is pre-auth). All normalise the email and resolve it to a user. 5 fails → 15 min.
-- ============================================================================
create or replace function public.check_login_lockout(p_email text)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare uid uuid; rec public.login_lockout;
begin
  select id into uid from auth.users where lower(email) = lower(trim(p_email)) limit 1;
  if uid is null then return jsonb_build_object('locked', false, 'minutes_left', 0); end if;
  select * into rec from public.login_lockout where user_id = uid;
  if rec.locked_until is not null and rec.locked_until > now() then
    return jsonb_build_object('locked', true,
      'minutes_left', ceil(extract(epoch from (rec.locked_until - now())) / 60)::int);
  end if;
  return jsonb_build_object('locked', false, 'minutes_left', 0);
end; $$;
grant execute on function public.check_login_lockout(text) to anon, authenticated;

create or replace function public.record_failed_login(p_email text)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  uid uuid; rec public.login_lockout;
  max_attempts constant int := 5;
  lock_minutes constant int := 15;
begin
  select id into uid from auth.users where lower(email) = lower(trim(p_email)) limit 1;
  if uid is null then return jsonb_build_object('locked', false, 'minutes_left', 0); end if;

  select * into rec from public.login_lockout where user_id = uid;
  if rec.locked_until is not null and rec.locked_until > now() then
    return jsonb_build_object('locked', true,
      'minutes_left', ceil(extract(epoch from (rec.locked_until - now())) / 60)::int);
  end if;

  insert into public.login_lockout as l (user_id, failed_attempts, updated_at)
    values (uid, 1, now())
  on conflict (user_id) do update
    set failed_attempts = case
          when l.locked_until is not null and l.locked_until <= now() then 1
          else l.failed_attempts + 1 end,
        locked_until = null, updated_at = now()
  returning * into rec;

  if rec.failed_attempts >= max_attempts then
    update public.login_lockout
      set locked_until = now() + make_interval(mins => lock_minutes), updated_at = now()
      where user_id = uid;
    return jsonb_build_object('locked', true, 'minutes_left', lock_minutes);
  end if;
  return jsonb_build_object('locked', false, 'minutes_left', 0);
end; $$;
grant execute on function public.record_failed_login(text) to anon, authenticated;

create or replace function public.reset_login_attempts(p_email text)
returns void language plpgsql security definer set search_path = '' as $$
declare uid uuid;
begin
  select id into uid from auth.users where lower(email) = lower(trim(p_email)) limit 1;
  if uid is null then return; end if;
  update public.login_lockout
    set failed_attempts = 0, locked_until = null, updated_at = now()
    where user_id = uid;
end; $$;
grant execute on function public.reset_login_attempts(text) to anon, authenticated;

-- ============================================================================
-- 3. Admin allow-list.
-- ============================================================================
create table if not exists public.app_admins (
  user_id uuid primary key references auth.users(id) on delete cascade
);
alter table public.app_admins enable row level security;
revoke all on table public.app_admins from anon, authenticated, public;

-- ============================================================================
-- 4. Admin functions (SECURITY DEFINER; each checks the caller is an admin).
-- ============================================================================
create or replace function public.is_admin()
returns boolean language sql security definer set search_path = '' stable as $$
  select exists (select 1 from public.app_admins where user_id = auth.uid());
$$;
grant execute on function public.is_admin() to authenticated;

create or replace function public.admin_list_locked_accounts()
returns table(user_id uuid, email text, failed_attempts int, locked_until timestamptz)
language plpgsql security definer set search_path = '' as $$
begin
  if not public.is_admin() then raise exception 'not authorized'; end if;
  return query
    select l.user_id, u.email::text, l.failed_attempts, l.locked_until
    from public.login_lockout l
    join auth.users u on u.id = l.user_id
    where l.locked_until is not null and l.locked_until > now()
    order by l.locked_until desc;
end; $$;
grant execute on function public.admin_list_locked_accounts() to authenticated;

create or replace function public.admin_unlock_account(target uuid)
returns void language plpgsql security definer set search_path = '' as $$
begin
  if not public.is_admin() then raise exception 'not authorized'; end if;
  update public.login_lockout
    set failed_attempts = 0, locked_until = null, updated_at = now()
    where user_id = target;
end; $$;
grant execute on function public.admin_unlock_account(uuid) to authenticated;

-- ============================================================================
-- 5. Seed yourself as admin (replace the email; the account must exist already).
-- ============================================================================
-- insert into public.app_admins (user_id)
--   select id from auth.users where lower(email) = lower('owner@example.com')
--   on conflict do nothing;
