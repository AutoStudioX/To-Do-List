-- Příznak „do selhání" u série.
--
-- Zatím je to JEN ZÁZNAM — nevstupuje do statistik, do objemu ani do PR
-- odznaků. Až se nasbírají data, rozhodne se, co s ním. Proto boolean na sérii
-- a nic dalšího: žádné indexy, žádné přepočty.

alter table public.workout_sets
  add column if not exists to_failure boolean not null default false;
