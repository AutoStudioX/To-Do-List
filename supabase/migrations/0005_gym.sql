-- Gym / training section: exercises catalog, workouts, and individual sets.
-- weight_kg is numeric (not text) so we can compute progress.

create table if not exists public.exercises (
  id           uuid primary key default gen_random_uuid(),
  user_id      uuid references auth.users(id) on delete cascade,  -- NULL = global catalog
  name         text not null,
  muscle_group text,
  is_custom    boolean not null default false,
  created_at   timestamptz not null default now()
);

create table if not exists public.workouts (
  id           uuid primary key default gen_random_uuid(),
  user_id      uuid not null references auth.users(id) on delete cascade,
  date         date not null default current_date,
  split_type   text check (split_type in ('Push','Pull','Legs')),
  note         text,
  duration_min int,
  created_at   timestamptz not null default now()
);

create table if not exists public.workout_sets (
  id           uuid primary key default gen_random_uuid(),
  workout_id   uuid not null references public.workouts(id) on delete cascade,
  exercise_id  uuid not null references public.exercises(id),
  order_index  int not null default 0,
  weight_kg    numeric,
  reps         int,
  rpe          int,
  is_warmup    boolean not null default false,
  created_at   timestamptz not null default now()
);

create index if not exists workout_sets_workout_idx  on public.workout_sets(workout_id);
create index if not exists workout_sets_exercise_idx on public.workout_sets(exercise_id);
create index if not exists workouts_user_date_idx     on public.workouts(user_id, date desc);

-- ============================ RLS ============================
alter table public.exercises    enable row level security;
alter table public.workouts     enable row level security;
alter table public.workout_sets enable row level security;

-- exercises: everyone reads the global catalog + their own; writes only their own custom.
drop policy if exists "read exercises" on public.exercises;
create policy "read exercises"   on public.exercises for select using (user_id is null or user_id = auth.uid());
drop policy if exists "insert own exercises" on public.exercises;
create policy "insert own exercises" on public.exercises for insert with check (user_id = auth.uid());
drop policy if exists "update own exercises" on public.exercises;
create policy "update own exercises" on public.exercises for update using (user_id = auth.uid());
drop policy if exists "delete own exercises" on public.exercises;
create policy "delete own exercises" on public.exercises for delete using (user_id = auth.uid());

-- workouts: owner only.
drop policy if exists "own workouts" on public.workouts;
create policy "own workouts" on public.workouts for all using (user_id = auth.uid()) with check (user_id = auth.uid());

-- workout_sets: access gated by owning the parent workout.
drop policy if exists "own sets" on public.workout_sets;
create policy "own sets" on public.workout_sets for all
  using (exists (select 1 from public.workouts w where w.id = workout_id and w.user_id = auth.uid()))
  with check (exists (select 1 from public.workouts w where w.id = workout_id and w.user_id = auth.uid()));

-- ============================ Seed catalog ============================
-- Global exercises (user_id NULL). Safe to re-run: only inserts names that don't exist yet.
insert into public.exercises (name, muscle_group, is_custom)
select v.name, v.muscle_group, false
from (values
  ('Bench press','Push'),
  ('Bench press na šikmé lavici','Push'),
  ('Tlak s jednoručkami','Push'),
  ('Tlak nad hlavu','Push'),
  ('Ramenní tlak s jednoručkami','Push'),
  ('Upažování','Push'),
  ('Kliky na bradlech','Push'),
  ('Stahování kladky (triceps)','Push'),
  ('Mrtvý tah','Pull'),
  ('Přítahy v předklonu','Pull'),
  ('Shyby','Pull'),
  ('Stahování horní kladky','Pull'),
  ('Veslování na spodní kladce','Pull'),
  ('Face pull','Pull'),
  ('Biceps s velkou činkou','Pull'),
  ('Kladivový biceps','Pull'),
  ('Dřep','Legs'),
  ('Leg press','Legs'),
  ('Rumunský mrtvý tah','Legs'),
  ('Předkopávání','Legs'),
  ('Zakopávání','Legs'),
  ('Výpony (lýtka)','Legs'),
  ('Výpady','Legs'),
  ('Hip thrust','Legs')
) as v(name, muscle_group)
where not exists (
  select 1 from public.exercises e where e.user_id is null and lower(e.name) = lower(v.name)
);
