-- DRY RUN — nic nemění. Vypíše tréninky s nesmyslnou délkou (nad 3 hodiny)
-- a jak by je přepočítala migrace 0011.
--
-- Vyžaduje 0010. Čísla ve sloupci `novy_min` počítá stejná funkce, kterou pak
-- použije 0011 (`workout_duration_estimate`), takže se nemůžou rozejít.
--
-- JEDEN dotaz schválně: Supabase SQL Editor ukazuje jen výsledek posledního
-- příkazu ve skriptu, takže souhrn je poslední ŘÁDEK téže tabulky, ne druhý
-- select.

with recalc as (
  select
    w.id,
    w.date,
    w.split_type,
    w.duration_min,
    public.workout_duration_estimate(w.*) as novy_min,
    (select count(*) from public.workout_sets s where s.workout_id = w.id) as serii,
    -- Kontrola: kolik sérií leží před started_at. Nenulové číslo bez resumed_at
    -- znamená posunutý start (přesně případ Legs 1. 8.).
    (select count(*) from public.workout_sets s
      where s.workout_id = w.id and s.created_at < w.started_at) as serii_pred_startem
  from public.workouts w
  where w.duration_min > 180
    and w.started_at is not null
),
radky as (
  select
    1                                        as ord,
    to_char(date, 'DD.MM.YYYY')              as datum,
    coalesce(split_type, '—')                as split,
    serii::text                              as serii,
    duration_min::text                       as ted_min,
    novy_min::text                           as novy_min,
    (duration_min - novy_min)::text          as rozdil,
    case
      when novy_min >= duration_min then 'BEZE ZMĚNY — přepočet nikdy nenafoukne'
      when serii = 0                then 'žádná série → 1 min'
      when serii_pred_startem > 0   then 'posunutý started_at (' || serii_pred_startem || ' sérií před ním) → origin z created_at'
      else ''
    end                                      as pozn
  from recalc
),
souhrn as (
  select
    2                                        as ord,
    'CELKEM'                                 as datum,
    ''                                       as split,
    sum(serii)::text                         as serii,
    sum(duration_min)::text                  as ted_min,
    sum(novy_min)::text                      as novy_min,
    sum(duration_min - novy_min)::text       as rozdil,
    count(*) || ' tréninků nad 3 h'          as pozn
  from recalc
)
select datum, split, serii, ted_min, novy_min, rozdil, pozn
from (select * from radky union all select * from souhrn) x
order by ord, ted_min::int desc;
