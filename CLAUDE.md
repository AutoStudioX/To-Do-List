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
| `/trenink` | Gym: new workout (split Push/Pull/Legs, prefill from last same-split workout), 2-tap set logging, history + per-exercise max-weight chart |
| `/habits` | Habits: dnešní návyky (jen ty platné pro dnešní den), edit mode, Přehled 7/30/rok, detail návyku |
| `/focus` | Focus timer: goal + 25/45/60/90/custom, live countdown, self-set 0-100 % progress, pause/cancel/finish |
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
-- NOTE: `transakce` is the real finance table (income, expenses, debts, fixed
-- costs are all rows in it, discriminated by `typ`). The old split tables
-- prijmy/vydaje/fixni_naklady/dluhy are NOT used by the app — do not recreate
-- or add RLS for them. Verified live in Supabase: every table below has RLS
-- enabled with the owner-only policy.
alter table ukoly enable row level security;
alter table projekty enable row level security;
alter table goaly enable row level security;
alter table milniky enable row level security;
alter table transakce enable row level security;
alter table casovy_plan enable row level security;

-- Policies
create policy "Users can manage own ukoly" on ukoly for all using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy "Users can manage own projekty" on projekty for all using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy "Users can manage own goaly" on goaly for all using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy "Users can manage own milniky" on milniky for all using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy "Users can manage own transakce" on transakce for all using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy "Users can manage own casovy_plan" on casovy_plan for all using (auth.uid() = user_id) with check (auth.uid() = user_id);
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

## Brute-force login protection

Runs inside a **Next.js server action** (`app/login/actions.ts`), which reads the request IP server-side and calls `SECURITY DEFINER` RPCs around `signInWithPassword`. `LoginForm` is a client form wired to the action via `useActionState` (no auth logic in the client). Two layers:

- **EMAIL lock** — 5 wrong passwords for an account → **15 min** lock (auto-expires); a correct login resets the counter. Message: `Příliš mnoho pokusů, zkuste to za 15 minut`. Attempts 1–4 show remaining (`Zbývají 3 pokusy.` / `Zbývá 1 pokus.`).
- **IP block** — 10 wrong attempts from one IP → **permanent** block until cleared by SQL (§6 of the migration). Message: `Přístup z této sítě byl zablokován. Kontaktujte správce.`

**The lock check runs BEFORE `signInWithPassword`**, so a locked account (or blocked IP) is rejected even with the correct password.

**Server action flow (`app/login/actions.ts`):**
1. `check_ip_block(ip)` → if blocked, reject.
2. `check_login_lockout(email)` → if locked, reject (before sign-in).
3. `signInWithPassword`.
4. On error → `record_failed_login(email, ip)` → `{ email_locked, minutes_left, attempts_left, ip_blocked }`; show the matching message.
5. On success → `reset_login_attempts(email, ip)`, then `redirect('/prehled')`.

RPCs normalise the email, resolve it via `auth.users`, and are `SECURITY DEFINER` (bypass RLS), granted to `anon` (login is pre-auth) + `authenticated`.

⚠️ **Known limit — be honest about it.** The server action still calls Supabase auth with the public anon flow; an attacker calling the GoTrue API directly **bypasses** these RPCs. Backstop = Supabase's built-in **per-IP** rate limit (`sign_in_sign_ups` = 30 / 5 min / IP; Dashboard → Authentication → Rate Limits). The unbypassable version needs the paid **Password Verification Attempt** hook (Team/Enterprise only). For this app the combination is adequate.

**Tables (RLS on, no app-facing policies — access only via the SECURITY DEFINER functions):**
- `login_lockout(user_id, failed_attempts, locked_until, updated_at)`
- `ip_login_block(ip, failed_attempts, blocked, updated_at)`
- `app_admins(user_id)` — admin allow-list. Seed: `insert into public.app_admins(user_id) select id from auth.users where lower(email) = lower('…');`

**Clear a permanent IP block (no UI — by design):**
```sql
delete from public.ip_login_block where ip = '203.0.113.7';   -- or: delete from public.ip_login_block;
```
**Early-unlock an email** (auto-expires in 15 min anyway): admins see **Admin** in the sidebar → `/admin` (`admin_list_locked_accounts()` + `admin_unlock_account()`), or via SQL:
```sql
update public.login_lockout set failed_attempts = 0, locked_until = null
  where user_id = (select id from auth.users where lower(email) = lower('stuck@example.com'));
```

