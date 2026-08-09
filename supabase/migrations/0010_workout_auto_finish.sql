-- Automatické ukončení zapomenutého tréninku.
--
-- PROBLÉM: trénink se ukončuje ručně. Když se na to zapomene, duration_min
-- zůstane NULL, hodiny běží dál a při dalším otevření se uloží 500 minut.
--
-- PROČ V DATABÁZI A NE ČASOVAČEM V PROHLÍŽEČI:
-- appka je zavřená přesně v tu chvíli, kdy by časovač měl spustit. Kontrola
-- proto běží při načtení stránky jako jedno RPC volání, které projde VŠECHNY
-- běžící tréninky uživatele naráz — i ty, které nikdo neotevřel.
--
-- DVA NOVÉ SLOUPCE:
--   auto_finished — trénink neukončil uživatel; délka je dopočítaná, ne měřená.
--                   Zobrazuje se v historii, aby bylo poznat, že číslo je odhad.
--   resumed_at    — okamžik posledního „Pokračovat v tréninku".
--                   Bez něj by platilo: auto-ukončeno na 52 min → uživatel dá
--                   Pokračovat (started_at se posune zpět o 52 min) → nic
--                   nezapíše → další kontrola vidí jen staré série, spočítá
--                   zápornou délku a 52 minut zahodí. Návrat do tréninku je
--                   taky aktivita, takže se počítá jako poslední aktivita.

alter table public.workouts
  add column if not exists auto_finished boolean not null default false,
  add column if not exists resumed_at    timestamptz;

-- Poslední aktivita = poslední potvrzená série, jinak návrat do tréninku,
-- jinak start. Série vzniká jako řádek až potvrzením, takže created_at série
-- JE okamžik potvrzení.
--
-- Délka se počítá od started_at do POSLEDNÍ AKTIVITY, ne do teď — čas strávený
-- doma na gauči s otevřeným tréninkem do tréninku nepatří.
--
-- SECURITY INVOKER (výchozí): funkce běží pod právy volajícího, takže RLS
-- politika „own workouts" ji drží na vlastních řádcích. SECURITY DEFINER tu
-- není potřeba a znamenal by zbytečnou díru.
-- ZAČÁTEK TRÉNINKU se nesmí brát ze started_at naslepo. Reálný případ z dat
-- (Legs 1. 8. 2026): started_at = 08:13, ale created_at = 07:10 a 14 z 26 sérií
-- je PŘED started_at. Počítáno od started_at vyšlo 67 min místo reálných 130 —
-- první hodina tréninku prostě vypadla.
--
-- Po legitimním „Pokračovat" je posun started_at správný (schválně vyřazuje čas
-- strávený mimo posilovnu) a série před ním jsou v pořádku. Rozlišuje se to
-- podle resumed_at:
--   resumed_at vyplněné → started_at je posunutý záměrně, věř mu
--   resumed_at prázdné  → started_at nemá co být za první sérií; vezmi nejstarší
--                         ze started_at / created_at / první série
create or replace function public.workout_origin(w public.workouts)
returns timestamptz
language sql
stable
set search_path = public
as $$
  select case
    when w.resumed_at is not null then w.started_at
    else least(
      w.started_at,
      w.created_at,
      coalesce((select min(s.created_at) from public.workout_sets s where s.workout_id = w.id), w.started_at)
    )
  end;
$$;

-- REZERVA NA KONCI: po poslední potvrzené sérii ještě něco trvá — dokončení
-- série, odpočinek, sbalení. Deset minut není odhad od stolu: trénink Pull
-- 4. 8. 2026 je čistý vzorek (ukončený ručně, bez resume, origin sedí) a mezi
-- poslední sérií a uloženým koncem je 9,8 minuty. Varianta „průměrná pauza mezi
-- sériemi" vyšla 4,6–5,0 min, tedy zhruba polovina skutečnosti.
--
-- Jedna funkce, aby 0010 i 0011 braly stejné číslo. Změna na jednom místě.
create or replace function public.workout_tail()
returns interval
language sql
immutable
as $$ select interval '10 minutes' $$;

-- Poslední aktivita: poslední série, jinak návrat do tréninku, jinak start.
create or replace function public.workout_last_activity(w public.workouts)
returns timestamptz
language sql
stable
set search_path = public
as $$
  select greatest(
    coalesce((select max(s.created_at) from public.workout_sets s where s.workout_id = w.id), w.started_at),
    coalesce(w.resumed_at, w.started_at)
  );
$$;

-- JAK DLOUHÝ TEN TRÉNINK BYL — jediná definice v celé appce.
-- Volá ji automatické ukončení (0010), zpětný přepočet (0011) i dry run
-- (queries/audit_long_workouts.sql), takže dry run nemůže ukázat jiné číslo,
-- než jaké migrace opravdu zapíše.
create or replace function public.workout_duration_estimate(w public.workouts)
returns int
language sql
stable
set search_path = public
as $$
  select greatest(1, round(extract(epoch from (
    public.workout_last_activity(w) - public.workout_origin(w)
    -- Rezerva patří jen za POSLEDNÍ SÉRII. Když je poslední aktivitou návrat do
    -- tréninku (Pokračovat a pak už nic) nebo trénink nemá jedinou sérii, není
    -- co dobalovat.
    + case
        when public.workout_last_activity(w)
             = (select max(s.created_at) from public.workout_sets s where s.workout_id = w.id)
        then public.workout_tail() else interval '0'
      end
  )) / 60))::int;
$$;

create or replace function public.auto_finish_stale_workouts(idle_minutes int default 45)
returns table (workout_id uuid, minutes int)
language sql
volatile
set search_path = public
as $$
  update public.workouts w
     set duration_min  = public.workout_duration_estimate(w.*),
         auto_finished = true
   where w.duration_min is null        -- jen běžící
     and w.started_at is not null
     and public.workout_last_activity(w.*) < now() - make_interval(mins => idle_minutes)
  returning w.id, w.duration_min;
$$;

grant execute on function public.workout_origin(public.workouts) to authenticated;
grant execute on function public.workout_tail() to authenticated;
grant execute on function public.workout_last_activity(public.workouts) to authenticated;
grant execute on function public.workout_duration_estimate(public.workouts) to authenticated;
grant execute on function public.auto_finish_stale_workouts(int) to authenticated;
