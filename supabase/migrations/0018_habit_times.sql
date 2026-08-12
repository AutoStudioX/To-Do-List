-- Čas návyku po dnech.
--
-- Focus má být v úterý 10:00–13:00 a ve středu 7:00–10:00. Tři návyky se
-- stejným jménem by udělaly bordel v Přehledu — jeden návyk, jeden řádek,
-- jen čas se v některé dny liší.
--
-- `habits.cas` / `habits.cas_do` zůstávají VÝCHOZÍM časem a platí pro všechny
-- dny. Tahle tabulka drží jen VÝJIMKY: když pro daný den záznam není, platí
-- výchozí čas z návyku. Prázdná tabulka = chování jako dosud.
--
-- Proč výjimky a ne řádek na každý den: den bez výjimky se nemá čím rozejít
-- s výchozím časem. Kdyby se ukládalo všech sedm dnů, změna výchozího času by
-- musela přepsat sedm řádků a při jakémkoli výpadku by část dnů zůstala na
-- starém čase.

create table if not exists public.habit_times (
  habit_id uuid not null references public.habits(id) on delete cascade,
  -- 1 = pondělí … 7 = neděle, stejně jako `habits.dny`.
  den      int  not null check (den between 1 and 7),
  cas_od   time not null,
  cas_do   time,
  primary key (habit_id, den)
);

-- Konec před začátkem je překlep, ne rozsah přes půlnoc: návyk „22:00–02:00"
-- by musel patřit do dvou dnů a nic v aplikaci s tím nepočítá.
alter table public.habit_times drop constraint if exists habit_times_poradi;
alter table public.habit_times add constraint habit_times_poradi check (
  cas_do is null or cas_do > cas_od
);

alter table public.habit_times enable row level security;

-- Vlastnictví se odvozuje z návyku, ne z vlastního `user_id`. Denormalizovaný
-- sloupec by se dal zapsat i špatně (cizí `user_id` k vlastnímu návyku), tady
-- se rozejít nemá s čím — a `habit_times` se čte po jednom návyku, ne přes
-- celé okno, takže poddotaz nic nestojí.
drop policy if exists "own habit times" on public.habit_times;
create policy "own habit times" on public.habit_times for all
  using (exists (
    select 1 from public.habits h where h.id = habit_id and h.user_id = auth.uid()
  ))
  with check (exists (
    select 1 from public.habits h where h.id = habit_id and h.user_id = auth.uid()
  ));