**Setup:** run `supabase/migrations/0001_login_lockout.sql` in the SQL Editor, then seed yourself as admin (§5). Pure SQL + server action — no dashboard hook.

**Verification:** the four lockout paths (5-fail email lock, locked+correct-password rejection, 15-min expiry, 10-fail permanent IP block) are verified against a real Postgres by loading the migration and driving the RPCs — see the commit that added this. The live `signInWithPassword` + real-credential path isn't machine-verifiable here (entering passwords is off-limits); test it manually after deploying the migration.

## Key Conventions

- All data pages are 'use client' with useEffect + useState
- Always pass `user_id: user.id` on inserts
- Currency format: `new Intl.NumberFormat('cs-CZ', { style: 'currency', currency: 'CZK', maximumFractionDigits: 0 }).format(amount)`
- Colors consistent with CSS variables above

## UI Principles

- **Prefer button groups over dropdowns.** For any field with 2-6 options, use inline pill buttons (`components/PillGroup.tsx`) instead of a `<Select>` dropdown — it's faster and easier for clients. Only use `<Select>` for many options (7+) or dynamic lists (e.g. project/day pickers). Apply this to all future forms and modals.
- **Always pre-select a sensible default** when a form/modal opens (e.g. task priority defaults to `High`, status to `Todo`).
- Pill selected-state colors reuse the existing badge palette from `lib/badgeColors.ts` — don't invent new colors; match the corresponding status/priority/type badge.
- **Minimum 44×44px tap targets on touch UI.** Every interactive icon button (edit/delete pencils & trashes) and checkbox must have at least a 44×44px hit area, even if the visible icon is smaller — wrap small controls (e.g. a 24px checkbox) in a 44px `<label>`/container with negative margins so layout isn't pushed around. Space adjacent destructive/edit buttons at least `gap: 12` apart to prevent mis-taps. Icons themselves should be ≥16px and checkboxes ≥24px.
- **Never force a fixed multi-column row that can overflow at 375px.** Card/ring/stat grids must stack or wrap on mobile (gate the column count on `isMobile`, and use `minmax(0, 1fr)` columns so cells can shrink instead of clipping). The Přehled rings use `repeat(2, minmax(0,1fr))` on mobile, `repeat(3, minmax(0,1fr))` on desktop.
- **No native time/date inputs.** `input type="time"` opens the OS panel — light, foreign chrome, different on every platform, exactly what the no-native-dialogs rule exists to prevent. Use `components/TimePicker.tsx` (quick pills + two `StepperField` steppers). Same reasoning as `confirm()`/`alert()`.
- **A habit's grid starts at `created_at`.** A day before the habit existed is not "missed", it is "did not exist" — `tracksOn()` (exists && applies) gates every grid cell and every score, so a habit created today reads 0/1, not 0/30.
- **Habits stats never count a day the habit did not apply.** A habit restricted to Tue/Thu/Sat must not read as "missed" on Monday — `dayStats()`, `successRateOn()` and `habitStreaksOn()` walk only applicable days, the matrix score is `hit/applicable`, and an inapplicable day renders empty (dashed), never as level 0 grey.
- **Every habit grid grows from the left — the year one included.** 7, 30 and 365 days all start at the first day of real history and end at today; the year grid renders `ceil((offset + days) / 7)` columns (max 53), never a fixed 53, or a young habit's whole history sits at the far right edge behind a year of blanks. The heading follows the data ("Posledních 120 dní", not "Posledních 12 měsíců").
- **Habits are hidden, never deleted.** The edit mode carries an eye-off button that sets `archivovany`; hidden habits vanish from Dnes, Přehled and Detail and count toward no score, streak or statistic, but keep their `habit_entries` history so restoring resumes where it stopped. They reappear greyed at the end of the list in edit mode with an eye to restore. Don't add a second archive control anywhere.
- **A habit's time can differ per weekday, but it stays one habit.** `habits.cas` / `cas_do` is the default for every day; `habit_times (habit_id, den, cas_od, cas_do)` holds only the exceptions, so a day with no row follows the default and an empty table behaves exactly as before. Never store all seven days — changing the default would then have to rewrite seven rows. RLS on `habit_times` derives ownership from the habit, never from a denormalised `user_id`. Dnes shows and sorts by the time valid for the viewed day (`sortHabitsOn`); Přehled and Detail don't read the table at all — one row per habit stays one row.
- **The Habits day can be switched backwards only.** Arrows next to the date move `viewDay`; the forward arrow is `disabled` on today (a future day is never checkable), the back arrow stops at the oldest loaded day. Backfilling is allowed, but a past day must *look* different — accent banner, accent date, dashed and dimmed cards — so nobody thinks they are editing today. Dim via an overlay gradient, never via `--input-bg`: in light mode that variable equals `--card`. The day step must use a functional state update, or fast taps all compute the same day.
- **Route names are Czech; keep redirects for any renamed/English path.** The goals page lives at `/goaly`; `/goals` (and `/goals/:path*`) permanently redirect to it via `next.config.ts` so bookmarked/external links don't 404. Add a similar redirect whenever a route is renamed.

