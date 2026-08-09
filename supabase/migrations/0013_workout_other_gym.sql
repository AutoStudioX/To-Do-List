-- Příznak „jiná posilovna" u tréninku.
--
-- Jiné stroje a jiné váhy znamenají, že se čísla nedají poměřovat s domácí
-- posilovnou. Takový trénink se proto:
--   * nezobrazuje s porovnávacími odznaky ani s řádkem „minule:",
--   * NIKDY nepoužije jako „minulý trénink" pro předvyplnění a porovnání —
--     bere se poslední trénink BEZ tohoto příznaku.
--
-- Data se nezahazují, jen se nepoužívají jako referenční bod. V historii je
-- takový trénink označený, aby bylo jasné, proč z něj nic nevychází.

alter table public.workouts
  add column if not exists other_gym boolean not null default false;

-- Hledání „posledního použitelného tréninku" filtruje na other_gym = false,
-- proto částečný index přesně na tenhle dotaz.
create index if not exists workouts_reference_idx
  on public.workouts (user_id, date desc)
  where other_gym = false;
