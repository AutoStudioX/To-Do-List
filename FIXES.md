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

## Trénink — zadávání (D2) podle designu
Přepis `/trenink/[id]`. Logika a DB volání beze změny; přibyly jen odvozené (read-only) hodnoty.
- **Desktop: tři sloupce `300 / 1fr / 340`** — (1) seznam cviků: číslo, název, `hotové / celkem série · minule …`, aktivní červeně podbarvený, dole `+ Přidat cvik`; (2) **jeden aktivní cvik** — série s indexem `W/1/2/3`, porovnávací odznaky, ✓; pod nimi **stepper panel** `SÉRIE N` + `VÁHA` / `OPAKOVÁNÍ` + plamínek + `✓ Potvrdit sérii` + `nebo klávesa Enter`; (3) `PAUZA`, `<cvik> · POKROK` (sparkline + `1RM est.` / `Objem dnes` / `Vs. minule`), `MINULÝ <split> · datum` se sériemi.
- **Hlavička**: progress bar zaplnění sérií; na mobilu místo něj `název cviku` + `cvik 1/5 · N série hotové`.
- **Mobil**: bloky stacknuté, **stepper panel přilepený dole** v palcové zóně (velké ±60px, `Potvrdit sérii` 64px), pauza jako řádek v obsahu.
- **Přepínání cviků jedním tapem** (nad rámec designu, na přání): **přilepený vodorovný proužek chipů** pod hlavičkou — vždy viditelný, netřeba scrollovat nahoru.
- **Prázdný stav** dle mobilní obrazovky 2: `Zatím žádný cvik` + náhled `MINULÝ <split> · datum` + **`⟳ Načíst minulý trénink`** + `+ Přidat cvik`.
- **Pauza se NIKDY nespouští sama** — jen na tap (`Spustit pauzu` / `Spustit`), pak `+30 s` / `Přeskočit`.
- Nové: `components/gym/ExerciseSparkline.tsx`. Smazáno: `components/gym/NumberStepper.tsx` (nahrazen steppery v panelu — žádný mrtvý kód).
- Ověřeno na **1440px i 390px** proti designu na reálné komponentě (dočasný mock v `load()`, odstraněn); `next build` prochází.

## Trénink — detail cviku (D3) jako samostatná stránka + dialogy
- **Detail cviku už není modál.** Nová route **`/trenink/cvik/[id]`**, celá šířka, tlačítko zpět v hlavičce. Ikona grafu v zadávání na ni routuje.
- **Layout dle D3**: hlavička (zpět · název · `svalová partie · N tréninků` · pilulky `8 týdnů / 6 měsíců / Vše`); dva sloupce — **vlevo** řádek 4 dlaždic (`1RM EST.`, `MAX VÁHA`, `ZA 8 TÝDNŮ` zeleně, `OBJEM / TRÉNINK`) + velká karta **`MAX VÁHA V ČASE`** s legendou a **kombinovaným grafem** (šedé sloupce objemu na pozadí, červená spojnice max váhy, poslední bod větší); **vpravo** `HISTORIE SÉRIÍ` — karta po tréninku (datum + objem, série jako chipy), **aktuální trénink zeleně orámovaný**, odznak `PR OBJEM` u nejobjemnějšího, dole `Zobrazit všech N tréninků`. Mobil stackuje, pilulky na vlastním řádku.
- Smazán `components/gym/ExerciseChart.tsx` (nahradila ho stránka) — žádný mrtvý kód.
- **Warm-up série je neutrální**, ne zelená. Zelená = „počítá se do statistik“, warm-up ne. Místo písmene `W` je **ikona plamínku** (stejná jako v přepínači v panelu), oranžová.
- **Konec nativních `confirm()`**: mazání tréninku, cviku i série jde přes existující `useConfirm()` (`ConfirmDialog`) — text s konkrétním předmětem + `Nejde to vrátit.`, Zrušit / červené potvrzení, **Esc**, klik mimo, **focus na destruktivním tlačítku**. Po akci **toast** (`useToast`), chyba červeně i s důvodem. Toast zkrácen na 3 s.
- Grep celé appky: nativní `confirm(` byl **jen v tréninku**; ostatní stránky už používaly vlastní hook. Žádné `alert(` ani `prompt(` nikde.
- Pozn.: v grafu měly dvě osy Y vlevo — druhá (skrytá, pro objem) přebíjela popisky té viditelné; opraveno `orientation="right"`.

