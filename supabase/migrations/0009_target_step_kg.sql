-- Weight increment per exercise, stored instead of guessed.
--
-- The previous version classified "big vs small lift" from the exercise NAME,
-- because `exercises.muscle_group` holds the split (Push/Pull/Legs), not a
-- muscle. Name matching is brittle — "Bench na šikmé lavici" and any custom
-- exercise fall through it. The step is now the user's own setting, with the
-- name-based guess used only to preselect it the first time.

alter table public.exercise_targets
  add column if not exists step_kg numeric not null default 2.5
    check (step_kg > 0 and step_kg <= 50);
