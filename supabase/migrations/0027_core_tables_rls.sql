-- Bezpečnostní audit, nález 6: šest nejstarších tabulek nemá v repu migraci.
--
-- `ukoly, projekty, goaly, milniky, transakce, casovy_plan` vznikly ručně
-- v dashboardu. Živě RLS drží — ověřeno sondou: nepřihlášený dotaz veřejným
-- klíčem vrátil u všech prázdno — ale v kódu to nezaručuje nic. Kdo appku
-- nasadí do čisté Supabase instance, dostane buď žádné tabulky, nebo (podle
-- toho, jak si je vyrobí) tabulky bez politik. A protože `useLiveData`
-- přihlašuje tabulky k Realtime odběru, tekla by taková tabulka rovnou ven.
--
-- Tahle migrace je proto psaná jako IDEMPOTENTNÍ a NEDESTRUKTIVNÍ:
--   • `create table if not exists` — existující tabulky se nedotkne (ani
--     nepřidává chybějící sloupce, viz níž),
--   • `alter table … enable row level security` je bezpečné pustit znovu,
--   • politika se nejdřív dropne a založí znovu, takže se stav v databázi
--     srovná s tím, co je v repu.
--
-- ⚠️ DEFINICE SLOUPCŮ JE ZREKONSTRUOVANÁ z `lib/types.ts` a ze skutečných
-- zápisů v aplikaci, ne vytažená z běžící databáze. Na živé instanci se proto
-- neprojeví (tabulky už existují); slouží pro čisté nasazení. Až se k živé
-- instanci dostaneš, srov s `\d ukoly` a případný rozdíl sem dopiš.

-- ============================================================================
-- Tabulky (jen pro čisté nasazení; na existující instanci se nic nestane)
-- ============================================================================
create table if not exists public.ukoly (
  id            uuid primary key default gen_random_uuid(),
  user_id       uuid not null references auth.users(id) on delete cascade,
  nazev         text not null,
  priorita      text not null default 'Medium' check (priorita in ('High','Medium','Low')),
  deadline      date,
  deadline_time time,
  status        text not null default 'Todo' check (status in ('Todo','In Progress','Done')),
  projekt       text,
  dokonceno_at  timestamptz,
  created_at    timestamptz not null default now()
);

create table if not exists public.projekty (
  id         uuid primary key default gen_random_uuid(),
  user_id    uuid not null references auth.users(id) on delete cascade,
  nazev      text not null,
  created_at timestamptz not null default now()
);

create table if not exists public.goaly (
  id            uuid primary key default gen_random_uuid(),
  user_id       uuid not null references auth.users(id) on delete cascade,
  nazev         text not null,
  deadline      date,
  popis         text,
  progress      int  not null default 0 check (progress between 0 and 100),
  status        text not null default 'active' check (status in ('active','completed')),
  typ           text check (typ in ('manual','number','income')),
  current_value numeric,
  target_value  numeric,
  created_at    timestamptz not null default now()
);

create table if not exists public.milniky (
  id         uuid primary key default gen_random_uuid(),
  goal_id    uuid not null references public.goaly(id) on delete cascade,
  user_id    uuid not null references auth.users(id) on delete cascade,
  nazev      text not null,
  deadline   date,
  done       boolean not null default false,
  created_at timestamptz not null default now()
);

-- `transakce` je jediná finanční tabulka: příjmy, výdaje, fixní náklady
-- i dluhy jsou její řádky rozlišené sloupcem `typ`. Staré rozdělené tabulky
-- (prijmy/vydaje/fixni_naklady/dluhy) aplikace nepoužívá a nezakládají se.
create table if not exists public.transakce (
  id         uuid primary key default gen_random_uuid(),
  user_id    uuid not null references auth.users(id) on delete cascade,
  nazev      text not null,
  castka     numeric not null,
  datum      date,
  typ        text not null check (typ in ('prijem','vydaj','fixni_naklad','dluh')),
  kategorie  text,
  smer       text,
  opakovani  text check (opakovani in ('jednorazovy','mesicni','rocni')),
  status     text,
  klient     text,
  poznamka   text,
  created_at timestamptz not null default now()
);

create table if not exists public.casovy_plan (
  id         uuid primary key default gen_random_uuid(),
  user_id    uuid not null references auth.users(id) on delete cascade,
  nazev      text not null,
  den        int  not null check (den between 0 and 6),
  od         time not null,
  "do"       time not null,
  barva      text not null default '#E8192C',
  kategorie  text,
  created_at timestamptz not null default now()
);

-- ============================================================================
-- RLS + politiky „jen vlastník"
-- ============================================================================
alter table public.ukoly       enable row level security;
alter table public.projekty    enable row level security;
alter table public.goaly       enable row level security;
alter table public.milniky     enable row level security;
alter table public.transakce   enable row level security;
alter table public.casovy_plan enable row level security;

drop policy if exists "own ukoly" on public.ukoly;
create policy "own ukoly" on public.ukoly for all
  using (auth.uid() = user_id) with check (auth.uid() = user_id);

drop policy if exists "own projekty" on public.projekty;
create policy "own projekty" on public.projekty for all
  using (auth.uid() = user_id) with check (auth.uid() = user_id);

drop policy if exists "own goaly" on public.goaly;
create policy "own goaly" on public.goaly for all
  using (auth.uid() = user_id) with check (auth.uid() = user_id);

-- U milníků se vlastnictví drží na vlastním `user_id` (tak to appka zapisuje
-- i čte). Kontrola přes rodičovský cíl by byla přísnější, ale znamenala by
-- přepsat i dotazy — a hlavně by se lišila od toho, co je dnes živě.
drop policy if exists "own milniky" on public.milniky;
create policy "own milniky" on public.milniky for all
  using (auth.uid() = user_id) with check (auth.uid() = user_id);

drop policy if exists "own transakce" on public.transakce;
create policy "own transakce" on public.transakce for all
  using (auth.uid() = user_id) with check (auth.uid() = user_id);

drop policy if exists "own casovy_plan" on public.casovy_plan;
create policy "own casovy_plan" on public.casovy_plan for all
  using (auth.uid() = user_id) with check (auth.uid() = user_id);

-- ============================================================================
-- Indexy, které aplikace opravdu využívá (řazení a filtrování po uživateli)
-- ============================================================================
create index if not exists ukoly_user_created_idx       on public.ukoly (user_id, created_at desc);
create index if not exists projekty_user_nazev_idx      on public.projekty (user_id, nazev);
create index if not exists goaly_user_created_idx       on public.goaly (user_id, created_at desc);
create index if not exists milniky_goal_idx             on public.milniky (goal_id);
create index if not exists transakce_user_datum_idx     on public.transakce (user_id, datum desc);
create index if not exists casovy_plan_user_den_idx     on public.casovy_plan (user_id, den);