## Trénink — stav probíhá / ukončený (migrace 0007)
**Bug:** po ukončení tréninku se při znovuotevření rozeběhl čas znovu — ukončený trénink se tvářil jako běžící (čas se počítal z `created_at`).

### Rozhodnutí: žádný sloupec `status`, ale ANO nový `started_at`
- **Stav jde odvodit z `duration_min`** — zapisuje ho jen `finish()` a je `NULL`, dokud se trénink neukončí. Samostatný `status` by byl druhý zdroj pravdy pro totéž.
- **Na návaznost času to ale nestačí.** Běžící stopky se počítaly z `created_at`, což je vznik ŘÁDKU, ne počátek měření. Ukončíš v 52. minutě, vrátíš se za pět hodin → `now − created_at` = 5:00:00. Aby šlo navázat na 52:00, musí se počátek posunout — proto **jeden** nový sloupec `started_at`.

```
běží     → duration_min IS NULL,     elapsed = now() − started_at
ukončeno → duration_min IS NOT NULL, elapsed = duration_min minut
finish() → duration_min = round((now() − started_at) / 60)
resume() → started_at = now() − duration_min minut, duration_min = NULL
```
Kompromis: `duration_min` jsou celé minuty, takže jedno pokračování zaokrouhlí sekundy na `:00`. Ukládat sekundy by chtělo druhý sloupec bez praktického přínosu.

### Chování
- **Ukončený**: čas stojí a ukazuje uloženou délku; `Ukončit trénink` zmizí, místo něj **`Pokračovat v tréninku`** (na mobilu `Pokračovat`, délka se přidá do podtitulku); pruh s vysvětlením.
- **Pokračovat**: vrátí trénink do běhu a čas **naváže** na uloženou hodnotu, nezačíná od nuly.
- **Prohlížení nic nezapisuje**: otevření je čistě čtecí. Zamčeno je potvrzení série, výběr série do panelu, stepper panel, `+ Série`, `Přidat cvik`, přeuspořádání/odebrání cviku, pauza i `Načíst minulý trénink`. Hlídaný je i efekt, který jinak dopisuje prázdnou sérii na konec — u ukončeného tréninku se nespustí.

### Ověřeno (1440 i 390, tmavý režim)
Ukončený: čas `52:00` stojí i po 3 s, všechna potvrzovací tlačítka `disabled`, žádný stepper panel / `+ Série` / `Přidat cvik` / pauza. Běžící: čas tiká (32:25 → 32:27), tlačítko `Ukončit trénink`. Návaznost: `started_at = now − 52 min` → elapsed `52:00`, tedy pokračuje, ne od nuly.

⚠️ **Spusť `supabase/migrations/0007_workout_started_at.sql`** — bez něj `Pokračovat` selže (sloupec `started_at` neexistuje) a zobrazí červený toast s důvodem.

## Modál „Přidat cvik" — výsledky pod klávesnicí (mobil)
**Bug:** při psaní do hledání se výsledky schovaly pod klávesnici. Příčina: spodní sheet měl `max-height: 92vh` a celý modál scrolloval. **Na iOS klávesnice `vh` nemění** — mění jen *visual viewport*, takže sheet zůstal 92 % *layout* viewportu a jeho spodek (= výsledky) skončil pod klávesnicí.

### Fix
- **`components/Modal.tsx` sleduje `window.visualViewport`** (`resize` + `scroll`) a overlay se sám nastaví na `height: vv.height` + `translateY(vv.offsetTop)`. Sheet je tím pádem ukotvený nad klávesnicí, ne pod ní.
- Výška obsahu je teď **v procentech overlaye** (`85 %`, na mobilu `92 %`), ne ve `vh` — procenta se počítají z už zmenšeného overlaye. `max-height: 92vh` v `globals.css` → `92 %`.
- **Modál je flex sloupec**: hlavička `flex-shrink: 0`, tělo `flex: 1; min-height: 0`. Scrolluje tělo, ne celý modál — hlavička nikdy neuteče.
- Nový prop **`bodyFill`**: tělo nescrolluje samo a nechá dítě, ať si scroll řídí. Používá ho jen picker.
- **`ExercisePicker`**: vyhledávací pole `flex-shrink: 0` (zafixované nahoře), seznam `flex: 1; overflow-y: auto` s **`min-height: 150px` = 3 řádky vždy vidět**. Řádky `flex-shrink: 0`, ať se nesmáčknou.
- Pole hledání má `font-size: 16` — pod 16px iOS při fokusu zoomuje stránku a rozhodí layout.

