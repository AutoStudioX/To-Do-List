-- Denní poznámka k návykům: co jsem dneska dělal, jak to šlo.
--
-- Jeden řádek na den a uživatele — proto unikát na (user_id, datum), který
-- zároveň slouží jako `on conflict` cíl pro upsert. Poznámka se přepisuje,
-- ne verzuje: jde o zápisník, ne o historii změn.
--
-- Prázdná poznámka se NEUKLÁDÁ, řádek se rovnou maže (viz aplikace) — jinak
-- by v Přehledu svítila značka „tady něco je" u dne, kde nic není.

create table if not exists public.habit_notes (
  id         uuid primary key default gen_random_uuid(),
  user_id    uuid not null references auth.users on delete cascade,
  datum      date not null,
  text       text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (user_id, datum)
);

create index if not exists habit_notes_user_datum_idx
  on public.habit_notes (user_id, datum);

alter table public.habit_notes enable row level security;

drop policy if exists "own habit notes" on public.habit_notes;
create policy "own habit notes" on public.habit_notes for all
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

-- `updated_at` drží databáze: aplikace ho posílat nemusí a nemá se s čím
-- rozejít, když poznámku někdo upraví z jiného zařízení.
create or replace function public.touch_habit_notes() returns trigger
language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end $$;

drop trigger if exists habit_notes_touch on public.habit_notes;
create trigger habit_notes_touch before update on public.habit_notes
  for each row execute function public.touch_habit_notes();
