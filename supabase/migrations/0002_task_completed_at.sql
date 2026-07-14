-- Track WHEN a task was completed, so the Přehled ring can count "tasks completed
-- this week" regardless of deadline/created date. A DB trigger stamps it on every
-- write path (Úkoly page, Přehled, voice agent) so nothing can forget to set it.

alter table public.ukoly add column if not exists dokonceno_at timestamptz;

create or replace function public.set_ukoly_dokonceno_at()
returns trigger language plpgsql set search_path = '' as $$
begin
  if new.status = 'Done' and (tg_op = 'INSERT' or old.status is distinct from 'Done') then
    new.dokonceno_at := now();          -- just became Done → stamp it
  elsif new.status <> 'Done' then
    new.dokonceno_at := null;           -- moved back out of Done → clear it
  end if;
  return new;
end; $$;

drop trigger if exists trg_ukoly_dokonceno on public.ukoly;
create trigger trg_ukoly_dokonceno
  before insert or update on public.ukoly
  for each row execute function public.set_ukoly_dokonceno_at();

-- Existing Done tasks keep dokonceno_at = null (we don't know when they were
-- finished), so they won't be miscounted into the current week. Going forward
-- every completion is stamped automatically.