## Dialogy a zpětná vazba (platí pro všechny projekty)

### ŽÁDNÉ NATIVNÍ DIALOGY
**Nikdy nepoužívej `confirm()`, `alert()` ani `prompt()`.** Vždy vlastní modál v designu appky.

**Proč:** nativní dialogy vypadají jako rozbitá appka (systémový chrome cizí zbytku UI), nejdou stylovat, ignorují tmavý režim, na mobilu vypadají jinak než na desktopu a nedají se otestovat v prohlížeči.

Modál musí mít:
- text otázky s **konkrétním předmětem** — `Smazat konverzaci „název“? Nejde to vrátit.`, ne `Opravdu smazat?`
- dvě tlačítka: **Zrušit** / potvrzení (destruktivní **červené**)
- zavření klávesou **Esc** i **klikem mimo**
- **focus na potvrzovacím tlačítku** po otevření

V této appce na to slouží `useConfirm()` z `components/ConfirmDialog.tsx`
(`const { confirm, dialog } = useConfirm()` → `if (!await confirm('…', 'Odebrat')) return`,
a `{dialog}` vyrenderovat na konci stránky). Druhý systém nezakládej.

### KAŽDÁ ZMĚNA MUSÍ MÍT ZPĚTNOU VAZBU
Po každé akci, která něco změní (uložení, smazání, úprava), musí přijít **toast**:
- úspěch **zeleně**, chyba **červeně s důvodem** (`Smazání selhalo: <error.message>`)
- auto-zmizí po **3 s**
- **chyba se NIKDY nesmí spolknout mlčky** — žádné `if (error) return` bez hlášky

Bez potvrzení uživatel neví, jestli se akce provedla. V této appce: `useToast()` z
`components/Toast.tsx` (`showToast('Trénink smazán')` / `showToast(msg, 'error')`).

## Behavior Notes / Fixes

