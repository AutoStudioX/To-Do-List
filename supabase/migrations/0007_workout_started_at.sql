-- Workout state: running vs finished, and a resumable clock.
--
-- WHY NO "status" COLUMN:
-- `duration_min` already tells the two states apart — it is written only by
-- finish() and is NULL for a workout that has never been finished. A separate
-- status column would be a second source of truth for the same fact.
--
-- WHY started_at IS NEEDED ANYWAY:
-- the running timer was computed from `created_at`, which is when the ROW was
-- created — not where the clock should count from. Finish a workout at 52 min,
-- come back five hours later and `now - created_at` reads 5:00:00. To resume at
-- 52:00 the clock origin has to move, so we store it.
--
-- Rules:
--   running   → duration_min IS NULL,     elapsed = now() - started_at
--   finished  → duration_min IS NOT NULL, elapsed = duration_min minutes
--   finish()  → duration_min = round((now() - started_at) / 60)
--   resume()  → started_at = now() - duration_min minutes, duration_min = NULL
--
-- Trade-off: duration_min is whole minutes, so one resume rounds the seconds
-- down to :00. Sub-minute drift once per resume is fine for a gym log; storing
-- seconds would need a second column for no practical gain.

alter table public.workouts add column if not exists started_at timestamptz;

-- Existing rows: the clock used to start at row creation.
update public.workouts set started_at = created_at where started_at is null;

alter table public.workouts alter column started_at set default now();
