-- Let the login page decide, SERVER-SIDE on load, whether to disable the form —
-- even in a fresh/incognito window. We key that decision on the request IP:
--   • IP block (10 fails)         → form disabled for that IP.
--   • an active EMAIL lock whose   → form disabled for that IP too (so the same
--     last failed attempt came       machine sees the greyed form after 5 fails,
--     from this IP                    without needing to re-type the email).
-- record_failed_login now stamps login_lockout.last_ip so check_lock_state can find it.

alter table public.login_lockout add column if not exists last_ip text;

create or replace function public.record_failed_login(p_email text, p_ip text)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  uid uuid; rec public.login_lockout; iprec public.ip_login_block;
  max_email    constant int := 5;
  lock_minutes constant int := 15;
  max_ip       constant int := 10;
  email_locked boolean := false; minutes_left int := 0; attempts_left int := 0; ip_blocked boolean := false;
begin
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

  select id into uid from auth.users where lower(email) = lower(trim(p_email)) limit 1;
  if uid is not null then
    select * into rec from public.login_lockout where user_id = uid;
    if rec.locked_until is not null and rec.locked_until > now() then
      email_locked := true;
      minutes_left := ceil(extract(epoch from (rec.locked_until - now())) / 60)::int;
    else
      insert into public.login_lockout as l (user_id, failed_attempts, last_ip, updated_at)
        values (uid, 1, p_ip, now())
      on conflict (user_id) do update
        set failed_attempts = case
              when l.locked_until is not null and l.locked_until <= now() then 1
              else l.failed_attempts + 1 end,
            locked_until = null, last_ip = p_ip, updated_at = now()
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

-- Called by the login page on load with the request IP. Returns whether the form
-- should be disabled and why.
create or replace function public.check_lock_state(p_ip text)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare mins int;
begin
  if p_ip is null or p_ip = 'unknown' then
    return jsonb_build_object('locked', false, 'ip_blocked', false, 'minutes_left', 0);
  end if;

  if coalesce((select blocked from public.ip_login_block where ip = p_ip), false) then
    return jsonb_build_object('locked', true, 'ip_blocked', true, 'minutes_left', 0);
  end if;

  select ceil(extract(epoch from (locked_until - now())) / 60)::int into mins
  from public.login_lockout
  where last_ip = p_ip and locked_until is not null and locked_until > now()
  order by locked_until desc limit 1;

  if mins is not null then
    return jsonb_build_object('locked', true, 'ip_blocked', false, 'minutes_left', mins);
  end if;
  return jsonb_build_object('locked', false, 'ip_blocked', false, 'minutes_left', 0);
end; $$;
grant execute on function public.check_lock_state(text) to anon, authenticated;
