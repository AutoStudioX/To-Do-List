# FIXES

## Úkoly: podpora času u deadlinu (deadline_time)

**Co:** Úkoly uměly jen datum. Přidán volitelný čas.

### 1) Schéma — rozhodnutí
Zvoleno **(a) samostatný sloupec `deadline_time time` (nullable)**, ne (b) změna `deadline` na `timestamptz`.

Proč (a):
- `deadline` (typ `date`) zůstává beze změny → existující úkoly 100 % fungují jako dřív.
- `time` nemá timezone → lokální „08:00" se uloží a načte jako „08:00" (žádný posun na UTC/„06:00"). Ověřeno proti Postgresu s `TZ=Europe/Prague`.
- `NULL` = bez času; `timestamptz` by neuměl odlišit „bez času" od reálné „00:00".
- Většina úkolů čas mít nebude → nullable bez defaultu.

Migrace: `supabase/migrations/0004_task_time.sql`. **Nutno spustit v Supabase SQL Editoru.**

### 2) UI — zadávání
Nová komponenta `components/TimePicker.tsx` (pill button group, ne select):
`Bez času` (default) · `Ráno 8:00` · `Poledne 12:00` · `Odpoledne 15:00` · `Večer 18:00` · `Vlastní čas` (→ native `time` input). Přidáno do modálu úkolu na `/ukoly` i na `/prehled`.

### 3) UI — zobrazení
Seznam úkolů (`components/TaskRow.tsx`, `/prehled`): když je čas, zobrazí se u data jako „31. 7. 2026 **v 8:00**"; bez času jen datum jako dřív.
Řazení (`lib/taskTime.ts` → `deadlineSortKey`): v rámci dne podle času, úkoly bez času až za timed, bez deadlinu úplně nakonec.

### 4) API (Jarvis / voice)
`app/api/voice/route.ts`: `add_task` a `update_task` dostaly pole `cas` (HH:MM); system prompt teď plní `cas` místo psaní času do názvu. `components/VoiceAgent.tsx` zapisuje `deadline_time`. Externí zápisy přes Supabase REST fungují automaticky (sloupec je vystaven PostgREST).

### 5) Zpětná kompatibilita
Ověřeno na Postgresu: po migraci má legacy úkol `deadline_time = NULL` a načítá/zobrazuje se stejně jako dřív.

### Verifikace (v prohlížeči, ne buildem)
- Migrace + no-tz-shift + backward compat: reálný lokální Postgres (TZ Europe/Prague) — legacy řádek beze změny, `08:00` čteno zpět jako `08:00`.
- TimePicker UI: dočasný harness na login stránce (public), ovládnuto v prohlížeči — quick volby, vlastní čas 9:30, „Bez času", zvýraznění pilulek i zobrazení „… v H:MM" ověřeno; harness poté smazán. (Fix: doplněny `key` u mapovaných pilulek.)
- Plné plochy `/ukoly` a `/prehled` jsou za přihlášením, které nebylo možné projít (login zamčený + zákaz zadávání hesel) — ověřeno tedy izolovaně komponentou + DB.

## Trénink v posilovně (gym section)

Nová sekce `/trenink` — rychlý zápis tréninku (cíl: série na 2 tapy).

### Schéma (migrace `supabase/migrations/0005_gym.sql` — NUTNO spustit v Supabase)
- `exercises` (katalog: `user_id` NULL = globální, `is_custom`; RLS: čti globální+svoje, zapisuj jen svoje) — seed 24 cviků (8 Push / 8 Pull / 8 Legs).
- `workouts` (`date`, `split_type` Push/Pull/Legs, `note`, `duration_min`; RLS owner-only).
- `workout_sets` (`weight_kg` **numeric** ne text, `reps` int, `rpe` int null, `is_warmup` bool, `order_index`; RLS přes vlastnictví workoutu). Ověřeno na Postgresu: RLS on, katalog=24, weight numeric, „minule" dotaz vrací working sety bez warm-upu.

### UI
- `/trenink`: „Nový trénink" → pill Push/Pull/Legs (předvybraný podle rotace z posledního tréninku) → založí workout. + historie (datum, split badge, počet sérií, délka).
- `/trenink/[id]`: aktivní trénink. Po volbě splitu se **předvyplní cviky z posledního tréninku téhož splitu** (váhy/opakování jako šedé placeholdery). Řádek série: warm-up (plamínek) | váha × opakování | ✓. **Tap ✓ = potvrdí sérii jak je (2-tap průchod)** → insert. Tap na číslo → stepper (velká +/− 2,5 kg / 1 op. + přímé zadání). „+ Série" kopíruje poslední. Cviky lze přidat (ExercisePicker: katalog + vlastní), smazat, přeuspořádat (šipky). U cviku „minule: 80 kg × 8, 80 × 7, 75 × 8". Klik na název cviku → graf max. váhy v čase (ExerciseChart).
- Komponenty: `components/gym/NumberStepper.tsx`, `ExercisePicker.tsx`, `ExerciseChart.tsx`. Helpery `lib/gym.ts`.
- Navigace: „Trénink" (Dumbbell) přidán do BottomNav i Sidebar.

### Pravidla dodržena
44px tap targety, ovládání palcem, button groups místo dropdownů, jen lucide ikony (žádné emoji), mobile-first. Bez timerů / plánů / 1RM (dle „co nedělat").

### Verifikace
Migrace + RLS + „minule" logika: reálný lokální Postgres. UI na **375px v prohlížeči**: split pilulky, prefill šedě, ✓ potvrzení (řádek zezelená), stepper editor, „minule" formát, dolní nav s Tréninkem — ověřeno přes dočasnou veřejnou demo route (smazána). Plné `/trenink` je za přihlášením, které nešlo projít (login zamčený + zákaz hesel), proto ověřeno komponentami + DB.

### Pozn.
Pro okamžitou realtime synchronizaci přidej tabulky do publikace:
`alter publication supabase_realtime add table public.workouts, public.workout_sets, public.exercises;`
(Bez toho appka syncuje přes poll/focus, jen ne okamžitě.)

## Trénink — mazání tréninku + vlastní split (0006)
- **Mazání tréninku**: v historii (`/trenink`) má každý řádek ikonu koše → confirm → smaže workout (série padnou přes `on delete cascade` z 0005). Řádek přestal být jeden velký `<button>` (nešlo vnořit další tlačítko) — teď je to `div` s klikací částí + samostatným košem (44px).
- **Vlastní typ splitu**: čtvrtá pilulka „Vlastní" vedle Push/Pull/Legs → odkryje textové pole (název, max 40 znaků, např. „Full body", „Ruce", „Kardio"). Uloží se do `split_type` jako libovolný text.
- Migrace **`0006_workout_custom_split.sql`**: `drop constraint workouts_split_type_check` (0005 to omezovalo jen na Push/Pull/Legs). SPUSTIT v SQL Editoru, jinak insert vlastního splitu selže.
- `split_type` v `lib/types.ts` uvolněn na `string | null`. Barvy: `splitColor(s)` helper v `lib/gym.ts` — tři defaulty drží svou barvu, vlastní = fialová (#7c3aed). `nextSplit` vlastní názvy ignoruje (nabídne Push). Detail i home page používají helper.

## Trénink — redesign (Claude Design) + odvozené metriky
Přepis vzhledu celé sekce dle nového designu. **Veškerá logika/handlery/DB volání zachovány** (2-tap zápis, prefill z minula, add/del/reorder cviku, warm-up, custom split, mazání tréninku). Přidány jen **read-only odvozené výpočty nad stávajícími tabulkami — bez změny schématu.**
- **Home (`app/trenink/page.tsx`)**: hlavička s posledním tréninkem; **TENTO TÝDEN** dlaždice (počet tréninků / objem-tonáž + % vs. minulý týden / počet sérií); karta nového tréninku s **náhledem minulého splitu** (top-set souhrn); **HISTORIE** s filtrem Vše/Push/Pull/Legs a top-set souhrnem řádku. Objem = Σ váha×opak. bez warm-upu.
- **Aktivní (`app/trenink/[id]/page.tsx`)**: číslované cviky, **běžící čas tréninku** + „X z Y sérií" v hlavičce, porovnávací **odznaky** u potvrzených sérií (`= minule` / `+N rep` / `+váha` / `PR objem`), **rest timer** dole. ⚠️ **Rest timer se NIKDY nespouští sám** — jen na tap „Pauza" (+30 s / ×). Auto-odpočet po sérii by byl otravný.
- **Detail cviku (`components/gym/ExerciseChart.tsx`)**: dlaždice **1RM odhad (Epley), max váha, Δ za 8 týdnů, objem/trénink**; záložky rozsahu **8 týdnů / 6 měsíců / vše**; graf max váhy; **historie sérií** s „PR objem" odznakem.
- Helpery v `lib/gym.ts`: `startOfWeek`, `volume`, `fmtTonnage`, `pctDelta`, `epley1RM`, `topSet`, `fmtSet`.
- Styl: inline (konzistence s appkou, žádné CSS soubory). Barvy přes CSS vars (theme-aware), akcent #E8192C, split barvy z `splitColor()`.
- **Pozn.:** předchozí pravidlo „bez timerů/1RM" bylo na výslovnou žádost uživatele zrušeno (timer jen na tap, 1RM jako odhad).
- Desktop: obsah vycentrovaný na max 720px (neroztahuje se). Ověřeno na 390px i 1440px přes dočasnou demo route (smazána); plné `/trenink` je za loginem, proto vizuál přes demo + logika typecheckem.
