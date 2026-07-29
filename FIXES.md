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