### Ověřeno
Simulace zmenšeného visual viewportu (výška, která telefonu zbude s klávesnicí):
- **390×420**: sheet končí přesně na 420 (nad klávesnicí), pole vidět, **4 řádky** celé vidět, seznam scrolluje.
- **390×330** (malý telefon, velká klávesnice): sheet 304 px končí na 330, pole zůstává na místě i po odscrollování seznamu, **přesně 3 řádky** celé vidět — limit `min-height: 150` drží.
- Bez klávesnice 390×844 a desktop 1440×900 beze změny; ověřen i modál `Nový úkol` (Modal je sdílený) — bez regrese.

⚠️ **Neověřeno na reálném iPhonu** — nemám ho k dispozici a nástroj pro simulátor umí jen nativní aplikace, ne Safari s klávesnicí. Ověřeno zmenšeným viewportem, což je totéž, co s klávesnicí udělá `visualViewport`. Reálný iPhone prosím projeď ty.

## Trénink — stepper panel jen na vyžádání
**Problém:** panel pro potvrzení série byl na mobilu pořád vidět a zabíral spodní třetinu obrazovky.

- **Výchozí stav: skrytý** (na mobilu i na desktopu).
- **Otevře se**: tapem na `+ Série` (rovnou na nově přidané sérii) nebo tapem na sérii v seznamu.
- **Zavře se**: tapem/klikem **mimo panel**, křížkem v hlavičce panelu, po **potvrzení série**, po smazání série a při přepnutí cviku.
- Zavírání mimo poslouchá `pointerdown` na dokumentu, takže **funguje i myší na desktopu**. Posluchač se registruje až když je panel otevřený, aby ho neshodil ten samý tap, který ho otevírá.
- Klávesa `Enter` potvrzuje sérii jen když je panel na obrazovce.
- Rezerva místa pod obsahem na mobilu (`MOBILE_PANEL_SPACE`) se uplatní jen když je panel otevřený — zavřený nezabírá nic.
- **Umístění beze změny**: na desktopu inline ve sloupci s cviky, na mobilu přilepený dole v palcové zóně.

**Pozn.:** panel se otevírá i tapem na **potvrzenou** sérii, ne jen na neposlanou — jinak by nešlo potvrzenou sérii opravit ani smazat (`Smazat sérii` je uvnitř panelu).

### Ověřeno (skutečné klikání, ne JS)
- **390×844**: panel po načtení skrytý → tap na neposlanou sérii otevřel → tap mimo zavřel → `+ Série` přidalo sérii 3 a otevřelo panel na ní → křížek zavřel → `Potvrdit sérii` zavřelo.
- **1440×900**: panel po načtení skrytý, tři sloupce beze změny → klik na sérii otevřel panel ve středním sloupci → klik mimo zavřel.

## Trénink — prázdný stav: akce do palcové zóny (mobil)
Dle mobilní obrazovky 2 z designu. **Text `Zatím žádný cvik` zůstává nahoře**, akční blok se přilepí ke spodnímu okraji nad navigaci. Pořadí zdola: `+ Přidat cvik` → `⟳ Načíst minulý trénink` → karta `MINULÝ <split> · datum`.
- Kořen stránky je na mobilu při prázdném stavu flex sloupec s `min-height: 100 %`, akční blok má `margin-top: auto`. Stejný vzor jako panel „Typ tréninku" na home.
- **Desktop beze změny** — blok zůstává v normálním toku pod textem, vycentrovaný na 520 px.

**Pozn. k hlášení „na desktopu prvky úplně chybí":** reprodukoval jsem uvedený scénář (běžící trénink → smazat všechny cviky) na 1440 px a karta `MINULÝ PUSH`, červené tlačítko i `Přidat cvik` se zobrazily správně už před touto změnou. Karta a červené tlačítko se **záměrně** skryjí, jen když pro daný split neexistuje minulý trénink (není co načíst), a všechna tlačítka se skryjí u **ukončeného** tréninku (read-only). Pokud prvky chybí i jinde, půjde nejspíš o starší nasazený build.

