-- „Kde hovor skončil" — fáze, ve které to spadlo.
--
-- Měřitelný údaj vedle výsledku: výsledek říká JAK to dopadlo, fáze říká KDE
-- se to zlomilo. Z toho jde poznat, jestli se láme skript na začátku (lidi
-- zavěšují hned) nebo až na ceně.
--
-- Sloupec je nullable schválně: nahraný lead žádnou fázi nemá a u „nedovoláno"
-- se hovor k žádné fázi nedostal. Prázdná hodnota do rozpadu nevstupuje.

alter table public.cold_calls
  add column if not exists faze text;

alter table public.cold_calls drop constraint if exists cold_calls_faze_check;
alter table public.cold_calls add constraint cold_calls_faze_check check (
  faze is null or faze in ('hned', 'po_predstaveni', 'pri_popisu', 'u_ceny', 'u_schuzky')
);

-- Rozpad na obrazovce „Co se učím" se ptá na fáze jednoho uživatele.
create index if not exists cold_calls_user_faze_idx
  on public.cold_calls (user_id, faze) where faze is not null;
