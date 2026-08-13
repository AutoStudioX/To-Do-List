-- Seznam cviků tréninku — i těch, u kterých ještě není potvrzená žádná série.
--
-- Aktivní trénink se skládal jen z `workout_sets`. Cvik načtený přes „Načíst
-- minulý trénink" (nebo ručně přidaný) nemá do prvního potvrzení v databázi
-- nic, takže po obnovení stránky zmizel a zůstaly jen cviky s aspoň jednou
-- sérií.
--
-- Proč vlastní tabulka a ne prázdné řádky v `workout_sets`: každý řádek
-- v `workout_sets` je „odcvičená série" pro počítadlo, objem, PR odznaky,
-- export i pro `workout_last_activity()` / `workout_origin()`, ze kterých se
-- počítá délka tréninku. Plánovaný cvik by musel dostat příznak „tohle není
-- série" a ten by se pak musel odfiltrovat úplně všude — jedno zapomenuté
-- místo tiše rozbije číslo, které nikdo hned neuvidí. Takhle je plán
-- oddělený od záznamu a nic, co počítá, do téhle tabulky nesahá.

create table if not exists public.workout_exercises (
  workout_id  uuid not null references public.workouts(id)  on delete cascade,
  exercise_id uuid not null references public.exercises(id) on delete cascade,
  order_index int  not null default 0,
  created_at  timestamptz not null default now(),
  primary key (workout_id, exercise_id)
);

create index if not exists workout_exercises_workout_idx
  on public.workout_exercises (workout_id, order_index);

alter table public.workout_exercises enable row level security;

-- Vlastnictví se odvozuje z tréninku, ne z denormalizovaného `user_id`, který
-- se dá zapsat i špatně. Stejný vzor jako `habit_times` (migrace 0018).
drop policy if exists "own workout exercises" on public.workout_exercises;
create policy "own workout exercises" on public.workout_exercises for all
  using (exists (
    select 1 from public.workouts w where w.id = workout_id and w.user_id = auth.uid()
  ))
  with check (exists (
    select 1 from public.workouts w where w.id = workout_id and w.user_id = auth.uid()
  ));
