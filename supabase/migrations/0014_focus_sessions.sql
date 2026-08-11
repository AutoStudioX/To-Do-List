-- Focus — časovač na soustředěnou práci s cílem.
--
-- PROČ TABULKA A NE LOCALSTORAGE: focus musí doběhnout, i když se appka zavře
-- nebo se telefon uspí. Zdrojem pravdy je `started_at` v databázi a zbývající
-- čas se dopočítává; odpočet v prohlížeči jen překresluje číslo.
--
-- Sloupce pro pauzu:
--   paused_at  — kdy se pauzlo (NULL = běží)
--   paused_sec — kolik sekund pauz se už nasbíralo
-- Bez nich by pauza přes noc focus „dopočítala" do konce.
--
-- ZATÍM ŽÁDNÉ STATISTIKY ANI HISTORIE — řádky se schválně nemažou (uzavřené
-- focusy prostě zmizí z obrazovky), aby bylo z čeho stavět, až na to přijde
-- řada. Žádné indexy na reporty se proto teď nezakládají.

create table if not exists public.focus_sessions (
  id           uuid primary key default gen_random_uuid(),
  user_id      uuid not null references auth.users(id) on delete cascade,
  cil          text not null,
  started_at   timestamptz not null default now(),
  duration_min int not null check (duration_min > 0 and duration_min <= 480),
  progress     int not null default 0 check (progress between 0 and 100),
  stav         text not null default 'running'
                 check (stav in ('running', 'paused', 'finished', 'done', 'cancelled')),
  paused_at    timestamptz,
  paused_sec   int not null default 0 check (paused_sec >= 0),
  ended_at     timestamptz,
  created_at   timestamptz not null default now()
);

-- Nejvýš JEDEN otevřený focus na uživatele. Dvojklik na „Spustit" tak nemůže
-- založit dva běžící a appka nemusí hádat, který je ten pravý.
create unique index if not exists focus_one_active_idx
  on public.focus_sessions (user_id)
  where stav in ('running', 'paused', 'finished');

-- Načítání otevřeného focusu při startu stránky.
create index if not exists focus_user_started_idx
  on public.focus_sessions (user_id, started_at desc);

alter table public.focus_sessions enable row level security;

drop policy if exists "own focus" on public.focus_sessions;
create policy "own focus" on public.focus_sessions for all
  using (user_id = auth.uid()) with check (user_id = auth.uid());
