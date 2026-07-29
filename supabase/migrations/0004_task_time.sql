-- Optional time-of-day for task deadlines.
--
-- Design choice: a separate nullable column `deadline_time time`, NOT changing
-- `deadline` to timestamptz. Why:
--   • `deadline` (type `date`) stays byte-for-byte unchanged → every existing
--     date-only task keeps working exactly as before.
--   • `time` has NO timezone, so a local wall-clock "08:00" is stored and read
--     back as "08:00" — it can never be shifted to UTC ("06:00").
--   • NULL cleanly means "no specific time" (a timestamptz couldn't tell a real
--     00:00 from "no time given").
-- Most tasks won't have a time, so the column is nullable with no default.

alter table public.ukoly add column if not exists deadline_time time;

comment on column public.ukoly.deadline_time is
  'Local wall-clock time (Europe/Prague) for the deadline. NULL = no specific time. Type `time` (no tz) so 08:00 stays 08:00.';
