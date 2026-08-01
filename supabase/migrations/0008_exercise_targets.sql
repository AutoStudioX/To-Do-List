-- Per-exercise training target (e.g. 3×10) used to advise when to add weight.
--
-- WHY A SEPARATE TABLE AND NOT COLUMNS ON `exercises`:
-- most rows in `exercises` are the SHARED catalog (`user_id IS NULL`). A target
-- written there would either leak between users or be unusable for exactly the
-- exercises people use most. The target is the user's intent, not a property of
-- the movement — two people can hold different goals for the same bench press.
--
-- WHY NOT PER WORKOUT (e.g. on workout_sets or a workout_exercises table):
-- the target is "set once, then inherited by later workouts". Storing it on the
-- workout would mean copying it forward on every session and letting copies
-- drift apart. One row per (user, exercise) gives inheritance for free — every
-- workout reads the same row.
--
-- Optional by design: no row = no advice, everything else works the same.

create table if not exists public.exercise_targets (
  user_id     uuid not null references auth.users(id)      on delete cascade,
  exercise_id uuid not null references public.exercises(id) on delete cascade,
  target_sets int  not null check (target_sets between 1 and 20),
  target_reps int  not null check (target_reps between 1 and 100),
  updated_at  timestamptz not null default now(),
  primary key (user_id, exercise_id)
);

alter table public.exercise_targets enable row level security;

drop policy if exists "own exercise targets" on public.exercise_targets;
create policy "own exercise targets" on public.exercise_targets for all
  using (user_id = auth.uid()) with check (user_id = auth.uid());
