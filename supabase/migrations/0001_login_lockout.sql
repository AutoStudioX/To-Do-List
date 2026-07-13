-- Brute-force login protection — variant A+ (server action, Free-plan compatible).
--
-- Lockout runs inside a Next.js server action (app/login/actions.ts) that reads the
-- request IP server-side and calls these SECURITY DEFINER RPCs around
-- signInWithPassword. The email-lock check runs BEFORE the sign-in, so a locked
-- account is rejected even with the correct password.
--
-- Two layers:
--   • EMAIL lock  — 5 wrong passwords for an account → 15 min lock (auto-expires);
--                    a correct login resets the counter.
--   • IP block    — 10 wrong attempts from one IP → PERMANENT block until cleared
--                    manually (see section 6 for the SQL).
--
-- ⚠️ Not unbypassable: the anon key is public, so an attacker calling GoTrue
-- directly skips this. Backstop = Supabase per-IP rate limit (30/5min). The
-- unbypassable version needs the paid Password Verification hook (Team/Enterprise).
--
-- Run this whole file once in the Supabase SQL Editor, then seed yourself as admin
-- (section 5). See CLAUDE.md → "Brute-force login protection".

-- ============================================================================
-- 1. State tables — written ONLY via the SECURITY DEFINER functions below.
-- ============================================================================
create table if not exists public.login_lockout (
  user_id         uuid primary key references auth.users(id) on delete cascade,
  failed_attempts int not null default 0,
  locked_until    timestamptz,
  updated_at      timestamptz not null default now()
);
alter table public.login_lockout enable row level security;
revoke all on table public.login_lockout from anon, authenticated, public;

create table if not exists public.ip_login_block (
  ip              text primary key,
  failed_attempts int not null default 0,
  blocked         boolean not null default false,
  updated_at      timestamptz not null default now()
);
alter table public.ip_login_block enable row level security;
revoke all on table public.ip_login_block from anon, authenticated, public;

-- Remove earlier artifacts / old single-arg signatures so this file is re-runnable.
drop function if exists public.hook_password_verification_attempt(jsonb);
drop policy   if exists "auth admin manages lockout" on public.login_lockout;
drop function if exists public.record_failed_login(text);
drop function if exists public.reset_login_attempts(text);

-- ============================================================================
-- 2. Login-flow RPCs (SECURITY DEFINER → bypass RLS; callable by anon since login
--    is pre-auth). 5 email fails → 15 min; 10 IP fails → permanent block.
-- ============================================================================
create or replace function public.check_ip_block(p_ip text)
returns boolean language sql security definer set search_path = '' stable as $$
  select coalesce((select blocked from public.ip_login_block where ip = p_ip), false);
$$;
grant execute on function public.check_ip_block(text) to anon, authenticated;

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

create or replace function public.record_failed_login(p_email text, p_ip text)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  uid uuid; rec public.login_lockout; iprec public.ip_login_block;
  max_email    constant int := 5;
  lock_minutes constant int := 15;
  max_ip       constant int := 10;
  email_locked boolean := false; minutes_left int := 0; attempts_left int := 0; ip_blocked boolean := false;
begin
  -- IP layer — tracked for every failed attempt, even for unknown emails.
  if p_ip is not null and p_ip <> 'unknown' then
    insert into public.ip_login_block as b (ip, failed_attempts, updated_at)
      values (p_ip, 1, now())
    on conflict (ip) do update set failed_attempts = b.failed_attempts + 1, updated_at = now()
    returning * into iprec;
    if iprec.failed_attempts >= max_ip and not iprec.blocked then
      update public.ip_login_block set blocked = true, updated_at = now() where ip = p_ip returning * into iprec;
    end if;
    ip_blocked := iprec.blocked;
  end if;

  -- Email layer.
  select id into uid from auth.users where lower(email) = lower(trim(p_email)) limit 1;
  if uid is not null then
    select * into rec from public.login_lockout where user_id = uid;
    if rec.locked_until is not null and rec.locked_until > now() then
      email_locked := true;
      minutes_left := ceil(extract(epoch from (rec.locked_until - now())) / 60)::int;
    else
      insert into public.login_lockout as l (user_id, failed_attempts, updated_at)
        values (uid, 1, now())
      on conflict (user_id) do update
        set failed_attempts = case
              when l.locked_until is not null and l.locked_until <= now() then 1
              else l.failed_attempts + 1 end,
            locked_until = null, updated_at = now()
      returning * into rec;
      if rec.failed_attempts >= max_email then
        update public.login_lockout
          set locked_until = now() + make_interval(mins => lock_minutes), updated_at = now()
          where user_id = uid;
        email_locked := true; minutes_left := lock_minutes;
      else
        attempts_left := max_email - rec.failed_attempts;
      end if;
    end if;
  end if;

  return jsonb_build_object('email_locked', email_locked, 'minutes_left', minutes_left,
                            'attempts_left', attempts_left, 'ip_blocked', ip_blocked);
end; $$;
grant execute on function public.record_failed_login(text, text) to anon, authenticated;

create or replace function public.reset_login_attempts(p_email text, p_ip text)
returns void language plpgsql security definer set search_path = '' as $$
declare uid uuid;
begin
  select id into uid from auth.users where lower(email) = lower(trim(p_email)) limit 1;
  if uid is not null then
    update public.login_lockout set failed_attempts = 0, locked_until = null, updated_at = now() where user_id = uid;
  end if;
  -- Reset the IP's fail counter on success, but never lift a permanent block here.
  if p_ip is not null and p_ip <> 'unknown' then
    update public.ip_login_block set failed_attempts = 0, updated_at = now() where ip = p_ip and blocked = false;
  end if;
end; $$;
grant execute on function public.reset_login_attempts(text, text) to anon, authenticated;

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
--    Used by /admin to early-unlock EMAIL locks. IP blocks are cleared via SQL (§6).
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
    from public.login_lockout l join auth.users u on u.id = l.user_id
    where l.locked_until is not null and l.locked_until > now()
    order by l.locked_until desc;
end; $$;
grant execute on function public.admin_list_locked_accounts() to authenticated;

create or replace function public.admin_unlock_account(target uuid)
returns void language plpgsql security definer set search_path = '' as $$
begin
  if not public.is_admin() then raise exception 'not authorized'; end if;
  update public.login_lockout set failed_attempts = 0, locked_until = null, updated_at = now() where user_id = target;
end; $$;
grant execute on function public.admin_unlock_account(uuid) to authenticated;

-- ============================================================================
-- 5. Seed yourself as admin (replace the email; the account must exist already).
-- ============================================================================
-- insert into public.app_admins (user_id)
--   select id from auth.users where lower(email) = lower('owner@example.com')
--   on conflict do nothing;

-- ============================================================================
-- 6. Clear a permanent IP block (there is intentionally no UI for this):
-- ============================================================================
--   delete from public.ip_login_block where ip = '203.0.113.7';
--   -- or clear all IP blocks:
--   -- delete from public.ip_login_block;