## Trénink — nový trénink začíná prázdný + progress v hlavičce
### 1) Žádné automatické předvyplnění
Dřív se cviky z minulého tréninku téhož splitu natáhly samy při otevření. Teď **nový trénink začíná prázdný, i když minulý existuje**, a nabídne volbu.
- `load()` staví seznam **jen z už zapsaných sérií** (`confirmed`); template se do něj nepromítá.
- Template zůstává v paměti a slouží ke dvěma věcem: **„minule: …" + porovnávací odznaky** u cviku, a **tlačítko `⟳ Načíst minulý trénink`**, které udělá to, co se dřív dělo samo (cviky včetně vah a opakování).
- Prázdný stav se tím pádem zobrazí **vždy**, když trénink nemá žádný cvik: karta `MINULÝ <split> · datum` (max 3 cviky + `+ N dalších cviků`), červené `⟳ Načíst minulý trénink`, `+ Přidat cvik`.
- Bez minulého tréninku téhož splitu karta i červené tlačítko zmizí a zbyde `+ Přidat cvik` (beze změny).

### 2) Progress bar a počítadlo sérií v hlavičce
- **Čitatel** = potvrzené série bez warm-upu, **jmenovatel** = všechny řádky sérií napříč cviky bez warm-upu.
- **Desktop**: `‹ · odznak splitu · „Dnes" · čas · „3 z 15 sérií"` + bar 180 px v řádku hlavičky.
- **Mobil**: do řádku se bar nevejde, takže je **tenký (4 px) přes celou šířku pod hlavičkou**. Podtitulek ukazuje čas i počítadlo (`33:00 · 3 z 16 sérií`).
- Na mobilu nahradilo počítadlo dřívější `cvik 1/5 · N série hotové` — pozici a postup po cvicích ukazuje přilepený proužek chipů nad seznamem, takže se informace neztratila.

### Ověřeno (1440 i 390, tmavý režim)
Nový trénink s existujícím minulým: prázdný stav, hlavička `0 z 0 sérií`. Po tapu na `Načíst minulý trénink`: 5 cviků, série předvyplněné (`85 kg × 6`), hlavička `0 z 15 sérií`. Po potvrzení dvou sérií `2 z 15` a výplň baru 24 z 180 px = přesně 2/15. Na mobilu tenký bar pod hlavičkou.

## Trénink — doporučení, kdy přidat váhu (migrace 0008)
Appka **radí, nerozhoduje**. Nikdy sama nemění váhy a nekomentuje techniku, únavu ani regeneraci — z čísel se vyčíst nedají.

### Kam patří cíl: nová tabulka `exercise_targets`, ne sloupce na `exercises`
- Většina řádků v `exercises` je **sdílený katalog** (`user_id IS NULL`). Cíl zapsaný tam by buď protékal mezi uživateli, nebo by nešel použít právě u cviků, které lidé používají nejvíc. Cíl je **záměr uživatele**, ne vlastnost pohybu — dva lidé můžou mít u stejného benche jiný cíl.
- **Ne na úroveň cviku v tréninku:** zadání říká „nastaví se jednou a dědí se". Uložení u tréninku by znamenalo kopírovat cíl do každé další session a nechat kopie rozejít. Jeden řádek na `(user, exercise)` dává dědění zadarmo — každý trénink čte tentýž řádek.
- Nepovinné: bez řádku appka jen neradí, jinak funguje stejně.

### Pravidlo
- **Splnil cíl ve všech pracovních sériích** (dost sérií a každá ≥ cílová opakování) → doporučí přidat: velké komplexní cviky **+2,5 kg**, ostatní a jednoruční **+1,25 kg** (s poznámkou, že když menší přírůstek nejde složit, dá se +2,5 kg).
- **Nesplnil** → zůstat na stejné váze.
- **Stagnace**: 3 tréninky po sobě bez zvýšení váhy i opakování → `Stagnace 3 tréninky — zkus snížit váhu o 10 % a jít znovu nahoru.` Stagnace má přednost před ostatními radami.

