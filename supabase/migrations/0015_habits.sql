-- Návyky (habit tracker).
--
-- CO SE NEUKLÁDÁ: série, procenta, úrovně sytosti, úspěšnost, nejslabší návyk
-- ani hodnoty grafů. Všechno je odvozené z `habit_entries` a počítá se za běhu
-- podle pravidel v README (sekce State Management). Uložená derivace by se
-- rozešla s daty při první ruční opravě záznamu.
--
-- `klic` je stabilní identifikátor výchozích návyků. Jméno si uživatel může
-- přejmenovat, takže podle jména nejde ani znovu naplnit výchozí sadu, ani
-- najít návyk „trénink". U vlastních návyků zůstává NULL.
--
-- `zdroj` říká, odkud hodnota pochází:
--   'rucne'   — uživatel odškrtává sám
--   'trenink' — dopočítá se z tabulky `workouts`; do `habit_entries` se pro něj
--               NIC nezapisuje. Jediná pravda je trénink sám, žádná
--               synchronizace ani trigger, které by se mohly rozejít.

create table if not exists public.habits (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null references auth.users(id) on delete cascade,
  klic        text,
  nazev       text not null,
  podtitul    text,
  typ         text not null check (typ in ('bool', 'cil')),
  cil         numeric,
  jednotka    text,
  krok        numeric,
  ikona       text not null default 'circle',
  poradi      int  not null default 0,
  zdroj       text not null default 'rucne' check (zdroj in ('rucne', 'trenink')),
  archivovany boolean not null default false,
  created_at  timestamptz not null default now(),

  -- Návyk s cílem bez cíle nebo bez kroku by se nedal ani vyhodnotit,
  -- ani inkrementovat tlačítkem „+250 ml".
  constraint habits_cil_kompletni check (
    typ = 'bool' or (cil is not null and cil > 0 and krok is not null and krok > 0)
  )
);

-- Klíč je unikátní v rámci uživatele — drží idempotenci výchozí sady.
create unique index if not exists habits_user_klic_idx
  on public.habits (user_id, klic) where klic is not null;

create index if not exists habits_user_poradi_idx
  on public.habits (user_id, poradi) where archivovany = false;

-- Jeden záznam na návyk a den. `hodnota` je 0/1 u ano/ne, absolutní číslo u cíle
-- (voda 1250 ml). Bez horního limitu — README: „+250 ml přičte krok bez limitu".
create table if not exists public.habit_entries (
  id        uuid primary key default gen_random_uuid(),
  user_id   uuid not null references auth.users(id) on delete cascade,
  habit_id  uuid not null references public.habits(id) on delete cascade,
  datum     date not null,
  hodnota   numeric not null default 0 check (hodnota >= 0),
  unique (habit_id, datum)
);

-- Přehled i detail čtou okna 7 / 30 / 365 dní.
create index if not exists habit_entries_user_datum_idx
  on public.habit_entries (user_id, datum desc);

alter table public.habits        enable row level security;
alter table public.habit_entries enable row level security;

drop policy if exists "own habits" on public.habits;
create policy "own habits" on public.habits for all
  using (user_id = auth.uid()) with check (user_id = auth.uid());

drop policy if exists "own habit entries" on public.habit_entries;
create policy "own habit entries" on public.habit_entries for all
  using (user_id = auth.uid()) with check (user_id = auth.uid());

-- ============================ Výchozí sada ============================
-- Podle designu, včetně podtitulů z prototypu. Založí se každému stávajícímu
-- uživateli, který daný klíč ještě nemá — migrace jde pustit víckrát.
-- Ikony jsou názvy lucide komponent.
insert into public.habits (user_id, klic, nazev, podtitul, typ, cil, jednotka, krok, ikona, poradi, zdroj)
select u.id, v.klic, v.nazev, v.podtitul, v.typ, v.cil, v.jednotka, v.krok, v.ikona, v.poradi, v.zdroj
from auth.users u
cross join (values
  ('hygiena', 'Hygiena',                  'Ráno i večer',                  'bool', null::numeric, null::text, null::numeric, 'droplets',   0, 'rucne'),
  ('obed',    'Oběd',                     'Teplé jídlo do 14:00',          'bool', null,          null,       null,          'utensils',   1, 'rucne'),
  ('anime',   'Žádné anime před prací',   'Do prvního hotového úkolu',     'bool', null,          null,       null,          'monitor-off', 2, 'rucne'),
  ('voda',    'Voda',                     '2 litry denně',                 'cil',  2000,          'ml',       250,           'glass-water', 3, 'rucne'),
  ('focus',   'Focus práce',              '3 hodiny bez rozptýlení',       'cil',  180,           'min',      30,            'timer',      4, 'rucne'),
  ('trenink', 'Trénink',                  'Doplní se sám z tréninků',      'bool', null,          null,       null,          'dumbbell',   5, 'trenink')
) as v(klic, nazev, podtitul, typ, cil, jednotka, krok, ikona, poradi, zdroj)
where not exists (
  select 1 from public.habits h where h.user_id = u.id and h.klic = v.klic
);
