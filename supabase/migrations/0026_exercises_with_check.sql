-- Audit, nález 5 — OPRAVA NÁLEZU, NE DÍRY: díra tam nebyla.
--
-- Auditní zpráva tvrdila, že UPDATE politika na `exercises` bez `with check`
-- dovolí přepsat vlastní cvik na `user_id = NULL` (a poslat ho tím do sdíleného
-- katalogu, který čte i nepřihlášený klient) nebo na cizí `user_id`.
--
-- Není to pravda. Postgres u UPDATE bez `with check` použije jako kontrolu
-- nového řádku samotný výraz z `using`. Ověřeno proti skutečnému Postgresu
-- na PŮVODNÍ politice:
--   • přejmenování vlastního cviku  → UPDATE 1
--   • `set user_id = null`          → ERROR: new row violates row-level
--                                     security policy for table "exercises"
--
-- Proč se to i tak zapisuje explicitně: `using` a `with check` odpovídají na
-- dvě různé otázky (které řádky smím měnit vs. jak smí vypadat po změně) a
-- dnes se kryjí jen náhodou. Až se `using` jednou rozšíří (třeba na správu
-- sdíleného katalogu), implicitní kontrola se rozšíří s ním a díra by vznikla
-- potichu. Napsané zvlášť se to nestane. Chování se touhle migrací NEMĚNÍ.

drop policy if exists "update own exercises" on public.exercises;
create policy "update own exercises" on public.exercises for update
  using      (user_id = auth.uid())
  with check (user_id = auth.uid());