⚠️ **Velká/malá partie se NEDÁ odvodit z `muscle_group`** — ten u nás drží **split** (Push/Pull/Legs), ne sval. Rozlišení proto jede podle **názvu cviku** (seznam komplexních cviků: dřep, mrtvý tah, bench, tlak nad hlavu, leg press, shyby, přítahy, veslování, hip thrust, výpady, bradla). Neznámý název i cokoli s „jednoručk" spadne na menší, bezpečnější krok.

### Kde to je
- **V zadávání**: u názvu cviku chip `cíl 3×10` (tap otevře úpravu), a pod „minule:" jeden decentní řádek na celou šířku — `↗ splnil jsi cíl → zkus 52,5 kg` (zeleně) / `💡 stagnace 3 tréninky…` (oranžově). Nezasahuje do zápisu.
- **V detailu cviku (D3)**: samostatná karta `DOPORUČENÍ` s odůvodněním a připomenutím cíle.

### Ověřeno
- **24 jednotkových testů** logiky (rozlišení velký/malý cvik, krok, splnění cíle vč. ignorování warm-upu, stagnace vs. progres, chování bez cíle i bez historie) — všechny prošly.
- Cestou opraven `fmtWeight`: zaokrouhloval na jedno desetinné místo, takže krok 1,25 kg ukazoval `21,3` místo `21,25`.
- V prohlížeči na **1440 i 390**: chip cíle, řádek s radou, modál úpravy cíle (série/opakování + zrušit cíl), karta v D3 pro doporučení i pro stagnaci.

⚠️ **Spusť `supabase/migrations/0008_exercise_targets.sql`** — bez ní nejde cíl uložit (tabulka neexistuje) a objeví se červený toast s důvodem.

