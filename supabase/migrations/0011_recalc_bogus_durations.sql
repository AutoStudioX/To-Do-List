-- Zpětný přepočet tréninků s nesmyslnou délkou (nad 3 hodiny).
--
-- ⚠️ NEJDŘÍV SI PUSŤ supabase/queries/audit_long_workouts.sql — je to dry run,
-- který ukáže přesně ta čísla, která tahle migrace zapíše (obojí volá stejnou
-- funkci `workout_duration_estimate`). Tahle migrace data přepisuje a zpět to
-- nejde.
--
-- Vyžaduje 0010 (sloupce + funkce).
--
-- PRAVIDLO je stejné jako u automatického ukončení: od začátku tréninku
-- (`workout_origin` — ne naslepo `started_at`) do POSLEDNÍ potvrzené série,
-- plus 10 min rezerva na dokončení. Tréninky bez jediné série spadnou na
-- 1 minutu (nula by v historii vypadala jako „chybí údaj").
--
-- Podmínka `novy < duration_min` je pojistka: přepočet má nafouknuté číslo
-- srazit dolů, nikdy ne zvednout. Když někdo opravdu cvičil 3,5 hodiny a série
-- má rozprostřené přes celou dobu, přepočet nic neudělá.
--
-- 3 hodiny jako hranice: reálný trénink v posilovně se do nich vejde
-- i s rozcvičkou. Nad tím jde skoro jistě o zapomenuté ukončení.

update public.workouts w
   set duration_min  = public.workout_duration_estimate(w.*),
       -- Číslo je dopočítané, ne naměřené — v historii to musí být vidět.
       auto_finished = true
 where w.duration_min > 180
   and w.started_at is not null
   and public.workout_duration_estimate(w.*) < w.duration_min;
