-- Návyk může mít místo jednoho času celý rozsah (7:30 – 8:00).
--
-- Stávající `cas` se stává ZAČÁTKEM, `cas_do` je nepovinný konec. Nic se
-- nepřevádí ani nemaže — návyk jen se začátkem se zobrazuje dál jako „7:30".
--
-- Konec bez začátku nedává smysl: „do 8:00" bez toho, odkdy, není rozsah.
-- Hlídá to check, ne jen formulář.

alter table public.habits
  add column if not exists cas_do time;

alter table public.habits drop constraint if exists habits_cas_rozsah;
alter table public.habits add constraint habits_cas_rozsah check (
  cas_do is null or cas is not null
);