## Trénink — krok váhy se počítá sám + přímé zadání (migrace 0009)
### Krok už se nenastavuje ručně
Rozlišení podle názvu cviku bylo křehké („Bench na šikmé lavici", vlastní cviky). Krok se teď **počítá z aktuální váhy** (~2,5–5 %, zaokrouhleno nahoru na reálný přírůstek):

| váha | krok |
|---|---|
| do 20 kg | +1,25 kg |
| 20–100 kg | +2,5 kg |
| nad 100 kg | +5 kg |

**Jednoruční cviky → poloviční krok** (přidává se na obě strany). Podlaha je 1,25 kg — polovina nejnižšího pásma je 0,625 kg, což nikdo nesloží.

Migrace **0009** přidává `exercise_targets.step_kg` (default 2,5). **Není to uživatelské nastavení** — sloupec se plní vypočítanou hodnotou při uložení cíle. Rada i tlačítka +/− počítají krok živě z aktuální váhy. V modálu cíle zůstalo jen **série × opakování**.

### Přímé zadání a dvojí krok
Nová komponenta `components/gym/StepperField.tsx`:
- **Tap na číslo** otevře numerickou klávesnici a jde napsat libovolná hodnota (23, 27, 34…). Desetinná **čárka i tečka**. `inputMode="decimal"`, písmo **26 px** (pod 16 px by iOS zoomoval stránku).
- **+/− podle cviku** — krok se řídí aktuální váhou v poli, ne natvrdo 2,5.
- **Dlouhý stisk** (450 ms) přepne na **5× krok** a opakuje — z 20 na 60 kg netřeba klikat 16×.

### Ověřeno
Zadané případy sedí: **12,5 → „zkus 13,75 kg"**, **50 → „zkus 52,5 kg"**, **110 → „zkus 115 kg"**. K tomu 15 jednotkových testů (hranice pásem 20/100 kg, jednoručky, podlaha 1,25, růst kroku s váhou). V prohlížeči na **1440 i 390**: napsáno `23,5` → řádek i pole `23,5 kg` → tap `+` → `26 kg`; jednoručka 30 kg → `+1,25`; dlouhý stisk 110 → 160 kg.

**Cestou opraveny dvě reálné chyby ve stepperu:**
1. Opakování při dlouhém stisku si drželo starou hodnotu, takže skočilo jen jednou — čte se přes ref.
2. Rozepsaný text v poli přežil změnu hodnoty zvenčí (řádek ukazoval 170 kg, pole 12,5) — draft se zahodí, když se hodnota změní mimo psaní.

## Trénink — automatické ukončení zapomenutého tréninku (migrace 0010 + 0011)
### Problém
Trénink se ukončuje ručně. Když se na to zapomene, `duration_min` zůstane NULL, hodiny běží dál a v historii jsou tréninky po 500 minutách.

### Pravidlo
- **45 minut bez potvrzené série** → trénink se sám ukončí.
- **Délka = od začátku tréninku do POSLEDNÍ potvrzené série + 10 min rezerva**, ne do okamžiku ukončení. Čas na gauči s otevřeným tréninkem do tréninku nepatří.
- V historii dostane takový trénink oranžovou značku **AUTO** (+ vysvětlující pruh v detailu), protože číslo je dopočítané, ne naměřené.

### Rezerva 10 min — proč zrovna tolik
Po poslední sérii ještě něco trvá: dokončení série, odpočinek, sbalení. Číslo **není odhad od stolu** — trénink **Pull 4. 8. 2026** je čistý kalibrační vzorek (ukončený ručně, bez resume, origin sedí) a mezi poslední sérií a uloženým koncem uběhlo **9,8 min**. Zvažovaná varianta „průměrná pauza mezi sériemi" dává 4,6–5,0 min, tedy zhruba polovinu skutečnosti.

| | do poslední série | + průměrná pauza | + pevných 10 min | reálně |
|---|---|---|---|---|
| Pull 4. 8. (kalibrace) | 115,2 | 119,7 | **125,2** | 125 (uloženo ručně) |
| Legs 1. 8. | 130,0 | 135,0 | 140,0 | ~130 (odhad) |
| Push 8. 8. | 106,9 | 111,8 | 116,9 | ~140 (odhad) |

U Push chybí i po opravě originu ~33 min, které v datech nejsou (poslední série 8:23 a pak nic) — žádná rozumná rezerva to nepokryje. Rozhodlo, že kalibrace na reálně ukončeném tréninku je pevnější podklad než odhad po paměti.

**Rezerva se přičítá jen tehdy, když je poslední aktivitou SÉRIE.** Trénink bez jediné série (1 min) a trénink, kde poslední aktivitou bylo „Pokračovat" a pak už nic, ji nedostanou — není co dobalovat.

### Origin — začátek se nesmí brát ze `started_at` naslepo
Reálná chyba nalezená v datech: **Legs 1. 8. 2026** má `started_at` **08:13**, ale `created_at` **07:10** a **14 z 26 sérií leží před `started_at`**. Počítáno od `started_at` vyšlo **67 min místo reálných 130** — první hodina tréninku vypadla. (Že to udělal `resume()`, prozrazuje přesnost: `created_at` má mikrosekundy z Postgresu, `started_at` jen milisekundy, což je tvar z `new Date().toISOString()`.) Pauzy mezi sériemi jsou přitom normální — průměr 5,0 min, nejdelší 14,7 min. Dlouhé pauzy to nebyly.

Řeší to `public.workout_origin()`:
- `resumed_at` **vyplněné** → posun `started_at` je záměrný (vyřazuje čas mimo posilovnu), věř mu.
- `resumed_at` **prázdné** → start nemá co být za první sérií; bere se nejstarší ze `started_at` / `created_at` / první série.

Ověřeno, že to nerozbije legitimní resume: trénink vytvořený v 8:00, série 8:05–9:00, resume ve 14:00 (`started_at` 13:00), série do 14:30 → **90 min**, ne 390.

### Kontrola běží při načtení, ne časovačem v prohlížeči
Appka je zavřená přesně v tu chvíli, kdy by časovač měl spustit. Úklid je proto **jedno RPC** (`auto_finish_stale_workouts`) volané na začátku `load()` na `/trenink` i `/trenink/[id]`. Projde **všechny** běžící tréninky uživatele naráz — i ty, které nikdo neotevřel — a doběhne i po týdnu.

Funkce je `SECURITY INVOKER`, takže ji RLS politika „own workouts" drží na vlastních řádcích; `SECURITY DEFINER` by tu byl zbytečná díra. Když migrace ještě neproběhla, RPC vrátí `PGRST202` a `lib/autoFinish.ts` ho **záměrně přejde mlčky** — jinak by při každém načtení stránky vyskočil červený toast. Jiné chyby se hlásí.

### `resumed_at` — proč sloupec navíc
Bez něj: trénink se auto-ukončí na 52 min → uživatel dá **Pokračovat** (`started_at` se posune zpět o 52 min) → nic nezapíše → další kontrola vidí jen staré série, spočítá zápornou délku, clamp na 1 min a **52 minut je pryč**. Návrat do tréninku je taky aktivita, takže se ukládá a počítá jako poslední aktivita.

Poslední aktivita = `max(série.created_at)`, jinak `resumed_at`, jinak `started_at`. Série vzniká jako řádek až potvrzením, takže `created_at` série **je** okamžik potvrzení.

**Známé omezení:** úprava už potvrzené série je UPDATE, který `created_at` nemění. Kdo 45 minut jen přepisuje staré série a žádnou novou nepotvrdí, tomu se trénink ukončí. Na to by byl potřeba další sloupec `updated_at` a nestojí to za to.

### Ověřeno proti reálnému Postgresu
8 scénářů přes `auto_finish_stale_workouts()`:

| případ | výsledek |
|---|---|
| zapomenutý (start −5 h, poslední série −4 h) | 70 min (60 + rezerva), auto |
| aktivní (série před 5 min) | nedotčeno |
| nečinnost 44 min | nedotčeno (pod limitem) |
| nečinnost 46 min | 54 min |
| prázdný trénink bez série | 1 min (bez rezervy) |
| **po Pokračovat bez nové série** | **52 min zůstalo** (bez rezervy) |
| jen warm-up série | počítá se jako aktivita |
| už ukončený (`duration_min` vyplněné) | nedotčeno |
| **replika Legs 1. 8. (posunutý start)** | **308 → 140 min** |
| **replika Push 8. 8.** | **545 → 117 min** |
| legitimní resume (8:00 / 13:00 / 14:30) | 90 min, ne 390 |

V prohlížeči na **1440 i 390**: značka AUTO v historii (desktop i mobil), oranžový pruh „Ukončeno automaticky" v detailu, hodiny na ukončeném tréninku stojí. Ověřeno i to, že `PGRST202` před spuštěním migrace stránku nerozbije.

### Zpětný přepočet (0011)
`supabase/queries/audit_long_workouts.sql` je **dry run** — vypíše tréninky nad 3 hodiny a nová čísla. Je to schválně **jeden dotaz**: Supabase SQL Editor ukazuje jen výsledek posledního příkazu ve skriptu, takže souhrn je poslední řádek téže tabulky, ne druhý select.

Délku počítá na jednom jediném místě funkce **`workout_duration_estimate()`** (0010) — volá ji automatické ukončení, zpětný přepočet i dry run. Dry run tak nemůže ukázat jiné číslo, než jaké 0011 zapíše; ověřeno tím, že po spuštění 0011 sedí uložené hodnoty na `novy_min` z dry runu a druhý běh auditu už nenajde nic. Teprve pak se pouští `0011`, která je přepočítá stejným pravidlem. Pojistka `new < old`: přepočet má nafouknuté číslo srazit dolů, nikdy zvednout — kdo opravdu cvičil 3,5 h se sériemi přes celou dobu, o nic nepřijde.

Audit nad reálnými daty (9. 8. 2026) našel dva tréninky: **8. 8. Push 545 → 117 min** a **1. 8. Legs 308 → 140 min**. Trénink 4. 8. Pull (125 min) je pod hranicí a nemění se.

Pojistka `new < old` se v testu opravdu uplatnila: syntetický trénink uložený na 190 min by po přičtení rezervy vyšel na 200, takže zůstal nedotčený. Přepočet nikdy nenafoukne.

### Délka se zobrazuje jako „1 h 57 min"
`fmtDuration()` v `lib/gym.ts`: pod hodinu `47 min`, nad hodinu `1 h 57 min`, celé hodiny bez nuly (`2 h`, ne `2 h 0 min`). Použito v historii (mobil i desktop), v hlavičce ukončeného tréninku a v pruhu o automatickém ukončení. 15 jednotkových testů (hranice 59/60/61, celé hodiny, null/undefined/záporná hodnota → prázdný řetězec).

**Živé stopky u běžícího tréninku zůstávají `mm:ss`** — během tréninku jsou vteřiny k něčemu, `1 h 30 min 12 s` by bylo horší. Přepíná se to až po ukončení, kdy je z toho délka, ne hodiny.
