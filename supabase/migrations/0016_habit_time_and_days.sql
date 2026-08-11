-- Návyky: čas a dny platnosti + nová výchozí sada.
--
-- `cas`  — nepovinný čas návyku (06:30). NULL = bez času.
-- `dny`  — pole 1–7, kde 1 = pondělí. NULL nebo prázdné pole = každý den.
--
-- Den, kdy návyk NEPLATÍ, se nesmí počítat jako nesplněný — jinak by úterní
-- návyk táhl statistiku dolů za všechny ostatní dny v týdnu. Statistiky proto
-- procházejí jen platné dny (viz `dayStats` / `successRateOn` v lib/habits.ts).

alter table public.habits
  add column if not exists cas time,
  add column if not exists dny int[];

-- Hodnoty musí dávat smysl jako dny v týdnu. Duplicity se nehlídají: check
-- constraint nesmí obsahovat poddotaz a `dny = [2,2,4]` stejně nic nerozbije —
-- `appliesOn()` se ptá jen na přítomnost dne.
alter table public.habits drop constraint if exists habits_dny_rozsah;
alter table public.habits add constraint habits_dny_rozsah check (
  dny is null or dny <@ array[1,2,3,4,5,6,7]
);

-- Řazení hlavní stránky: čas nahoru, zbytek podle ručního pořadí.
create index if not exists habits_user_cas_idx
  on public.habits (user_id, cas nulls last, poradi) where archivovany = false;

-- ============================ Nová výchozí sada ============================
-- ⚠️ SMAŽE STÁVAJÍCÍ NÁVYKY a s nimi kaskádou i jejich záznamy v
-- `habit_entries`. Schválně jen pro jeden účet — ostatní uživatelé si nechají
-- to svoje. Chceš-li to pustit na všechny, smaž podmínku `where user_id = …`
-- v obou příkazech níže.
--
-- Návyk „trénink" má `zdroj = 'trenink'`: hodnota se čte z tabulky `workouts`,
-- do `habit_entries` se pro něj nikdy nic nezapisuje.

delete from public.habits
where user_id = (select id from auth.users where lower(email) = lower('yevhenprodanec@gmail.com'));

insert into public.habits (user_id, klic, nazev, podtitul, typ, cil, jednotka, krok, ikona, poradi, zdroj, cas, dny)
select u.id, v.klic, v.nazev, v.podtitul, v.typ, v.cil, v.jednotka, v.krok, v.ikona, v.poradi, v.zdroj, v.cas::time, v.dny
from auth.users u
cross join (values
  -- každý den
  ('vstavani',   'Vstávání',           null,                  'bool', null::numeric, null::text, null::numeric, 'sunrise',     0, 'rucne',   '06:30', null::int[]),
  ('hygiena',    'Hygiena',            'Ráno i večer',        'bool', null,          null,       null,          'droplets',    1, 'rucne',   '07:00', null),
  ('snidane',    'Snídaně',            null,                  'bool', null,          null,       null,          'coffee',      2, 'rucne',   '07:30', null),
  ('obed',       'Oběd',               'Teplé jídlo',         'bool', null,          null,       null,          'utensils',    3, 'rucne',   '12:00', null),
  ('focus-odp',  'Focus odpoledne',    '3 hodiny v kuse',     'cil',  180,           'min',      30,            'timer',       4, 'rucne',   '13:00', null),
  ('voda',       'Voda',               '2 litry denně',       'cil',  2000,          'ml',       250,           'glass-water', 5, 'rucne',   null,    null),
  -- pondělí, středa, pátek, neděle
  ('focus-dop',  'Focus dopoledne',    '3 hodiny v kuse',     'cil',  180,           'min',      30,            'timer',       6, 'rucne',   '08:00', array[1,3,5,7]),
  -- úterý, čtvrtek, sobota
  ('trenink',    'Trénink',            'Doplní se sám z tréninků', 'bool', null,     null,       null,          'dumbbell',    7, 'trenink', '08:00', array[2,4,6]),
  ('sprcha',     'Sprcha po tréninku', null,                  'bool', null,          null,       null,          'shower-head', 8, 'rucne',   '10:00', array[2,4,6])
) as v(klic, nazev, podtitul, typ, cil, jednotka, krok, ikona, poradi, zdroj, cas, dny)
where lower(u.email) = lower('yevhenprodanec@gmail.com')
  and not exists (
    select 1 from public.habits h where h.user_id = u.id and h.klic = v.klic
  );
