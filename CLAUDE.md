# Dashboard — Personal Productivity App

## Stack

- **Framework**: Next.js 15, App Router, TypeScript
- **Styling**: Tailwind CSS v4 + inline styles (dark theme)
- **Backend**: Supabase (Postgres + Auth)
- **Charts**: Recharts
- **Icons**: Lucide React

## Dark Theme Colors

```css
--bg: #0f0f0f        /* page background */
--card: #1a1a1a      /* card / sidebar background */
--border: #2a2a2a    /* borders, dividers */
--accent: #3b82f6    /* blue accent / primary buttons */
--text: #ffffff      /* primary text */
--muted: #6b7280     /* secondary text */
```

## Env Vars

Copy `.env.local.example` to `.env.local` and fill in your Supabase credentials:

```
NEXT_PUBLIC_SUPABASE_URL=https://your-project.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=your-anon-key
```

## Pages

| Route | Description |
|---|---|
| `/prehled` | Overview: 4 circle rings (tasks, goals, finance, debts) + quick stats + goal roadmap |
| `/ukoly` | Tasks table with filters, CRUD, priority/status badges |
| `/goaly` | Goal cards with milestones, progress bar, roadmap |
| `/finance` | Income/expense/fixed costs, 6-month bar chart, 1M progress bar |
| `/casovy-plan` | Weekly calendar grid (Mon-Sun, 06:00-22:00), colored time blocks |
| `/dluhy` | Debts split into "mine" / "owed to me", toggle status |
| `/login` | Email + password auth |

## Supabase Tables & RLS

Run in Supabase SQL Editor:

```sql
create table ukoly (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users not null,
  nazev text not null,
  priorita text check (priorita in ('High','Medium','Low')) default 'Medium',
  deadline date,
  status text check (status in ('Todo','In Progress','Done')) default 'Todo',
  projekt text,
  created_at timestamptz default now()
);

create table projekty (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users not null,
  nazev text not null,
  created_at timestamptz default now()
);

create table goaly (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users not null,
  nazev text not null,
  deadline date,
  popis text,
  progress int default 0 check (progress between 0 and 100),
  status text check (status in ('active','completed')) default 'active',
  created_at timestamptz default now()
);

create table milniky (
  id uuid primary key default gen_random_uuid(),
  goal_id uuid references goaly on delete cascade not null,
  user_id uuid references auth.users not null,
  nazev text not null,
  deadline date,
  done boolean default false,
  created_at timestamptz default now()
);

create table prijmy (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users not null,
  klient text not null,
  castka numeric not null,
  datum date not null,
  typ text check (typ in ('jednorazovy','mesicni')) default 'jednorazovy',
  status text check (status in ('zaplaceno','ceka')) default 'ceka',
  created_at timestamptz default now()
);

create table vydaje (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users not null,
  nazev text not null,
  castka numeric not null,
  datum date not null,
  kategorie text not null,
  opakovani boolean default false,
  created_at timestamptz default now()
);

create table fixni_naklady (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users not null,
  nazev text not null,
  castka numeric not null,
  created_at timestamptz default now()
);

create table casovy_plan (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users not null,
  nazev text not null,
  den int check (den between 0 and 6) not null,
  od time not null,
  "do" time not null,
  barva text default '#3b82f6',
  kategorie text,
  created_at timestamptz default now()
);

create table dluhy (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users not null,
  smer text check (smer in ('moje','mne')) not null,
  komu_kdo text not null,
  castka numeric not null,
  datum date not null,
  popis text,
  status text check (status in ('splaceno','nesplaceno')) default 'nesplaceno',
  created_at timestamptz default now()
);

-- Enable RLS
alter table ukoly enable row level security;
alter table projekty enable row level security;
alter table goaly enable row level security;
alter table milniky enable row level security;
alter table prijmy enable row level security;
alter table vydaje enable row level security;
alter table fixni_naklady enable row level security;
alter table casovy_plan enable row level security;
alter table dluhy enable row level security;

-- Policies
create policy "Users can manage own ukoly" on ukoly for all using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy "Users can manage own projekty" on projekty for all using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy "Users can manage own goaly" on goaly for all using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy "Users can manage own milniky" on milniky for all using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy "Users can manage own prijmy" on prijmy for all using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy "Users can manage own vydaje" on vydaje for all using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy "Users can manage own fixni_naklady" on fixni_naklady for all using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy "Users can manage own casovy_plan" on casovy_plan for all using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy "Users can manage own dluhy" on dluhy for all using (auth.uid() = user_id) with check (auth.uid() = user_id);
```

## Realtime (cross-device live sync)

`lib/useLiveData.ts` refetches on tab focus + a light poll, and also
subscribes to Supabase Realtime for near-instant updates across devices.
Realtime only fires once the tables are added to the `supabase_realtime`
publication. Run once in the Supabase SQL Editor:

```sql
alter publication supabase_realtime add table public.ukoly, public.projekty, public.goaly, public.milniky, public.transakce, public.casovy_plan;
```

If a table errors as "does not exist", add them one at a time and drop the
missing one, or use the Dashboard: Database → Replication → toggle each table
under the `supabase_realtime` publication.

Without this the app still syncs (focus refetch + poll), just not instantly.

## PWA Setup

- `public/manifest.json` - web app manifest (dark theme, standalone display)
- `public/sw.js` - basic service worker for offline caching
- Service worker auto-registered via inline script in `app/layout.tsx`
- Add real `public/icon-192.png` and `public/icon-512.png` for full PWA support

## Auth Flow

- Login: `/login` - email + password via Supabase Auth
- Session check: `app/layout.tsx` (server component) - if no user, renders children without sidebar
- Logout: sidebar button calls `supabase.auth.signOut()`
- OAuth callback: `/auth/callback/route.ts`

## Key Conventions

- All data pages are 'use client' with useEffect + useState
- Always pass `user_id: user.id` on inserts
- Currency format: `new Intl.NumberFormat('cs-CZ', { style: 'currency', currency: 'CZK', maximumFractionDigits: 0 }).format(amount)`
- Colors consistent with CSS variables above
