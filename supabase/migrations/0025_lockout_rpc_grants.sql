-- Bezpečnostní audit, nález 1: přihlašovací RPC šly volat veřejným anon klíčem.
--
-- Anon klíč je v klientském bundlu, takže ho má každý. Funkce z migrace 0001/0003
-- měly `grant execute … to anon`, což znamenalo:
--   • `reset_login_attempts(email, ip)` vynuloval počítadlo pokusů komukoli a
--     kdykoli → útočník zkusil 4 hesla, zavolal reset a pokračoval donekonečna.
--     Zámek po 5 pokusech ani permanentní blok po 10 nikdy nenastal.
--   • `record_failed_login(email, ip)` bral IP jako parametr, takže pět volání
--     zamklo cizí účet a deset natrvalo zablokovalo libovolnou IP — včetně IP
--     majitele appky.
--
-- Nové rozdělení:
--   • kontrolní a zápisové funkce přihlašovacího toku smí volat JEN `service_role`
--     (server action je volá serverovým klíčem, ten se do prohlížeče nedostane),
--   • `reset_login_attempts` smí volat i přihlášený uživatel, ale účet si bere
--     z `auth.uid()`, ne z parametru — resetovat cizí počítadlo tedy nejde.
--
-- POZOR: v Postgresu má na nové funkce `EXECUTE` implicitně role PUBLIC, takže
-- samotné `revoke … from anon` nestačí; revokuje se i od `public`.

-- ============================================================================
-- 1. Přihlašovací tok — jen server (service_role)
-- ============================================================================
revoke execute on function public.check_ip_block(text)                from public, anon, authenticated;
revoke execute on function public.check_login_lockout(text)           from public, anon, authenticated;
revoke execute on function public.record_failed_login(text, text)     from public, anon, authenticated;
revoke execute on function public.check_lock_state(text)              from public, anon, authenticated;

grant execute on function public.check_ip_block(text)                 to service_role;
grant execute on function public.check_login_lockout(text)            to service_role;
grant execute on function public.record_failed_login(text, text)      to service_role;
grant execute on function public.check_lock_state(text)               to service_role;

-- ============================================================================
-- 2. Reset počítadel — bere uživatele z tokenu, ne z parametru
-- ============================================================================
-- `p_email` zůstává v signatuře kvůli kompatibilitě volání, ale POUŽÍVÁ SE JEN
-- tehdy, když funkci volá server (`auth.uid()` je NULL). Přihlášený uživatel
-- resetuje vždycky sám sebe, ať do parametru napíše cokoli.
create or replace function public.reset_login_attempts(p_email text, p_ip text)
returns void language plpgsql security definer set search_path = '' as $$
declare uid uuid;
begin
  uid := auth.uid();
  if uid is null then
    -- Serverové volání (service_role): účet se dohledá podle e-mailu.
    select id into uid from auth.users where lower(email) = lower(trim(p_email)) limit 1;
  end if;
  if uid is not null then
    update public.login_lockout
       set failed_attempts = 0, locked_until = null, updated_at = now()
     where user_id = uid;
  end if;
  -- Počítadlo IP se nuluje po úspěšném přihlášení; permanentní blok se tímhle
  -- nikdy nesundá (podmínka `blocked = false`), na to je SQL v migraci 0001 §6.
  if p_ip is not null and p_ip <> 'unknown' then
    update public.ip_login_block set failed_attempts = 0, updated_at = now()
     where ip = p_ip and blocked = false;
  end if;
end; $$;

revoke execute on function public.reset_login_attempts(text, text) from public, anon;
grant  execute on function public.reset_login_attempts(text, text) to authenticated, service_role;

-- ============================================================================
-- 3. Hygiena: admin funkce mají uvnitř kontrolu `is_admin()`, ale ani volat je
--    nemá smysl pouštět nepřihlášenému.
-- ============================================================================
revoke execute on function public.is_admin()                     from public, anon;
revoke execute on function public.admin_list_locked_accounts()   from public, anon;
revoke execute on function public.admin_unlock_account(uuid)     from public, anon;

grant execute on function public.is_admin()                      to authenticated;
grant execute on function public.admin_list_locked_accounts()    to authenticated;
grant execute on function public.admin_unlock_account(uuid)      to authenticated;
