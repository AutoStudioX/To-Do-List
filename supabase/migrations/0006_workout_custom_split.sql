-- Allow custom split names on workouts (e.g. "Full body", "Cardio", "Ruce").
-- The original 0005 constraint hard-limited split_type to Push/Pull/Legs; drop it
-- so users can type their own split. Colors/rotation for the three defaults still
-- apply in the app; unknown names just render with the neutral custom color.
alter table public.workouts drop constraint if exists workouts_split_type_check;
