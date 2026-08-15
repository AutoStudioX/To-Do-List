-- Cold cally: evidence studených hovorů s důrazem na učení se z nich.
--
-- `vysledek = 'ceka'` je NAHRANÝ LEAD, kterému se ještě nevolalo — proto je
-- výchozí hodnotou a proto má `volano_at` NULL. Ostatní čtyři hodnoty jsou
-- výsledky skutečného hovoru.
--
-- Datum se drží ve dvou sloupcích schválně:
--   `created_at` = kdy záznam vznikl (u leadu okamžik importu),
--   `volano_at`  = kdy se doopravdy volalo.
-- Kdyby na obojí byl jeden sloupec, po zavolání by se ztratilo, kdy lead přišel,
-- a statistika „dnes zavoláno" by počítala i dnešní import bez jediného hovoru.

create table if not exists public.cold_calls (
  id               uuid primary key default gen_random_uuid(),
  user_id          uuid not null references auth.users on delete cascade,
  firma            text not null,
  kontakt_jmeno    text,
  telefon          text,
  vysledek         text not null default 'ceka'
                     check (vysledek in ('nedovolano','odmitnuto','zajem','schuzka','ceka')),
  co_jsem_rekl     text,
  co_odpovedel     text,
  co_spatne        text,
  co_priste_jinak  text,
  created_at       timestamptz not null default now(),
  volano_at        timestamptz
);

-- Seznam se řadí frontou nahoře a pak od nejnovějšího hovoru.
create index if not exists cold_calls_user_idx
  on public.cold_calls (user_id, vysledek, created_at desc);

-- Duplicitu leadu poznáme podle telefonu. Index je částečný (jen řádky
-- s číslem), aby záznamy bez telefonu neblokovaly jeden druhého.
create index if not exists cold_calls_user_telefon_idx
  on public.cold_calls (user_id, telefon) where telefon is not null;

alter table public.cold_calls enable row level security;

drop policy if exists "own cold calls" on public.cold_calls;
create policy "own cold calls" on public.cold_calls for all
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);