- **Completing a task never deletes it.** The checkbox only flips `status` (`Todo`↔`Done`). Completed tasks must stay visible under the `Done` and `Vše` (All) filters. Do not add a filter that hides `Done` tasks globally (a previous `hideDoneFromPill` flag caused completed tasks to vanish from every tab — removed).
- **Task search covers title AND project** (`app/ukoly` search box, placeholder `Hledat úkol nebo projekt...`) — match against `nazev` and `projekt`.
- **Theme-aware overdue rows.** Overdue task cards use `--overdue-bg` / `--overdue-border` CSS vars (light pink in light mode, translucent red in dark mode). Never hardcode `#fff5f5` for backgrounds behind `var(--text)` — it's white-on-pink and unreadable in dark mode.
- **Voice agent feedback.** While recording (`status === 'listening'`) the mic button shows a pulsing ring (`pulseRing` keyframe) and the panel shows an animated waveform + `Naslouchám...` label, plus live interim transcript.
- **Voice panel never shows an empty box.** After recognition ends with no speech (`onend`/`onerror` → `status === 'idle'` while `panelOpen` stays true), the panel would otherwise be blank. The idle state must always render a prompt (`Klikni na mikrofon a mluv`). Keep an explicit branch for `status === 'idle' && !response && !transcript && !pendingCalls`.
- **`/api/voice` is hardened.** The route verifies the Supabase session itself (`supabase.auth.getUser()`) as defense-in-depth — not only via the middleware matcher — and enforces a per-user in-memory rate limit (10 req/60s) plus a daily cap (200/day, UTC) so no logged-in user can drain Anthropic credits. In-memory is per-instance/best-effort (resets on cold start); fine as a guardrail for a personal app.
- **Forgotten workouts auto-finish at load time, not on a timer.** A workout with no confirmed set for 45 min is closed by the `auto_finish_stale_workouts()` RPC (migration 0010), called at the top of `load()` on `/trenink` and `/trenink/[id]`. A browser timer is useless here — the app is closed exactly when it would need to fire. Length counts from the workout's origin to the LAST confirmed set **plus a fixed 10-minute reserve** (`public.workout_tail()`), never to "now"; such workouts carry `auto_finished` and show an **AUTO** badge, because the number is derived, not measured. The 10 minutes are calibrated against a real manually-finished workout, not guessed — don't retune them without a fresh calibration sample. The reserve applies only when the last activity is a set (no sets, or a bare resume, gets none). `resumed_at` records "Pokračovat v tréninku" as activity — without it, resuming and walking away throws the recorded length away.
- **Never take a workout's start from `started_at` alone.** `resume()` moves `started_at` forward, and a corrupted shift can land it after half the sets — one real row lost 63 minutes that way. Use `public.workout_origin()`: trust `started_at` when `resumed_at` is set, otherwise take the earliest of `started_at` / `created_at` / first set.
- **The exercise list of a running workout lives in `workout_exercises`, not in `workout_sets`.** A prefilled exercise has no row in `workout_sets` until its first confirmed set, so a list rebuilt from sets alone loses every exercise the user hasn't started (migration 0019 fixed it). Never persist "planned" work as empty set rows: every row in `workout_sets` is an exercise performed, and the counter, volume, PR badges, export, `workout_origin()` and `workout_last_activity()` (workout duration + auto-finish) all count them. `exerciseOrder()` merges plan first, then exercises that only have sets, so pre-0019 workouts still load. A finished workout ignores the plan — history shows what was done, not what was intended.
- **Never auto-append a set row.** Sets are added only by the user via "+ Série" (or by "Načíst minulý trénink"). An effect that kept one pending row at the end of the active exercise made the counter read 3/4 for three finished sets and the row could not be deleted — it reappeared instantly. The counter (header, chips, exercise list) counts real rows only.
- **Gym progression is judged on the TOP SET, not on every set.** The user ramps up (50/60/70), so sets 1–2 are a run-up the app does not evaluate: `targetMet()` needs enough working sets plus the target reps on the heaviest one, advice text says "top série: …", and the advice line renders under the heaviest row only. Prefilling a new exercise takes the FIRST working set of the last session (where the ramp started) — never the newest row, which is the ramp's peak — and `previous` must be in performed order, ascending, from one single past workout.
- **A workout flagged `other_gym` is never a reference.** Different gym, different machines — every query that looks for "last time" (the split template, per-exercise previous, new-exercise prefill, advice history) filters `other_gym = false`. Inside such a workout nothing is compared at all: `previous` is left empty, which drops the set badges, the "minule:" line and the comparison card in one go, and advice is suppressed.
- **`to_failure` on a set is a record only.** It must not feed volume, stats or PR badges until there is enough data to decide what it means.
- **A running focus is computed from `started_at`, never from a browser countdown.** The interval only repaints; remaining time is always derived, so a focus survives closing the app or a sleeping phone. Pause needs `paused_at` + `paused_sec` — without them an overnight pause would "run" the focus to completion. A partial unique index allows at most one open focus per user. No stats or history by design (rows are kept, just not shown).
- **Manual-% goals: steps are a checklist only.** For `typ === 'manual'` goals, progress comes from the slider (`goal.progress`), NOT from checking milestones. When such a goal has steps, show the note that ticking steps doesn't change the % (they're independent). Don't wire milestone completion into manual-% progress.
