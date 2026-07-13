-- Brute-force login protection via the GoTrue "Password Verification Attempt" hook.
-- Enforced server-side inside GoTrue, so it cannot be bypassed by calling the
-- auth API directly. Run this whole file once in the Supabase SQL Editor, then
-- register the hook in the dashboard (see CLAUDE.md → "Brute-force login protection").

-- ============================================================================
-- 1. Lockout state table — written ONLY by the hook (as supabase_auth_admin)
--    and by the SECURITY DEFINER admin functions below. No direct app access.
-- ============================================================================
create table if not exists public.login_lockout (
  user_id         uuid primary key references auth.users(id) on delete cascade,
  failed_attempts int not null default 0,
  locked_until    timestamptz,
  updated_at      timestamptz not null default now()
);

alter table public.login_lockout enable row level security;

-- Lock it down: revoke from every app-facing role; grant only to the GoTrue role.
revoke all on table public.login_lockout from anon, authenticated, public;
grant all  on table public.login_lockout to supabase_auth_admin;

-- The hook runs as supabase_auth_admin — let that role through RLS.
drop policy if exists "auth admin manages lockout" on public.login_lockout;
create policy "auth admin manages lockout"
  on public.login_lockout as permissive for all
  to supabase_auth_admin using (true) with check (true);

-- ============================================================================
-- 2. The hook. GoTrue calls it on every password verification with { user_id, valid }.
--    5 wrong passwords → lock 15 min (auto-expires). Correct password → reset.
-- ============================================================================
create or replace function public.hook_password_verification_attempt(event jsonb)
returns jsonb
language plpgsql
security invoker              -- runs as the caller (supabase_auth_admin)
set search_path = ''
as $$
declare
  uid          uuid    := (event->>'user_id')::uuid;
  is_valid     boolean := (event->>'valid')::boolean;
  rec          public.login_lockout;
  max_attempts constant int  := 5;
  lock_minutes constant int  := 15;
  locked_msg   constant text := 'Příliš mnoho pokusů, zkuste to za 15 minut';
begin
  select * into rec from public.login_lockout where user_id = uid;

  -- Already locked and not yet expired → reject regardless of what was typed.
  if rec.locked_until is not null and rec.locked_until > now() then
    return jsonb_build_object('error', jsonb_build_object('http_code', 429, 'message', locked_msg));
  end if;

  if is_valid then
    -- Correct password → reset the counter (req: success resets to 0).
    if rec.user_id is not null then
      update public.login_lockout
        set failed_attempts = 0, locked_until = null, updated_at = now()
        where user_id = uid;
    end if;
    return jsonb_build_object('decision', 'continue');
  end if;

  -- Wrong password → increment. An expired lock starts a fresh count at 1.
  insert into public.login_lockout as l (user_id, failed_attempts, updated_at)
    values (uid, 1, now())
  on conflict (user_id) do update
    set failed_attempts = case
          when l.locked_until is not null and l.locked_until <= now() then 1
          else l.failed_attempts + 1 end,
        updated_at = now()
  returning * into rec;

  if rec.failed_attempts >= max_attempts then
    update public.login_lockout
      set locked_until = now() + make_interval(mins => lock_minutes), updated_at = now()
      where user_id = uid;
    return jsonb_build_object('error', jsonb_build_object('http_code', 429, 'message', locked_msg));
  end if;

  -- Under the threshold → let GoTrue return its normal "invalid credentials".
  return jsonb_build_object('decision', 'continue');
end;
$$;

grant usage   on schema public to supabase_auth_admin;
grant execute on function public.hook_password_verification_attempt to supabase_auth_admin;
revoke execute on function public.hook_password_verification_attempt from anon, authenticated, public;

-- ============================================================================
-- 3. Admin allow-list + functions to view/clear lockouts from the app.
--    SECURITY DEFINER → they bypass RLS and can read auth.users; each one
--    checks the caller is an admin first.
-- ============================================================================
create table if not exists public.app_admins (
  user_id uuid primary key references auth.users(id) on delete cascade
);
alter table public.app_admins enable row level security;
revoke all on table public.app_admins from anon, authenticated, public;

create or replace function public.is_admin()
returns boolean language sql security definer set search_path = '' stable as $$
  select exists (select 1 from public.app_admins where user_id = auth.uid());
$$;
grant execute on function public.is_admin to authenticated;

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
end;
$$;
grant execute on function public.admin_list_locked_accounts to authenticated;

create or replace function public.admin_unlock_account(target uuid)
returns void language plpgsql security definer set search_path = '' as $$
begin
  if not public.is_admin() then raise exception 'not authorized'; end if;
  update public.login_lockout
    set failed_attempts = 0, locked_until = null, updated_at = now()
    where user_id = target;
end;
$$;
grant execute on function public.admin_unlock_account to authenticated;

-- ============================================================================
-- 4. Seed yourself as admin (replace the email), then re-run for any other admin.
-- ============================================================================
-- insert into public.app_admins (user_id)
--   select id from auth.users where email = 'owner@example.com'
--   on conflict do nothing;
