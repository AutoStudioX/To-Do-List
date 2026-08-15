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

## Trénink — fantom série, obrácené „minule" a rada podle top série
### 1) Prázdná série navíc u každého cviku
Efekt v `app/trenink/[id]/page.tsx` po každém potvrzení dolepil na konec aktivního cviku prázdnou nepotvrzenou sérii. Tři odcvičené série se ukazovaly jako **3/4** a smazat to nešlo — smazání efekt okamžitě vrátil.

Efekt je pryč, novou sérii přidává výhradně uživatel přes **„+ Série"**. Zrušena i mrtvá větev v `load()`, která totéž dělala při načtení (`order` vzniká jen z potvrzených sérií, takže se do ní nikdy netrefila).

Počítadlo v hlavičce, v chipech i v seznamu cviků teď počítá jen skutečné řádky. Ověřeno na reálném tréninku: **22 z 23 → 22 z 22**, a po smazání ručně přidané série **22/23 → 22/22**, tentokrát natrvalo.

**Co zůstalo:** přidání cviku přes „Přidat cvik" pořád založí jeden řádek — je to série, kterou se chystáš zapsat, jde smazat a nevrací se. Prázdný cvik bez řádku by neměl co editovat ve stepperu.

### 2) Doporučená váha brala vrchol rampy
`addExercise()` tahal historii jedním dotazem `order(created_at, desc).limit(12)`. „Nejnovější" série je ale **poslední série rampy, tedy nejtěžší** — a ta se lepila do série 1. U Bench pressu (minule 50/60/70) začínala série 1 na **70 kg**.

Stejné pole plnilo i „minule: …", takže bylo **pozpátku** a série 1 se porovnávala s vrcholem minula místo se svým protějškem (`previous[čísloSérie−1]`). Limit navíc míchal série z různých tréninků a warm-upy se filtrovaly až po něm.

Teď dva dotazy: nejdřív **ze kterého tréninku**, pak **všechny jeho série vzestupně**. Série 1 startuje tam, kde minule startovala rampa. Ověřeno v prohlížeči na cviku Zkrcovačky: `minule: 23 kg × 10, 24 × 10, 32 × 10` a série 1 předvyplněná na **23 kg** (dřív by to bylo 32).

### 3) Rada se vztahuje k TOP SÉRII
Model počítal se straight sets, ale rampa 50/60/70 × 10 „splnila cíl 3×10" vždycky — všechny série mají 10 opakování, i když se vrchol vůbec nezvedl.

- `targetMet()` teď žádá **dost pracovních sérií celkem** a **cílový počet opakování na nejtěžší z nich**. Náběh se neposuzuje.
- `topSet()` při shodné váze bere sérii s **víc opakováními** (85 × 8 místo 85 × 6).
- Texty mluví o vrcholu: `top série: zkus 72,5 kg`, `Top série 70 kg × 10 splnila cíl 3×10 — zkus 72,5 kg (+2,5 kg).`
- Rada se zobrazuje **jen pod nejtěžší sérií**, ne jako řádek nad celým cvikem. Při shodné váze visí u pozdějšího řádku, aby seděla na tom, který právě děláš.

14 jednotkových testů: rampa s vrcholem na 10 → increase; rampa s vrcholem na 6 → hold; straight sets; málo sérií; warm-up se nepočítá; náběh na 8 opakování už cíl nezabíjí; jednoručka 30 kg → `zkus 31,25 kg`; stagnace vyhrává nad cílem; shodná váha → vyšší opakování.

Ověřeno na **1440 i 390**: rada `top série: zkus 40 kg` visí u Tlaků na ramena pod sérií 4 (36 kg, nejtěžší), pod sériemi 1–3 ne.

### 4) „+ Série" bere odpovídající sérii z minula, ne řádek nad sebou
Nová série se předvyplňovala kopií předchozího řádku, což **zplošťovalo rampu**: z minulých 25/35/35 vzniklo 25/25/25, protože série 2 opsala 25 a série 3 zase 25.

Teď se indexuje **pořadím pracovní série** do `previous` (warm-upy se nepočítají), takže série N dostane N-tou sérii minulého tréninku. Když minulý trénink tolik sérií neměl, chování zůstává původní — opsat poslední řádek.

Hodnota z minula se značí jako `předvyplněno` (šedý řádek), opsaný řádek ne — je vidět, odkud číslo je.

Ověřeno na Zkrcovačkách (minule 23/24/32) na **1440 i 390**: série 1 → 23, „+ Série" → 24, „+ Série" → 32, „+ Série" → 32 (minulý trénink měl jen tři, takže se opsal poslední řádek).

## Trénink — odznaky sérií a prázdná karta „Vs. minule"
### Diagnóza: „minule" se bralo jen z tréninku STEJNÉHO SPLITU
`previous` se v `load()` plnilo ze šablony, tedy z posledního tréninku se stejným `split_type`. Když žádný takový nebyl (první Push v historii), bylo `previous` prázdné **pro všechny cviky naráz** — a s ním zmizely porovnávací odznaky, řádek „minule: …" i karta **Vs. minule**, přestože data v databázi byla.

V reálných datech měl uživatel po jednom tréninku od každého splitu, takže karta byla prázdná **všude**.

Věcně to bylo špatně i jinak: cviky se opakují napříč splity (Tlaky na ramena jsou v Push i v Legs), takže vázat porovnání na split zahazuje nejbližší relevantní trénink. Navíc `addExercise()` už tohle dělal správně (poslední trénink s tím cvikem) — dvě cesty, dvě různá data.

**Oprava:** „minule" = poslední trénink, ve kterém byl **ten cvik**, bez ohledu na split. Dva dotazy (ze kterého tréninku → jeho série vzestupně), obojí bez umělého limitu. Popisek karty v pravém sloupci proto už netvrdí split: **`MINULE · 1. 8.`** místo `MINULÝ PUSH · …`. Šablona zůstává split-based, ta slouží tlačítku „Načíst minulý trénink" a to je správně.

### PR podle VÁHY, ne podle objemu
`setBadge` počítal objemové PR: `váha × opakování` víc než nejlepší série minule. Svítilo to i při **poklesu váhy**, když se přidala opakování (60 × 20 přebilo 70 × 10), a „PR objem" nikomu nic neříkalo.

Teď: **`PR váha`** svítí jen když je váha série vyšší než **nejvyšší váha toho cviku v minulém tréninku**. Objemové PR zrušeno.

### Odznaky pro zhoršení
Dřív se hlásily jen dobré zprávy — při menším počtu opakování nebo nižší váze nesvítilo nic. Doplněno:

| stav | odznak | barva |
|---|---|---|
| váha nad maximem minula | `PR váha` | červená |
| vyšší váha než odpovídající série | `+5 kg` | zelená |
| stejná váha, víc opakování | `+2 rep` | zelená |
| shoda | `= minule` | tlumeně |
| stejná váha, míň opakování | `-1 rep` | **tlumeně** |
| nižší váha | `-2,5 kg` | **tlumeně** |

Zhoršení není chyba, je to fakt — proto šedě, nikdy červeně. Červená zůstává PR a destruktivním akcím.

`setBadge` a `maxPrevWeight` se přestěhovaly z komponenty do `lib/gym.ts`, aby šly testovat. 14 jednotkových testů včetně případu, který dřív hlásil „PR objem" (60 × 20 proti rampě 50/60/70) a teď správně hlásí `+10 rep`.

Ověřeno na **1440 i 390** na reálných datech (Tlaky na ramena, minule 22,5/27,5/37,5): série 1 a 2 `+4,5 kg` zeleně, série 3 `-1,5 kg` šedě, série nad 37,5 `PR váha` červeně, karta **Vs. minule +29,1 %** a `MINULE · 1. 8.` s výpisem sérií.

## Trénink — „Vs. minule" u rozdělaného cviku
Karta srovnává **objem celého cviku**, takže rozpracovaný cvik byl v mínusu z principu — po první sérii ze tří hlásila −60 %, i když šlo všechno dobře.

Procento se teď ukáže, až má cvik **stejně nebo víc pracovních sérií než minule**. Do té doby tlumené **`po dokončení`**. Ověřeno na 1440: 2 ze 3 sérií → `po dokončení`, 3 ze 3 → `+8,6 %`.

## Trénink — příznak „do selhání" u série (migrace 0012)
Boolean `workout_sets.to_failure`, default false. Přepínač ve stepper panelu **napravo od „Potvrdit sérii"**, plamínek zůstává vlevo — rozložení je symetrické `plamínek | Potvrdit sérii | blesk`. Stejná velikost i tvar jako plamínek (64×64 na mobilu, 52×52 na desktopu), ikona `Zap`; neaktivní neutrální, aktivní fialový. V seznamu sérií značka `⚡ do selhání` — stejně nenápadná jako `warm-up · nepočítá se`.

**Do statistik, objemu ani PR odznaků zatím nevstupuje** — je to jen záznam. Fialová je schválně jiná než oranžová u warm-upu, ať se ty dva stavy nepletou.

## Trénink — příznak „jiná posilovna" (migrace 0013)
Boolean `workouts.other_gym`, default false. Přepínač v panelu zakládání tréninku (ikona `MapPin`, vypnuto/`bez porovnání`).

Když je zapnutý, v tréninku se **neporovnává nic**: `previous` se vůbec nestaví, takže naráz zmizí odznaky u sérií, řádek „minule: …" i karta porovnání. Karta pokroku ukazuje jen dnešní čísla (řádek „Vs. minule" se nerenderuje) plus poznámku *Jiná posilovna — bez porovnání s minulem*. Vypnutá je i **rada** — navrhovat váhy na cizích strojích nedává smysl. V historii má takový trénink fialový odznak `jiná`.

**A hlavně se nikdy nepoužije jako referenční trénink.** Filtr `other_gym = false` je na všech čtyřech místech, která hledají „minule": šablona pro „Načíst minulý trénink", per-cvik „minule" v `load()`, předvyplnění v `addExercise()` a historie pro radu. Migrace přidává částečný index přesně na tenhle dotaz.

## Trénink — export dat (CSV + JSON)
Nenápadné tlačítko vedle nadpisu HISTORIE (na mobilu jen ikona). Modál: rozsah **Vše / Poslední 3 měsíce / Poslední měsíc**, formát **CSV** nebo **JSON**.

**Jedna plochá tabulka**, řádek na sérii, sloupce tréninku se opakují — vnořená struktura se nedá otevřít v Excelu ani vložit do chatu, a přesně k tomu export je. Sloupce: `datum, split, delka_min, jina_posilovna, auto_ukonceni, cvik, poradi_cviku, serie, vaha_kg, opakovani, warm_up, do_selhani, cas_zapisu`.

Detaily, které nejsou samozřejmé:
- **CSV má středník a BOM.** Česká verze Excelu čte čárku jako oddělovač desetin, takže s čárkou by se sloupce rozsypaly; bez BOM zobrazí háčky rozbitě. Čísla mají desetinnou čárku, aby s nimi Excel počítal.
- **Warm-up se nečísluje** — sloupec `serie` je prázdný, takže filtr `serie = 1` vrátí první *pracovní* sérii.
- **Trénink bez jediné série v exportu zůstane** jako řádek s prázdnými sloupci série; jinak by z přehledu zmizel.
- Rozsah ošetřuje přetečení měsíce: 31. 5. − 3 měsíce je 28. 2., ne 3. 3.

28 jednotkových testů na `lib/gymExport.ts`. Ověřeno v prohlížeči na **1440 i 390** proti reálným datům: CSV 80 řádků se správnou hlavičkou a `72,5` s čárkou, bajty souboru začínají `EF BB BF`, JSON je pole 13klíčových objektů, dotaz obsahuje `date=gte.2026-05-09`. Stahování se při ověřování odchytávalo, takže nic nespadlo do Downloads.

## Focus — časovač na soustředěnou práci (migrace 0014)
Nová sekce `/focus`, v postranním menu i ve spodní navigaci (ikona `Crosshair`).

### Založení
Cíl jako text + čas jako button group **25 / 45 / 60 / 90** a **Vlastní** s číselným polem. Bez cíle je spuštění zablokované — focus bez cíle nedává smysl. Vlastní čas se ořezává na 1–480 minut, takže překlep typu `90000` skončí na 8 h, ne na nesmyslu v databázi.

### Během běhu
Nahoře cíl, pod ním velký odpočet, proužek uplynulého času a hlavní bar podle **vlastního progresu 0–100 %**. Progres jde měnit kdykoli — posuvníkem (krok 5 %) i tlačítky 0/25/50/75/100. Ukládá se s 500ms zpožděním, jinak by tažení posuvníkem poslalo desítky zápisů za vteřinu.

**Proužek času** je 6 px a bere barvu z `--text` (0,6 opacity), ne z `--muted` — šedá na šedé se na tmavém pozadí prakticky ztrácela. Zůstává neutrální, aby si nekonkuroval s červeným barem progresu, který je ten hlavní.

**Editace progresu je sbalená** pod tlačítkem „Upravit progres" se šipkou; hlavní bar je vidět pořád. Rozbaluje se animovaně přes `max-height` (`height: auto` se animovat nedá) a šipka se otáčí. Strop je 130 px, těsně nad skutečnou výškou obsahu (98 px na 390 i 1440) — se stropem 260 px animace „dojela" dřív, než skončila, a působila useknutě. Na finální obrazovce je ovládání otevřené rovnou, protože kvůli němu ta obrazovka je.

Ovládání **Pauza / Zrušit / Hotovo**. Zrušení jde přes `useConfirm` s konkrétním předmětem, ne přes nativní `confirm()`.

### Konec
Dvojtón přes Web Audio (žádný soubor ke stažení, funguje offline) a systémové upozornění. O svolení k upozornění se říká **až při spuštění focusu**, protože mimo gesto uživatele ho prohlížeč zahodí; bez svolení zůstane zvuk a obrazovka.

Pak přijde dotaz na finální stav splnění — **jen když progres není na 100 %**, tam už není co doplňovat a focus se zavře rovnou.

### Přežití zavření
**Zdroj pravdy je `started_at` v databázi, ne odpočet v prohlížeči.** Interval v komponentě jen překresluje číslo; kolik zbývá, se vždycky dopočítá z časů. Focus proto doběhne správně i po zavření appky nebo uspání telefonu — po otevření rovnou vyskočí obrazovka s dotazem na splnění.

Pauza má vlastní sloupce `paused_at` + `paused_sec`. Bez nich by pauza přes noc focus „dopočítala" do konce; s nimi se v pauze čas zastaví a po návratu se dluh odečte.

Unikátní částečný index drží **nejvýš jeden otevřený focus na uživatele**, takže dvojklik na Spustit nezaloží dva.

### Co tam schválně není
Žádné statistiky ani historie, podle zadání. Řádky se ale nemažou — uzavřené focusy jen zmizí z obrazovky, aby bylo z čeho stavět, až na to přijde řada.

### Ověřeno
29 jednotkových testů na `lib/focus.ts`: výpočet z času spuštění, zavřená appka na 3 hodiny → vypršelo (ne „zbývá 25 min"), pauza přes den focus nedožene, dluh z pauzy, formáty hodin, ořezy vstupů, kdy se ptát na finální stav.

Migrace ověřená proti reálnému Postgresu: dvakrát po sobě (idempotence), druhý aktivní focus spadne na `focus_one_active_idx`, po uzavření prvního další projde, `progress=150` i `duration_min=999` narazí na check constraint, RLS zapnutá s politikou `own focus`.

V prohlížeči na **1440 i 390**, ve světlém i tmavém režimu: zakládání (výchozí 25 min, vlastní čas 90000 → 8 h), běžící focus (hodiny tikají, tlačítka i posuvník mění bar), pauza (hodiny stojí na 41:00, tlačítko se mění na Pokračovat), finální obrazovka s dotazem. Spodní navigace uveze šest položek po 48 px, stránka nikde nepřetéká.

⚠️ **Spusť `supabase/migrations/0014_focus_sessions.sql`** — bez ní se focus nezaloží.

## Návyky — krok 1: data (migrace 0015)
Nová sekce podle design balíčku *Habit Tracker*. Postupuje se po krocích: data → obrazovka Dnes → Přehled a Detail.

**`habits`**: `nazev`, `podtitul`, `typ` (`bool`/`cil`), `cil`, `jednotka`, `krok`, `ikona` (název lucide), `poradi`, `zdroj`, `archivovany`. **`habit_entries`**: `habit_id`, `datum`, `hodnota`, unikát na `(habit_id, datum)`.

Tři sloupce nad rámec zadání a proč:
- **`podtitul`** — design má pod názvem druhý řádek („Ráno i večer"), jinak by se zadrátoval do kódu.
- **`klic`** — stabilní slug výchozí sady. Podle jména to nejde: uživatel si návyk přejmenuje a znovunaplnění sady i hledání „tréninku" se rozbije.
- **`zdroj`** (`rucne` / `trenink`) — dělá návyk read-only.

Check hlídá, že návyk s cílem má `cil` i `krok` — bez nich by nešel vyhodnotit ani inkrementovat.

**Napojení na trénink čtením, ne zápisem.** Pro `zdroj = 'trenink'` se do `habit_entries` nezapisuje nic; `trainingValues()` jen přečte, které dny mají trénink v `workouts`. Žádný trigger, žádná synchronizace, jediná pravda je trénink sám.

**Odvozená data se neukládají** — série, procenta, sytosti i úspěšnost počítá `lib/habits.ts` za běhu podle README. Dvě vědomé odchylky od prototypu: `dayLevel` má dělitel = počet návyků (prototyp měl natvrdo `/5`, s šestým návykem by se sytost rozjela) a `dayKey` používá místní čas (`toISOString()` by po 22:00 zapsal návyk na zítřek).

Zachováno naopak přesně: `streaks().cur` se počítá od předposledního dne dozadu a dnešek se přičte až nakonec — rozdělané ráno sérii nesrazí, teprve zítra.

43 testů na `lib/habits.ts`, migrace ověřená proti reálnému Postgresu (idempotence, všechny checky, cascade delete, RLS).

## Návyky — krok 2: obrazovka Dnes
Route `/navyky`, položka v postranním menu i ve spodní navigaci (ikona `Flame`).

**Rozměry, rozestupy a radiusy přesně z designu; barvy přes proměnné appky** (`--card`, `--border`, `--accent`, …), aby sekce držela s motivem a fungovala i ve světlém režimu. Fonty zůstávají projektové (Geist), Space Grotesk a DM Sans se nepřidávaly.

Navigační chrome z prototypu (vlastní sidebar a tab bar) se **nepřebíral** — appka má svoji navigaci, jinak by byly dvě přes sebe.

Ověřeno měřením proti README na 1440: karta `min-height 88`, `padding 18/22`, `radius 14`, `gap 20`, seznam `gap 10`, chip `44×44/12`, bool tlačítko `88×56/14`, cílový blok `260`, krok `h44/minW112/r11`, check `44×44/11`, H1 34px, datum 13px `.1em` uppercase, bar hlavičky `180×8/99`, hint `16/22` dashed. Na 390: karta `14/16`, `gap 8`, bool `56×48/13`, krok `h44/0 14/r12`, check `44×44/12`, název 15px, podtitul 12px (u cílů „1250 z 2000 ml"), Přidat návyk `h46/r12`.

**Trénink** nemá na kartě žádné tlačítko (ověřeno: `0` tlačítek) — jen statický indikátor a ikona `Link2` u podtitulu „Doplní se sám z tréninků".

**Opraveno oproti prototypu:** hint psal „Splň ještě 1 návyky". Doplněno skloňování `habitWord()` — 1 → návyk, 2–4 → návyky, 5+ → návyků.

**Dvě věci, které si vyžádaly zásah mimo sekci:**
1. Globální `h1 { font-size: 22px !important }` v mobilním media query přebíjelo inline 26px z designu. Přidána třída `h1.habits-h1` s `!important` (stejný trik jako u `.stepper-input`).
2. Sedmá položka spodní navigace přetékala o 8 px a ořezávala „Goals". Položky teď mají `flex: 1`, `min-width: 0` a `padding 0 2px` — sedm položek po 56 px se vejde přesně do 390.

## Návyky — krok 3: Přehled a Detail
Route `/navyky/prehled` a `/navyky/[id]`. Rozměry z designu, barvy přes proměnné appky.

**Přehled** — přepínač 7 / 30 / Rok (`padding 5`, `radius 12`, tlačítka `h44/0 22/r9`), karta mřížky (`28 30`, `radius 16`), dlaždice `repeat(4,1fr)` `min-height 150`.
- **Rok** = contribution graph `53 × 13px`, `gap 4`, `radius 3`, vlevo popisky Po/St/Pá
- **7 / 30 dní** = matice `230px 1fr 64px`, `gap 16`; buňky `radius 5`, `gap 8` / `6`, u 7 dní výška `44px`, u 30 `aspect-ratio 1`; skóre barevně podle plnění (≥80 % akcent, ≥50 % text, jinak tlumeně); dole **Souhrn dne** za `border-top`
- mobil: přepínač `flex 1`, matice `26px 1fr 38px`, buňky `radius 6`/`1` a `gap 6`/`1`, rok `5px`/`gap 1`, dlaždice 2×2 `min-height 118`

**Detail** — hlavička `44` zpět + `52` chip + H1 30px + pill `{n} dní v řadě`; 4 dlaždice (`18 20`, `radius 14`); „Rok po dnech" se sytostí podle plnění **tohoto** návyku; „Posledních 14 dní" se škálováním **k maximu v okně, ne k cíli**, u ano/ne mají nesplněné sloupce 28 % výšky.

### Odchylky od prototypu — vědomé
- **Série v detailu sjednocena s Přehledem.** Prototyp počítal zpětně včetně dneška a lámal se hned, takže návyk nesplněný dnes ukazoval „0 dní v řadě" i s týdnem za sebou. `habitStreaks()` teď jede přes stejný `streaks()` jako Přehled — rozdělaný dnešek sérii nesrazí.
- **„letos na jaře" nahrazeno skutečným obdobím.** `longestStreakSpan()` najde, kde nejdelší série ležela, `fmtMonthSpan()` z toho udělá „duben – květen".
- **Odsazení roční mřížky se počítá.** Prototyp má natvrdo 6 prázdných buněk; `yearGridOffset()` bere skutečný den v týdnu prvního dne okna, jinak by mřížka seděla na špatných řádcích.
- **Popisky dnů u 7denní matice jsou skutečné dny okna** (St–Út), ne fixní Po–Ne.
- **Tlačítko nastavení otevírá úpravu návyku** (název, podtitul, typ, cíl/jednotka/krok, ikona) + archivaci. Návyk „trénink" archivaci nenabízí — bez něj by zmizel návyk, ale tréninky ne. Archivace místo mazání, historie v `habit_entries` zůstává.
- **Přepínač návyků je vodorovný pás chipů**, protože sidebar z designu nepřebíráme.

### Chyby nalezené při ověřování
1. **Graf 14 dní byl prázdný.** Sloupce měly `height: 100%` proti řádku s `align-items: flex-end`, takže se procentní výška neměla oč opřít a spadla na nulu (naměřeno: řádek 133 px, sloupec 0 px). Řádek teď nechává výchozí `stretch` a zarovnává se uvnitř sloupce.
2. **H1 v Detailu mělo na mobilu 26 px místo 20.** Třída `habits-h1` z kroku 2 měla velikost natvrdo; teď bere `var(--habits-h1)`, kterou si každá obrazovka nastaví sama.

12 nových testů (série návyku, období nejdelší série, odsazení mřížky, barva skóre) — celkem **55** na `lib/habits.ts`.

Ověřeno měřením na **1440 i 390** ve všech třech rozsazích: přepínač, matice, roční mřížka, dlaždice, hlavička detailu, pill, graf i mini mřížka sedí na hodnoty z README; nic nepřetéká a všechny tap targety jsou ≥ 44 px.

## Habits — přejmenování, režim úprav, čas a dny (migrace 0016)
### Přejmenování na Habits
Route `/navyky` → `/habits` (i podstránky), navigace i nadpisy. Staré adresy přesměrované v `next.config.ts` (`/navyky` i `/navyky/:path*`), aby záložky fungovaly dál — stejné pravidlo jako u `/goals` → `/goaly`.

**i18n klíče přejmenovat nešlo — appka žádnou i18n vrstvu nemá**, všechny texty jsou napsané přímo v komponentách. Zůstalo tedy u navigace, nadpisů a routy.

### Režim úprav
Tlačítko s tužkou vedle „Přidat návyk" (na mobilu ikona vedle Přehledu). Po zapnutí karta místo ovládání splnění ukazuje: šipky nahoru/dolů, úpravu obsahu a koš. Vypnutí vrátí normální zobrazení.

Mazání jde přes `useConfirm` s konkrétním předmětem a upozorněním, že zmizí i historie. Každá akce končí toastem. **Návyk „trénink" nemá koš a nejde u něj přepnout typ** — je řízený z tréninkové sekce.

**Šipky přeskupují jen návyky bez času.** U návyku s časem rozhoduje čas, takže by přehození `poradi` nebylo vidět; tlačítka jsou proto zašedlá s vysvětlením v titulku.

### Čas a dny platnosti
`cas` (time, nullable) a `dny` (int[], 1 = pondělí; NULL nebo prázdné = každý den).

Řazení hlavní stránky: **nejdřív návyky s časem vzestupně, pod nimi ostatní podle ručního pořadí**. Čas se vypisuje nenápadně vedle názvu, bez času se nezobrazuje nic.

**Den, kdy návyk neplatil, se nesmí počítat jako nesplněný** — jinak by úterní návyk táhl statistiku dolů za všechny ostatní dny v týdnu. Proto `dayStats()`, `successRateOn()` a `habitStreaksOn()` procházejí jen platné dny; skóre v matici je `hit/platné dny`, ne `hit/30`. V matici i v grafu se neplatný den kreslí jako **prázdné místo s čárkovaným okrajem**, ne jako šedý čtvereček.

Nová výchozí sada (0016) **smaže a nahradí** návyky jednoho účtu — je zúžená přes e-mail, ostatní uživatelé si své nechají.

### Matice: čtvercové buňky a stejné mezery
Buňky se roztahovaly do šířky a svislá mezera (8 px) nesouhlasila s vodorovnou (6 px). Teď mají `aspect-ratio 1`, šířku `minmax(0, N)` s návrhovou velikostí jako stropem (desktop 48/26/13 px, mobil 38/20/5 px) a `justify-content: start`, takže se nikdy nenatáhnou do obdélníku — a když se matice do sloupce nevejde, zmenší se. Svislá mezera se rovná vodorovné. Naměřeno na 1440: buňka 19×19, `column-gap` i `row-gap` 6 px.

### Budoucí dny — prověřeno, mřížka je v pořádku
Rozsah počítá `lastDays(n)`, který **končí dneškem** (kryto testy). Roční mřížka změřena na vykreslené stránce: 371 buněk, 1 prázdná na začátku (odsazení podle dne v týdnu) a **5 prázdných na konci** — přesně zbytek aktuálního týdne, když je dnes úterý. Budoucí dny tedy nejsou šedé, ale průhledné.

Co ten dojem nejspíš dělalo: do téhle úpravy se **den, kdy návyk neplatil, kreslil jako šedá nula**, k nerozeznání od „nic jsem neudělal". S novou sadou (Focus dopoledne po/st/pá/ne, Trénink út/čt/so) je takových dnů v každém řádku většina. To je opravené výše.

12 nových testů (čas, dny platnosti, řazení, statistiky přes platné dny) — celkem **71** na `lib/habits.ts`. Migrace 0016 ověřena proti reálnému Postgresu: idempotence, rozsah `dny` 1–7, sada 9 návyků se správnými časy a dny, cizí účet nedotčený.

## Habits — mřížka od založení návyku, pevné buňky, vlastní výběr času
### Matice začíná až vznikem návyku
Den před vznikem návyku není „nesplněno", ale „neexistovalo". `existsOn()` porovná den s `created_at` a `tracksOn()` = existoval **a** platil ten den v týdnu. Statistiky i mřížky jedou přes `tracksOn`, takže návyk založený dnes má v řádku jednu buňku a skóre `0/1`, ne třicet prázdných polí.

Tři stavy buňky: **neexistoval** → nekreslí se vůbec, **existoval, ale ten den neplatil** → čárkovaně, **existoval a platil** → barva podle plnění. Platí v Přehledu (matice i souhrn dne), v ročním pohledu i v Detailu (mřížka i graf 14 dní).

### Pevné buňky místo roztahování
Buňky měly `minmax(0, N)` a roztahovaly se do šířky sloupce. Teď mají **pevnou velikost i mezeru** a `justify-content: start` — řádek smí skončit v půlce šířky.

Hodnoty vzaté **změřením prototypu**, ne z hlavy: desktop 30 dní 18,5 px / gap 6 → 19/6, mobil 30 dní 6,7 px / gap 1 → 7/1, rok 13/4.

Poznámka k původnímu dojmu „roztažených mezer": prototyp má na plných 30 dnech prakticky stejné rozměry jako naše verze. Roztaženě to působilo tím, že 29 z 30 buněk byly prázdné výplně za dobu, kdy návyk ještě neexistoval — což řeší bod výše.

### Scrollbary
Dvě lišty, každá z jiné příčiny:
1. **Vodorovná pod pásem návyků** — běžná lišta u `overflow-x: auto`, na macOS s „Show scroll bars: Always" překrývá obsah tlustým pruhem. Přidána třída `.hide-scrollbar` (schová lištu, scrollování zůstává), nasazená i na stejný pás v tréninku.
2. **Svislá v kartě „Rok po dnech"** — skutečná chyba: `overflow-x: auto` si podle specifikace vynutí i `overflow-y: auto` a mřížka přetékala o 2 px kvůli `padding-top: 1` na sloupci popisků. Padding pryč, svislý směr natvrdo `hidden`. Ověřeno: obě lišty 0 px, mřížka se nekrátí (rám i mřížka 115 px).

### Výběr času je vlastní, nikde nativní
`input type="time"` otevírá systémový panel — světlý, s cizím chrome, na každé platformě jiný. Nahrazen na **třech místech**: formulář návyku, sdílený `TimePicker` (Úkoly, Přehled) a pole Od/Do v Časovém plánu.

`TimePicker` má teď rychlé volby jako pilulky (`Bez času`, 6:30, 8:00, 12:00, 18:00, `Vlastní`) a pro vlastní čas **dva steppery** postavené na `StepperField` z tréninku — tap na číslo umožní přímé zadání, dlouhý stisk skáče po pěti krocích. Žádný nativní prvek v appce nezůstal.

## Habits — okno matice podle skutečné historie
### Buňky rostou zleva, šířka řádku = počet existujících dnů
Matice zarovnávala poslední sloupec na „dnes", takže při jednom dni historie visela jediná buňka na konci řádku a před ní bylo prázdno. `windowStart()` teď okno ořízne na den vzniku nejstaršího návyku — první den historie je vlevo, dnešek vpravo, řádek končí tam, kde končí historie.

Platí pro **všechny tři rozsahy**:
- **7 dní** — sedm stop zůstává (aby si buňka držela šířku 1/7 řádku), ale vykreslí se jen tolik buněk, kolik je dnů. Jeden den = jeden obdélník 98×44 vlevo, ne lišta přes celou obrazovku.
- **30 dní** — stop je tolik, kolik je dnů; buňky pevné 19 px (mobil 7 px), zarovnané doleva.
- **Rok** — kalendář zůstává 53×7, dny před vznikem jsou prázdné.

### Jmenovatel skóre i souhrnu dne
Skóre návyku i **Souhrn dne** teď dělí počtem dnů, které existují. Návyky založené dnes dávají `0/1`, ne `0/30`.

### Popisek rozsahu
`před 30 dny` se ukáže jen tehdy, když historie skutečně 30 dní má. Jinak datum prvního dne (`11. 8.`). Titulek karty stejně: `Dnes` / `Posledních N dní` / `Posledních 30 dní`.

### 7 dní zpět na obdélníky
Buňky sedmidenního pohledu se vrátily na obdélníky dělící šířku řádku (98×44 na 1440). Pevná velikost platí jen pro 30 dní a rok.

### Chyba nalezená při ověřování
Roční mřížka kreslila **365 šedých buněk** i u návyků založených dnes. Opravu na „nesledovaný den = prázdno" jsem předtím aplikoval jen na souhrn dne (`dayLevels`), ale ne na `yearLevels`, kde `dayLevel(0, 0)` vracelo 0 = šedou. Po opravě: 370 prázdných, 1 obarvená.

### Ověřeno vykreslené
Změřeno na stránce s návyky, které mají `created_at` = dnes (stejná struktura jako reálný stav po založení sady):

| pohled | buněk v řádku | rozměr | zleva | skóre | souhrn dne |
|---|---|---|---|---|---|
| 7 dní | 1 ze 7 stop | 98×44 obdélník | 0 px | 0/1 | 0/1 |
| 30 dní | 1 | 19×19 | 0 px | 0/1 | 0/1 |
| 30 dní (mobil) | 1 | 7×7 | 0 px | 0/1 | — |
| Rok | 1 obarvená z 371 | 13×13 | — | — | — |

11 nových testů (`existsOn`, `tracksOn`, `windowStart`) — celkem **82** na `lib/habits.ts`.

## Habits — časový rozsah místo jednoho času (migrace 0017)
Návyk může mít místo jednoho času celý rozsah. Sloupec `cas_do` (time, nullable), stávající `cas` se stal **začátkem** — nic se nepřevádělo, návyk jen se začátkem se zobrazuje dál stejně.

**Zobrazení** přes `fmtTimeRange()`: s rozsahem `7:30 – 8:00`, jen se začátkem `7:30`, bez času nic. Pomlčka je půlčtverčíková (–), ne spojovník. Nasazeno na kartách Dnes, v hlavičce Detailu i v řádku matice Přehledu.

**Editor** má dva výběry — ZAČÁTEK a KONEC. Konec se nabídne až po zvolení začátku a při jeho zrušení se sám vyprázdní; pod ním je náhled („Zobrazí se jako 7:30 – 8:00"). Obojí přes stejný stepper picker, **žádný nativní vstup**.

**Konec bez začátku není rozsah** — hlídá to check v databázi, ne jen formulář.

**Řazení zůstává podle začátku.**

Ověřeno vykreslené na **1440 i 390**: karty ukazují `6:30 – 7:00`, `7:30 – 8:00`, `12:00` a u návyku bez času nic; řazení podle začátku drží; v editoru je KONEC skrytý, dokud není zvolen začátek, a v modálu je nula prvků `input[type="time"]`. Migrace ověřena proti Postgresu — idempotence a check na konec bez začátku.

## Habits — sjednocené tlačítko splnění u ano/ne i u cíle
U návyku s cílem bylo tlačítko „hotovo" jiné než u ano/ne: **44×44 místo 88×56**, jiný radius a hlavně **nikdy se nerozsvítilo** — splněný cíl tak vypadal jako nesplněný.

Obě varianty teď kreslí jedna funkce `checkBtn()`. Stejná velikost (desktop 88×56, mobil 56×48), stejný radius (14 / 13), stejná ikona a stejné stavy: nesplněno tlumeně s obrysem, **splněno červeně**. Tlačítko `+krok` zůstalo beze změny vedle.

Chování je taky sjednocené — u splněného cíle tlačítko vrací hodnotu na nulu, stejně jako ano/ne odškrtne zpět. `aria-pressed` odpovídá stavu u obou typů.

Ověřeno měřením na **1440 i 390** ve všech čtyřech kombinacích (ano/ne × cíl, splněno × nesplněno): shodných 88×56 / radius 14 na desktopu a 56×48 / radius 13 na mobilu, `rgb(232,25,44)` u obou splněných, nic nepřetéká.

### Splněný cíl se neodškrtává omylem
Tap na splněný cíl vracel hodnotu na nulu. U vody na 2500 ml by jedno ťuknutí smazalo celý den, takže je tlačítko ve splněném stavu **bez akce** (`disabled`, kurzor `default`) — barvu a tvar si drží. Ano/ne se dál přepíná normálně, tam není co ztratit.

Snížit hodnotu jde **tapem na číslo** („1250 z 2000 ml" / „1250 ml"), který otevře stepper s libovolnou hodnotou včetně nuly. Bez toho by po zneaktivnění tlačítka nešla přepočítaná hodnota opravit vůbec.

**Cestou opravena chyba:** tlačítko hodnoty bylo na mobilu vnořené uvnitř tlačítka, které otevírá detail. Vnořená tlačítka jsou neplatné HTML a tap na číslo probublal — místo editace se otevřel detail návyku. Navigační tlačítko teď obaluje jen název, hodnota je jeho sourozenec. Ověřeno: `button button` = 0 na obou šířkách.

## Habits — roční páska začíná dnem vzniku, ne rokem prázdna
Roční mřížka kreslila natvrdo 53 sloupců přes celých 365 dnů okna. U návyku, který existuje pár měsíců, tak ležela celá historie **až u pravého okraje** a před ní byl rok prázdných buněk — přesně opačně, než platí u 7 a 30 dní.

Teď se roční okno ořízne stejným `windowStart()`: začíná dnem, kdy vznikl (nejstarší) návyk, a **roste doprava**. Sloupců je tolik, kolik jich historie zabere (`ceil((offset + dnů) / 7)`, max 53), mřížka je zarovnaná `start`. Nadpis nelže — místo „Posledních 12 měsíců" se u kratší historie píše „Posledních 120 dní". Platí pro Přehled i Detail.

Ověřeno vykreslené na **1440 i 390** proti 10 návykům se 120 dny historie: **18** sloupců místo 53, `justify-content: start`, 120 vybarvených buněk od indexu 1 (offset = den v týdnu prvního dne) do 120, nadpis „Posledních 120 dní".

## Habits — skrývání místo mazání
V režimu úprav je místo koše **oko** (`eye-off`). Skrytý návyk zmizí ze seznamu Dnes, z Přehledu i z Detailu a **nepočítá se do skóre, sérií ani statistik** (`dayStats` i denní součet po zápisu jdou jen přes neskryté; `loadWindow` skryté nečte). Historie v `habit_entries` zůstává, takže po vrácení návyk pokračuje tam, kde skončil — mazání ji bralo s sebou a nešlo to vrátit.

V režimu úprav jsou skryté návyky **zašedle na konci seznamu** pod hlavičkou „SKRYTÉ (n)", čárkovaný obrys, popisek „Skrytý — nepočítá se do skóre ani sérií" a **oko** pro vrácení. Mimo režim úprav nejsou vidět vůbec. Duplicitní „Archivovat návyk" ve formuláři je pryč — jedno místo, jeden způsob.

Ověřeno vykreslené na **1440 i 390**: 10 tlačítek „Skrýt návyk", **0** mazacích; po skrytí dvou návyků čítač spadl z „8 z 10" na „6 z 8", objevilo se „SKRYTÉ (2)" a obě karty leží pod všemi aktivními (opacity 0,55, dashed); po vrácení jednoho „7 z 9" a „SKRYTÉ (1)". Tlačítka 44×44.

## Habits — Přehled se vejde na obrazovku, scrolluje jen matice
S deseti návyky byla matice vyšší než okno a scrollovala se celá stránka — dlaždice pod ní nebyly vidět. Teď má matice **vlastní maximální výšku a scrolluje uvnitř karty**: záhlaví s popisky dnů je přilepené nahoře, řádek „Souhrn dne" dole, lišta schovaná přes `.hide-scrollbar`.

Výška se **měří, nehádá**: `below` je vzdálenost od spodku matice ke konci stránky (souhrn, dlaždice, mezery) a ta se změnou výšky matice nemění, takže měření nekmitá; limit bere spodek `.main-content` mínus jeho `padding-bottom` (na mobilu 80 px kvůli spodní navigaci).

Ověřeno vykreslené s **10 návyky**:
- **1440×900** — stránka `scrollHeight === clientHeight` (nescrolluje), matice `max-height 340px` a scrolluje uvnitř, po odscrollování o 150 px je záhlaví 0 px od horní hrany a „Souhrn dne" 0 px od spodní, dlaždice končí na 745 px v okně vysokém 900.
- **390×844** — stránka nescrolluje, matice `max-height 157px`, záhlaví i „Den | 30/30" přilepené, dlaždice končí na 656 px, spodní navigace začíná na 775 px, nic nepřetéká do stran, lišta neubírá šířku (`offsetWidth − clientWidth = 0`).

## Habits — přepínání dne, zpětný zápis
Vidět šel jen dnešek. Vedle data jsou teď **šipky doleva/doprava** (44×44, v mobilní i desktopové hlavičce). Doprava se **za dnešek nedostaneš** — na dnešku je tlačítko rovnou `disabled` s titulkem „Do budoucnosti to nejde", ne že by kliknutí tiše nic neudělalo. Dozadu okno končí nejstarším načteným dnem (365), tam se levá šipka vypne.

Odškrtávat zpětně jde, ale **minulý den je vizuálně jiný**: nad seznamem červený čárkovaný pruh „Zpětný zápis — út 11. srpna" s tlačítkem „Na dnešek", datum v hlavičce červeně a tučně, karty mají **čárkovaný obrys a tlumené pozadí**. Tlumení jde přes překryv (`linear-gradient(rgba(107,114,128,.09) …), var(--card)`), ne přes `--input-bg` — ve světlém motivu je `--input-bg` bílá stejně jako `--card`, takže by karta vypadala shodně.

Data: stránka drží **celé okno** (`entries: habit → datum → hodnota`), takže přepnutí dne ani zápis do minulosti nic nedonačítá; skóre i série se počítají z okna přes `useMemo`. Zápis jde vždy na `viewDay`. Seznam patří zobrazenému dni přes `tracksOn()` — návyk, který tehdy ještě neexistoval, se nekreslí a den hlásí „Pro tento den žádný návyk neplatil", ne 0 z 10.

`step()` posouvá přes **funkční update** `setViewDay(cur => …)`. S `viewDay` z posledního renderu spočítalo rychlé poklepání pořád stejný den — měřeno: 85 ťuknutí posunulo datum o 1 den, po opravě 60 ťuknutí o 60 dní.

Ověřeno vykreslené na **1440 i 390** (10 návyků, 120 dní historie, světlý i tmavý motiv):
- na dnešku pravá šipka `disabled`, žádný pruh, datum „Dnes · st 12. srpna";
- o den zpět: datum „út 11. srpna" červeně, pruh „Zpětný zápis", karty `dashed rgba(107,114,128,0.55)`, hodnoty patří tomu dni (Kroky 0 ml proti 2000 ml dnes);
- klik na odškrtnutí u minulého dne dojde do `write()` — bez přihlášení se hodnota vrátí zpět a přijde hláška „Uložení selhalo: nejsi přihlášený" (rollback funguje);
- 9. dubna (před vznikem návyků) 0 karet, čítač „0 z 0" a hláška o neplatném dni;
- na nejstarším dni okna (13. 8. 2025) je levá šipka `disabled`;
- „Na dnešek" vrátí na dnešek, pruh zmizí, pravá šipka je zase `disabled`.

Neověřeno: samotný `upsert` s `datum = viewDay` proti databázi — bez přihlášení (hesla nezadávám) se do něj nedá dostat. Otestuj po nasazení jedním zpětným odškrtnutím.

## Habits — čas po dnech
Focus má být v úterý 10:00–13:00 a ve středu 7:00–10:00. Tři návyky se stejným jménem by udělaly bordel v Přehledu, takže zůstává **jeden návyk, jeden řádek** a liší se jen čas.

`habits.cas` / `cas_do` je **výchozí** čas a platí pro všechny dny. Nová tabulka `habit_times (habit_id, den, cas_od, cas_do)` drží jen **výjimky** — den bez záznamu jede podle výchozího, prázdná tabulka = chování jako dosud. Řádek na každý den by znamenal, že změna výchozího času musí přepsat sedm řádků a při výpadku uprostřed by část dnů zůstala na starém.

Vlastnictví hlídá RLS **přes návyk** (`exists (select 1 from habits …)`), ne přes vlastní `user_id` — denormalizovaný sloupec by se dal zapsat i špatně. Mazání návyku bere časy s sebou (`on delete cascade`). Check `cas_do > cas_od`: konec před začátkem je překlep, ne rozsah přes půlnoc.

V editoru je pod výchozím časem přepínač **„Jiný čas v některé dny"**, který rozbalí **jen dny, kdy návyk platí**. Rozbalený je vždy nejvýš jeden den — sedm dnů se dvěma TimePickery naráz se na 390px nedá projít. „Bez času" v denním pickeru = zpátky na výchozí, stejně jako tlačítko **Zpět na výchozí**. Ukládá se po návyku (nový návyk teprve pak má `id`), nejdřív upsert platných výjimek a teprve pak smazání zbylých — opačné pořadí by při chybě uprostřed nechalo návyk bez časů.

Seznam Dnes ukazuje a **řadí podle času platného pro zobrazený den** (`sortHabitsOn`): ve středu stojí Focus v 7:00 nad snídaní v 7:30, i když jeho výchozí čas je 9:00. Přehled ani Detail se nemění — `loadWindow()` `habit_times` vůbec nečte.

**Opraveno při ověřování:** `TimePicker` měl v úzkém místě useknuté tlačítko „+" u minut — dva steppery potřebují ~380 px, v rozbaleném dni na 390px jich bylo k dispozici 324 (naměřeno `scrollWidth 379` proti `clientWidth 324`). Řádek se teď zalamuje (`flex: 1 1 200px`), takže na 390 jsou steppery pod sebou a na 1440 vedle sebe. Týkalo se to i výchozích pickerů, ne jen nových denních.

Ověřeno:
- **Migrace proti skutečnému Postgresu** — dvojí spuštění (idempotence), `cas_do <= cas_od` odmítnuto, `den = 8` odmítnuto, `on conflict (habit_id, den)` přepíše řádek, `cas_do` smí být NULL, RLS: vlastník vidí 1 a zapíše, cizí uživatel vidí 0, insert odmítnut, update změnil 0 řádků; smazání návyku smazalo i časy.
- **Jednotkově** (17 tvrzení): výjimka pro út/st, čtvrtek spadne na výchozí, výjimka platí i bez výchozího času, `activeDays` filtruje smetí, `sortHabitsOn` řadí podle denního času a bez výjimek se chová jako `sortHabits`.
- **Vykresleno na 1440 i 390** s návykem Focus (výchozí 9:00–11:00, út 10:00–13:00, st 7:00–10:00, platí út–čt): ve středu „Focus 7:00 – 10:00" nad „Snídaně 7:30 – 8:00", v úterý „Focus 10:00 – 13:00" pod snídaní, ve čtvrtek výchozí „9:00 – 11:00", v pondělí Focus vůbec není. Editor: přepínač zapnutý, řádky Út/St/Čt, u čtvrtka „výchozí · 9:00 – 11:00", nota „Vlastní čas má 2 dny"; nastavení 8:00 přepne řádek na vlastní, konec 6:30 vyvolá hlášku a **vypne Uložit**, „Zpět na výchozí" vrátí den zpět; odškrtnutí dne v „PLATÍ VE DNY" jeho řádek skryje, vypnutí přepínače skryje celý seznam. Nic nepřetéká do stran (`scrollWidth − clientWidth = 0`), tapovací plochy 44–52 px.

Neověřeno: samotný zápis do `habit_times` proti databázi — bez přihlášení se do něj nedá dostat. Otestuj po spuštění migrace jedním uložením.

## Habits — Detail vypisuje odchylky času
V hlavičce Detailu svítil jen výchozí čas, který u návyku s výjimkami neplatí pro půlku dnů. Teď: když má návyk aspoň jednu denní výjimku, podtitul říká **„výchozí 9:00 – 11:00"** a pod dlaždicemi přibude karta **ČAS PO DNECH** — jeden chip na každý den, kdy návyk platí. Dny s vlastním časem jsou zvýrazněné akcentem, ostatní tlumeně s výchozím časem, pod tím věta, co znamená zvýraznění. Návyk bez výjimek vypadá přesně jako dřív, karta se vůbec nevykreslí.

Časy se načítají jen pro ten jeden návyk (`eq('habit_id', id)`), ne přes `loadWindow` — Přehled je nepotřebuje. Chyba dotazu jde do konzole a detail se dál vykreslí s výchozím časem.

**Opraveno rovnou:** editor otevřený z Detailu nedostával `casyDnu`, takže by se otevřel s vypnutým přepínačem a **uložení by všechny denní výjimky smazalo**. Teď je předává stejně jako seznam Dnes.

Ověřeno vykreslené na **1440 i 390** (Focus: výchozí 9:00–11:00, út 10:00–13:00, st 7:00–10:00, platí út–čt): podtitul „výchozí 9:00 – 11:00", chipy „Út 10:00 – 13:00" a „St 7:00 – 10:00" akcentem, „Čt 9:00 – 11:00" tlumeně; u návyku bez výjimek (Snídaně) karta chybí a slovo „výchozí" se nikde neobjeví. Na 390 se chipy zalomí do dvou řádků, nic nepřetéká (`scrollWidth − clientWidth = 0`), výška chipu 34 px.

## Trénink — načtené cviky přežijí obnovení stránky
„Načíst minulý trénink" předvyplnil cviky, ale po obnovení stránky zůstaly jen ty, kde už byla aspoň jedna potvrzená série. Příčina seděla přesně tam, kde jsi ji čekal: `load()` skládal seznam cviků **jen z `workout_sets`** (`for (const s of confirmed) if (!order.includes(...)) order.push(...)`), a předvyplněný cvik do prvního potvrzení v databázi nemá nic. Netýkalo se to jen šablony — stejně mizel i cvik přidaný ručně přes „Přidat cvik".

### Volba: vlastní tabulka, ne prázdné řádky sérií
Nová tabulka `workout_exercises (workout_id, exercise_id, order_index)`, migrace 0019.

Prázdné řádky v `workout_sets` by znamenaly, že v tabulce, kde **každý řádek je odcvičená série**, najednou leží něco, co série není. Na `workout_sets` visí počítadlo v hlavičce i v chipech, objem a tonáž, PR odznaky, `targetMet()` nad top sérií, export do CSV/JSON a hlavně `workout_origin()` a `workout_last_activity()` v migraci 0010, ze kterých se počítá **délka tréninku a automatické ukončení**. Plánovaný cvik by musel dostat příznak „tohle není série" a ten by se pak musel odfiltrovat úplně všude — v SQL funkcích, v exportu, ve statistikách. Jedno zapomenuté místo tiše rozbije číslo, kterého si nikdo hned nevšimne (délka tréninku by se počítala od „série", která se nikdy necvičila). Je to i proti pravidlu, které v appce už je: *počítadlo počítá jen skutečné řádky, žádné automatické dolepování sérií*.

Oddělený seznam nic z toho nepotřebuje — do `workout_exercises` nesahá nic, co počítá. Cena je jeden dotaz navíc při načtení a zápis při přidání/odebrání/přerovnání cviku.

### Jak to funguje
- Plán zapisuje „Načíst minulý trénink", „Přidat cvik" i přerovnání šipkami (`upsert` na `(workout_id, exercise_id)`), odebrání cviku ho maže. Selhání zápisu se **hlásí toastem** a necouvá seznam na obrazovce — cvičit se dá dál, jen po obnovení bude seznam kratší.
- `exerciseOrder(planned, confirmed)` v `lib/gym.ts`: nejdřív plán v jeho pořadí, pak cviky, které v plánu nejsou, ale mají série. Druhá větev drží tréninky založené před migrací a případ, kdy se zápis do plánu nepovede — bez plánu se seznam poskládá po staru.
- Plánovaný cvik bez potvrzené série dostane po obnovení předvyplněné řádky **dopočítané z „minule"**, tedy ze stejného zdroje, ze kterého je vyrobilo „Načíst minulý trénink". Když není z čeho (první výskyt cviku, trénink v jiné posilovně), zbude jedna prázdná série — přesně jak vypadá ručně přidaný cvik.
- U **dokončeného** tréninku se plán ignoruje: historie ukazuje, co se odcvičilo, ne co se zamýšlelo. Po „Pokračovat v tréninku" (`duration_min` zpět na NULL) se plánované cviky zase objeví.
- Chybějící tabulka (nepuštěná migrace) nesmí shodit rozdělaný trénink — chyba jde do konzole a seznam se poskládá po staru.

Známé omezení: hodnota upravená u **nepotvrzené** série se obnovením ztratí a předvyplní se znovu z „minule". Dřív se ztrácel celý cvik, takže je to posun správným směrem; ukládat rozepsané neodcvičené číslo by znamenalo přesně ty prázdné řádky, kterým se tahle změna vyhýbá.

### Ověřeno
- **Migrace proti skutečnému Postgresu:** dvojí spuštění (idempotence); po zápisu plánu tří cviků a potvrzení jediné série u druhého vrací dotaz `load()` **všechny tři** (`Bench press 0 sérií, Rozpažky 1, Tricepsy 0`), zatímco starý dotaz jen ze sérií vrací **jediný** (`Rozpažky`) — přesně ta chyba; `upsert` při přerovnání nezdvojí řádky (3 řádky, order_index 0–2); odebrání smaže jeden; RLS: vlastník vidí a zapíše, cizí uživatel vidí 0, insert odmítnut, delete smazal 0 řádků; smazání tréninku smaže plán kaskádou.
- **Jednotkově** `exerciseOrder` (7 tvrzení): plán bez jediného potvrzení přežije, plán + jedno potvrzení drží všechny, bez plánu se jede ze sérií, série mimo plán jde na konec, pořadí určuje plán, duplicity se zahodí.
- `next build` prochází.

Neověřeno mnou: proklik v prohlížeči (načíst minulý trénink → obnovit → cviky tam jsou). Bez přihlášení se do rozdělaného tréninku nedostanu a migrace 0019 v ostré databázi ještě nebyla. Po jejím spuštění je to test na tři kroky.

## Habits — appka otevřená přes půlnoc se přepne na nový den
Appka nechaná otevřenou přes noc ukazovala pořád včerejšek: `today` se počítal při renderu (`const today = dayKey(new Date())`) a render přes noc nikdy nepřišel, takže na obrazovce zůstalo staré datum a odškrtávalo by se do včerejška.

`today` je teď ve stavu a hlídají ho **dvě spouště**: `visibilitychange` (návrat na záložku — pokrývá zamčený telefon i schovaný tab, kde prohlížeč časovače přiškrtí), `focus` a **minutový časovač** pro appku, na kterou je vidět celou dobu. Obě volají tutéž funkci; když se datum nezměnilo, neudělá nic.

Dvě věci, na kterých to stojí:
- **Ručně přepnutý den se nepřepisuje.** Reset patří jen tomu, kdo stojí na dnešku (`viewDay === starý dnešek`). Kdo si listuje v historii, o svoje místo o půlnoci nepřijde — jen se mu odemkne šipka dopředu, protože dnešek je teď o den dál.
- **Okno dat se načte znovu.** `days` z `lastDays()` končí u starého dneška, takže bez `load()` by nový den nebyl ani ve skóre, ani v sérii.

Ověřeno vykreslené s posunutými hodinami (`window.Date` o +24 h, skutečný kód, ne mock logiky):
- **návrat na záložku** — hlavička „Dnes · čtvrtek 13. srpna" → po `visibilitychange` „Dnes · pátek 14. srpna", pravá šipka pořád `disabled`, žádný pruh zpětného zápisu;
- **ruční den zůstává** — po kliku zpět na „středa 12. srpna" a přechodu půlnoci hlavička dál „středa 12. srpna" i s pruhem „Zpětný zápis — středa 12. srpna", jen se povolila šipka dopředu; dva kliky vpřed došly na „Dnes · pátek 14. srpna", kde se šipka zase vypnula (tedy `today` se opravdu překlopil, jen `viewDay` ne);
- **minutový časovač** — po posunu hodin a **bez jakékoli události** se hlavička sama přepnula na nový den.

## Půlnoc — sdílený `useToday`, prošlý Focus i Trénink
Kontrola půlnoci z Habits je teď `lib/useToday.ts` a používají ji obě stránky, které na datu stojí. Hook drží dnešek ve stavu a překlápí ho na `visibilitychange`, `focus` a minutovým časovačem; `onChange(nový, starý)` dostane stránka, která musí kromě překreslení ještě něco dorovnat.

Časovač schválně **nehlídá `visibilityState`** — na rozdíl od pollu v `useLiveData`, který ve schované záložce neběží. Právě proto se na `useLiveData` nedalo spolehnout: appka na pozadí přes noc žádný refetch neudělá.

**Habits** — beze změny chování, jen refaktor na hook (zobrazený den se posune, jen když uživatel stojí na dnešku, a znovu se načte okno dat).

**Trénink (`/trenink`)** — měl tentýž vzorec na třech místech:
- `relDate()` počítal „Dnes/Včera" z `new Date()` uvnitř sebe, takže včerejší trénink zůstal „Dnes". Dnešek teď přichází parametrem, aby bylo v podpisu vidět, na čem štítek závisí.
- `week` a `weekBars` počítaly `startOfWeek(new Date())` v `useMemo` se závislostmi `[workouts, derived]`, takže přechod z neděle na pondělí statistiku ani sloupce nepřepočítal. `today` je teď v závislostech.

**Focus (`/focus`)** — **nic se neměnilo a není co**: stránka nevykresluje žádný štítek odvozený z dneška (všechna `new Date()` jsou uvnitř zápisů, kde se razítkuje okamžik akce) a zbývající čas se počítá z `started_at` proti tikajícímu `nowMs`, který stránku překresluje každou sekundu. Běžící focus tedy přes půlnoc doběhne správně.

Ověřeno vykreslené s posunutými hodinami (`window.Date` o +24 h):
- **Trénink, návrat na záložku** — trénink z 13. 8. měl štítek „Dnes"; po posunu hodin na 14. 8. a `visibilitychange` se přepsal na „Včera".
- **Trénink, minutový časovač** — po posunu hodin a bez jakékoli události se štítek přepnul sám.
- **Habits** — po refaktoru znovu ověřeny všechny tři cesty z předchozího záznamu (návrat na záložku, ruční den zůstává, minutový časovač).

## Hlasový režim — dvojí dotaz na mikrofon a nedostupná tlačítka na mobilu

### 1) Dvojí dotaz na mikrofon
Mikrofon si otevírali **dva spotřebitelé**: `SpeechRecognition` (rozpoznávání) a vlastní `getUserMedia` + `AnalyserNode`, který hlídal 2 s ticha pro automatické zastavení. Prohlížeč se proto ptal dvakrát za sebou.

**Sdílet jeden stream nejde** — Web Speech API žádný `MediaStream` nepřijímá, mikrofon si drží samo a není jak mu vnutit cizí. Jediná cesta k jednomu dotazu je tedy nemít druhého spotřebitele: ticho se pozná z toho, že přestanou chodit výsledky rozpoznávání (`onresult` sype průběžné výsledky, dokud se mluví), takže hlídač je teď obyčejný časovač nad `lastSoundAt` bez jediného přístupu k mikrofonu.

Vedle jednoho dotazu to má i věcný přínos: hlídá se **ticho v řeči**, ne hlasitost, takže hluk v pozadí už poslech neudržuje naživu donekonečna.

Ověřeno v prohlížeči na desktopové větvi (`isMobile === false`, tedy ta s hlídačem): za celý cyklus poslechu **`getUserMedia` 0 volání** (dřív 1 + vlastní mikrofon rozpoznávání) a jedna instance `SpeechRecognition`; po 2 s bez výsledku hlídač zavolal `stop()` právě jednou, takže automatické zastavení funguje dál.

### 2) Tapy na mobilu
Zavírací křížek panelu měl hitbox **14×14 px** — myší se trefíš, prstem ne. Panel tak na mobilu nešel zavřít. Ikona zůstala malá, plocha má 44×44 (záporné okraje drží layout na místě); potvrzovací tlačítka „Potvrdit / Zrušit" dostala `min-height: 44` a tlačítko mikrofonu 44×44 místo 40×40. Pravidlo projektu (min. 44×44) tak platí i tady.

Ověřeno skutečným tapem na **390 px** s emulací dotyku: hardwarový tap dopadl na křížek (`pointerdown:touch` + `touchstart:touch` přímo na tlačítku) a všech sedm bodů posunutých o ±15 px od středu pořád trefí tlačítko — u původních 14×14 px stačilo minout o 8 px. Po dokončení tapu se panel zavřel.

**Co v kódu není:** žádný `unlockAudio` ani `onPointerDown` — hlasový panel nemá jediný pointer handler, takže konflikt s odemykáním audia to být nemohl. A **hlasový režim nemá tlačítko „zpět na dashboard"** — jediné ovládání panelu je ten křížek.

### 3) Cesta zpět na dashboard byla ve vývoji zakrytá bublinou Next.js
Na 390 px leží indikátor dev nástrojů přesně na první položce spodní navigace, tedy na odkazu **Přehled** — cestě zpět na dashboard. Změřeno: `elementFromPoint` uprostřed odkazu vracel `NEXTJS-PORTAL`, o 10 px doleva/nahoru/doprava taky. Tap tedy nedopadl na odkaz a nic se nestalo; na desktopu je stejná položka v postranním panelu, kde ji nic nepřekrývá.

V produkci bublina není, takže v kódu appky nebylo co opravovat — vypnul jsem ji v `next.config.ts` (`devIndicators: false`), aby ladění na telefonu nemátlo. Přesouvat ji nemá smysl: na 390 px má appka v každém rohu něco, na co se ťuká. Po vypnutí je hittestem ověřeno, že všech sedm položek navigace včetně „Přehled" trefí samy sebe.

## Modály — klik mimo zavírá jen tehdy, když mimo i začal
Modál se zavíral i při tažení, které začalo uvnitř: `onClick` na překryvu se doručí nejbližšímu společnému předkovi místa stisku a místa puštění, takže stisk uvnitř + puštění venku (tažení posuvníku, výběr textu, kterému ujede myš) trefil překryv a modál zmizel uprostřed práce.

Rozhodnutí teď padá ze dvou událostí: `pointerdown` si zapamatuje, jestli stisk padl na překryv (`target === currentTarget`, tedy ne na potomka), a `pointerup` zavře jen tehdy, když i puštění padlo tam. `pointercancel` příznak maže, aby zrušené gesto (scroll prstem) nenechalo modál zavřít při příštím puštění.

Logika je v `lib/useOverlayClose.ts` a používají ji **oba** systémy dialogů v appce — `components/Modal.tsx` (všechny formulářové modály včetně exportu a pickerů) a `components/ConfirmDialog.tsx`. `stopPropagation` na obsahu už není potřeba a zmizel.

Při té příležitosti: `Modal` neměl **zavření Esc**, které pravidlo projektu vyžaduje u každého dialogu (`ConfirmDialog` ho měl). Doplněno.

Ověřeno v prohlížeči:
- **skutečné tažení myší** z pole uvnitř modálu ven na překryv (hardwarový vstup, ne syntetická událost) — modál zůstal otevřený;
- čtyři kombinace na `Modal` — stisk uvnitř → puštění mimo: **nezavře**; stisk mimo → puštění uvnitř: **nezavře**; stisk uvnitř → zrušené gesto → puštění mimo: **nezavře**; stisk i puštění mimo: **zavře**;
- totéž na `ConfirmDialog` (stisk uvnitř → puštění mimo nezavře, poctivý klik vedle zavře).

## Ikona v prohlížeči byla jiná než na telefonu
V hlavičce se ikony uváděly ručně: `metadata.icons.icon` i `.apple` mířily na `/icon.svg`. Ten se ale servíroval z `public/icon.svg`, kde ležel **úplně jiný obrázek — blesk**, zatímco mobilní appka bere ikonu z manifestu (`/icon-192.png`, `/icon-512.png`), a tam je **checklist**. Odtud dvě různé ikony.

Řešení: jeden zdroj a konvence Next.js místo ručních odkazů.
- `app/icon.svg` (checklist) → Next si sám vygeneruje `<link rel="icon" type="image/svg+xml" sizes="any">`,
- `app/apple-icon.png` (kopie 180×180 z `public/apple-touch-icon.png`) → Next vygeneruje `<link rel="apple-touch-icon" sizes="180x180">`,
- ruční `icons` v metadatech i ruční `<link rel="apple-touch-icon">` jsou pryč,
- `public/icon.svg` (blesk) a `public/favicon.svg` (duplikát) smazané, aby se dvě pravdy neměly kde vzít.

Dvě věci, které by to jinak shodily:
- **Middleware přesměrovával i ikony.** Matcher měl výjimku jen pro `icon-`, takže `/icon.svg` i `/apple-icon.png` (metadata routy) dostaly 307 na `/login` — nepřihlášenému uživateli, tedy i na přihlašovací stránce, se favicon vůbec nenačetl. Výjimka rozšířena na `favicon|icon|apple-icon`.
- **Service worker cachuje obrázky cache-first**, takže nainstalovaným klientům by zůstala stará ikona v mezipaměti. `CACHE_NAME` zvednuto na `dashboard-v3`.

Ověřeno na běžící appce: v HTML jsou právě dva odkazy (`/icon.svg?…` a `/apple-icon.png?…`), oba vracejí **200** (dřív 307 na /login), servírované SVG je checklist a servírovaný apple-icon má **stejný otisk MD5 jako `public/apple-touch-icon.png`**, tedy přesně tu ikonu, kterou má appka na telefonu. `/icon-192.png` i `/icon-512.png` z manifestu se nemění.

### Favicon jako zaoblený čtverec
SVG favicon byl kruh (`<circle r="256">`), zbytek appky čtverec. Změněno na `<rect rx="115">` (22 % strany, tedy proporce, jakou používá systémový squircle).

PNG z manifestu se schválně **nemění**: měřením přes canvas mají rohový pixel plně krytý (`rgba(232,25,44,255)`), tedy ostrý čtverec bez průhlednosti — 512 je v manifestu `maskable` a zaoblení dělá systém sám. Předzaoblit je by znamenalo dvojí zaoblení a odseknuté rohy na ploše telefonu.

Ověřeno vykreslené ve 128, 64, 32 i 16 px: tvar drží i v nejmenší velikosti.

## Habits — denní poznámka
Pod seznamem návyků je textové pole „co jsem dneska dělal, jak to šlo". Patří **zobrazenému dni**, ne dnešku: přepnutí šipkami načte poznámku toho dne a popisek se změní z „POZNÁMKA K DNEŠKU" na konkrétní datum. U minulého dne má karta stejný čárkovaný rámeček jako karty návyků, ať je vidět, že se needituje dnešek.

Migrace 0020: `habit_notes (user_id, datum, text)` s unikátem na `(user_id, datum)`, který zároveň slouží jako cíl `on conflict` — poznámka se přepisuje, neverzuje. `updated_at` drží trigger v databázi, aby se nemělo s čím rozejít při úpravě z jiného zařízení.

**Ukládání s prodlevou (800 ms).** Rozepsaná poznámka si nese svůj den, takže doletí do dne, ve kterém se psala, i když se mezitím přepne jinam; přepnutí dne, `blur` i schování appky (`visibilitychange`) uložení dopředu vynutí, aby se nic neztratilo. Potvrzení je nenápadné — místo toastu se u popisku objeví „Ukládám…" a pak „Uloženo" se zeleným zaškrtnutím, které po 2,5 s zmizí. Chyba se naopak hlásí toastem, ta se spolknout nesmí.

**Prázdná poznámka řádek maže**, ne ukládá prázdný text — jinak by v Přehledu svítila značka u dne, kde nic není.

V **Přehledu** má den s poznámkou tečku v řádku „Souhrn dne": bílou na vybarvené buňce, akcentní na světlé, velikost podle buňky (8 px při 19px buňce, 3 px při 7px buňce na mobilu). `loadWindow()` k tomu tahá jen data, ne texty.

Ověřeno vykreslené:
- **prodleva** — pět úhozů za sebou = **0 zápisů** a stav „Ukládám…"; po pauze **právě 1 zápis** s finálním textem a „Uloženo", které po chvíli zmizí;
- **přepnutí dne** — napsáno a hned přepnuto zpět: zápis šel na `2026-08-15` (den, kde se psalo), pole ukázalo poznámku pátku a popisek „POZNÁMKA — PÁTEK 14. SRPNA"; návrat na dnešek ukázal rozepsaný text;
- **Přehled** — v 30denní matici tečky přesně u čtyř dnů, které poznámku mají (indexy 18, 25, 28, 29), 8 px na 19px buňce; v 7denní matici 3 tečky (čtvrtá je mimo okno) o 7 px na buňce 98×44;
- **390 px** — pole 332 px v kartě 366 px, `font-size: 16px` (iOS při zaostření nezvětší stránku), pole leží mezi seznamem návyků a řádkem se sérií, nic nepřetéká do stran; v Přehledu tečka 3 px na 7px buňce, taky bez přetečení.

Neověřeno: skutečný zápis do `habit_notes` proti databázi — bez přihlášení se do něj nedostanu, ověřoval jsem logiku kolem něj (prodleva, cílový den, stavy) s odstřiženým dotazem.

## Cold cally — krok 1: datová vrstva, migrace, import leadů
Sekce podle handoffu `design_handoff_cold_cally`. První ze tří kroků: data, migrace a import leadů. Obrazovky (seznam, záznam hovoru, Co se učím) jsou krok 2 a 3.

### Migrace 0021 — `cold_calls`
Sloupce podle zadání; `vysledek` má check na pět hodnot včetně `ceka`, což je **výchozí** hodnota — nahraný lead, kterému se ještě nevolalo.

Datum je ve dvou sloupcích schválně: `created_at` = kdy záznam vznikl (u leadu okamžik importu), `volano_at` = kdy se doopravdy volalo. S jedním sloupcem by po zavolání zmizelo, kdy lead přišel, a statistika „dnes zavoláno" by počítala i dnešní import bez jediného hovoru. Proto `statistiky()` počítá „dnes" i „celkem" z `volano_at` a frontu do nich nezahrnuje.

Indexy: `(user_id, vysledek, created_at desc)` pro seznam a **částečný** `(user_id, telefon) where telefon is not null` na hledání duplicit, aby si záznamy bez čísla nepřekážely.

### Import leadů
`lib/coldCallsImport.ts` je celý čistá funkce nad mřížkou `string[][]`, takže parsování, rozpoznání sloupců i náhled jdou testovat bez prohlížeče a bez databáze; čtení souboru je jediné, co sahá na `File`.

- **CSV vlastním parserem** — umí uvozovky, zdvojené uvozovky, oddělovač uvnitř hodnoty i CRLF a BOM z Excelu. `split(',')` by spadl na první adrese „Praha 4, Nusle". Oddělovač se hádá z první řádky (`;` česká verze Excelu, `,` webové exporty, tabulátor).
- **Excel přes `xlsx` (SheetJS)** — nová závislost, načítaná **dynamicky**, takže skoro megabajt knihovny se stáhne jen když uživatel opravdu vybere `.xlsx`. Čte se `raw: false`, jinak se z telefonu uloženého jako číslo stane `7.77123456e8`.
- **Sloupce se poznají samy** — nejdřív podle hlavičky (česky i anglicky, bez ohledu na diakritiku, velikost písmen a pořadí sloupců), a když hlavička chybí nebo nesedí aspoň ve dvou sloupcích, hádá se z obsahu: telefon je sloupec, kde většina buněk vypadá jako číslo, firma nejdelší textový sloupec.
- **Náhled před uložením** — počty a stav po řádcích: `ok`, `bez-telefonu` (naimportuje se, ale je označený), `duplicita` (přeskočí se), `chybi-firma` (přeskočí se, bez názvu je lead k ničemu). Duplicity se hledají podle telefonu proti databázi **i uvnitř souboru**; klíč je posledních devět číslic, takže „+420 777 123 456", „777123456" i „00420777123456" jsou totéž číslo.

### Ověřeno
- **Migrace proti skutečnému Postgresu:** idempotence dvojím během, `vysledek = 'ceka'` jako výchozí a `volano_at` NULL, neplatná hodnota odmítnuta checkem, přechod leadu na `schuzka` s `volano_at`, RLS (cizí vidí 0 a zápis je odmítnut), a `explain` potvrdil, že se na frontu použije index `cold_calls_user_idx`.
- **Jednotkově (34 tvrzení):** parser CSV (uvozovky, escapované uvozovky, BOM+CRLF, prázdné řádky), detekce oddělovače, rozpoznání sloupců z české i anglické hlavičky, v jiném pořadí i bez hlavičky, náhled se všemi čtyřmi stavy, klíč telefonu, formátování čísla, statistiky (import dnes nezvedne „dnes zavoláno"), řazení (fronta nahoře, nejstarší lead první), hledání bez diakritiky, relativní datum („Dnes 10:12" / „Včera 16:40" / „st 12. 8.") a CSV export (BOM, escapovaný středník, český popisek).
- **Excel end-to-end:** vyrobený `.xlsx` s telefonem uloženým jako číslo, hlavičkou v jiném pořadí a prázdnou řádkou uprostřed projde stejnou cestou jako CSV — telefon zůstal „777123456", prázdná řádka vypadla, sloupce rozpoznány.

Poznámka k testu: jeden pád byl **chyba testu, ne kódu** — řádek „Delta" jsem omylem dal stejné číslo jako dřívějšímu řádku a kód ho správně označil za duplicitu.

## Cold cally — krok 2: seznam hovorů
Obrazovka 1 z handoffu (artboardy 1a/1b) na route `/cold-cally`. Rozměry, rozestupy a radiusy jsou z designu doslova; barvy jdou přes proměnné appky, takže sekce funguje i ve světlém motivu, a font zůstal Geist (rozhodnutí uživatele).

**Fronta „čeká" = varianta B.** Nahrané leady tvoří vlastní část seznamu: hlavička „K OBVOLÁNÍ" s počtem, modrý pruh 3 px u levého kraje řádku a jemné podbarvení; pod tím předěl „ZAVOLÁNO" a historie beze změny. Modrá se v paletě sekce jinde nevyskytuje, takže fronta není další odstín červené (ta patří odmítnutí) ani šedá (nedovoláno = volal jsem a nezvedli to, čeká = ještě jsem nevolal). Řadí se nahoru, uvnitř fronty nejstarší lead první — kdo čeká nejdéle, na toho se volá dřív. U leadu se místo data ukazuje telefon, protože „kdy" u nezavolaného čísla nic neříká.

**Nad rámec prototypu** (ze zadání): hledání podle firmy i kontaktu bez ohledu na diakritiku, filtr výsledku jako button group (`Vše` + pět stavů), export CSV toho, co je zrovna vidět (respektuje filtr i hledání) a „Nahrát leady" s náhledem.

**Navigace (varianta a):** do postranního panelu přibyly „Cold cally" i „Co se učím", do spodní navigace jen Cold cally — „Co se učím" je čtecí obrazovka, ne denní navigace, a vede na ni tlačítko v hlavičce sekce.

### Ověřeno vedle prototypu
**Desktop 1440:** H1 23px/700 ls −.015em · dlaždice grid 4×, gap 14, mt 26, padding 16/18, r12, číslo 31px/700 tabular-nums, „Schůzky" zeleně · řádek min-height **57**, padding 0 20, gap 18 · badge h **26**, padding 0 11, r999, 12.5px, tečka 6px, gap 7 · sloupec badge **128 px** · hover řádku.
**Mobil 390:** H1 **20 px** · dlaždice 2×2 gap 10, padding 12/14, číslo 23px a **bez ikon** (jak má artboard 1b) · řádek **58 px**, padding 9/14, dvouřádkový · badge h 25, padding 0 10, 12px · „Přidat hovor" plná šířka 52 px, r13 · nic nepřetéká do stran.

**Funkčně:** hledání „novak" najde firmu *Elektro Novák* i kontakt *Jan Novák* u Kovo Servisu · filtr Schůzka 2, Čeká 3, kombinace bez výsledku hlásí „Nic neodpovídá hledání ani filtru" · prázdný stav vykreslí „Zatím žádné hovory" a statistiky nula · **import s náhledem** proti reálnému CSV: hlavička „Nazev firmy / Kontaktni osoba / Tel. cislo" rozpoznána bez diakritiky, firma s čárkou v uvozovkách nerozbila sloupce, duplicita proti databázi i uvnitř souboru označena, řádek bez firmy přeskočen, řádek bez telefonu označen — tlačítko nabídlo „Naimportovat 2".

### Dvě odchylky, které ověřování odhalilo a jsou opravené
- **H1 na mobilu bylo 22 px místo 20** — globální `h1 { font-size: 22px !important }` přebíjí inline styl. Řešeno stejně jako u Habits: třída `h1.cc-h1` uvnitř media query.
- **Řádek na mobilu měl 61 px místo 58** — globální `line-height` appky přerostl návrhovou výšku. Oběma řádkům textu je nastavená konkrétní výška řádku (1.25 a 1.2), takže se vejdou do 58 px z designu.
- **Spodní navigace:** osmá položka „Cold cally" se na 390 px ořízla na „Cold c…", takže má v tab baru kratší popisek **„Hovory"**; plný název zůstává v postranním panelu i v hlavičce sekce. Ověřeno: 8 položek po 49 px, žádný popisek se neořezává, nic nepřetéká.

Obrazovky „Záznam hovoru" a „Co se učím" jsou zatím kostry, aby odkazy ze seznamu nevedly na 404 — obsah je krok 3.

## Cold cally — krok 3: záznam hovoru a Co se učím
Poslední dvě obrazovky handoffu. Formulář `components/coldCalls/CallForm.tsx` slouží obojímu — novému hovoru (`/cold-cally/novy`) i úpravě existujícího záznamu (`/cold-cally/[id]`), včetně nahraného leadu: u leadu je `vysledek` prázdný, protože „čeká" není výsledek hovoru, a uložením se teprve zapíše `volano_at`. U už zavolaného hovoru se původní čas nepřepisuje.

Validace podle handoffu: povinná **Firma + Výsledek**. Chybějící pole dostane akcentní rámeček a přijde toast s tím, co chybí. Odchod z rozepsaného formuláře se ptá **vlastním dialogem** (`useConfirm`), nikdy nativním `confirm()`.

**Ověřeno vedle prototypu — Záznam hovoru, 1440:** grid **1.2fr 1fr 1fr** (naměřeno 319.5 : 266.25 : 266.25) gap 14 · input h44 r10 padding 0 14, 14.5px · Výsledek 4 tlačítka h44 padding 0 20 r10, vybrané akcentním rámečkem a tónovaným pozadím · řekl/odpověděl min-height **96**, lh 1.55 · REFLEXE 12px/800, letter-spacing .12em (1.44 px), uppercase, akcent · reflexní pole min-height **150**, 15px/1.6, odlišený podklad · „Uložit hovor" h44 padding 0 24 r11.
**390:** titul **17 px** · zpět tlačítko **44×44** r11 · inputy **46 px** r11 · Výsledek **2×2** · řekl/odpověděl **88**, reflexe **132** · patička s tlačítkem **52 px r13**, nic nepřetéká.

**Co se učím, 1440:** H1 23, sloupec **720 px**, položka padding **22px 0**, text **17.5px/1.62**, meta 13px 9 px pod textem, nejnovější nahoře. **390:** H1 20, položka 18px 0, text 15.5px/1.6, meta 12.5.

**Funkčně:** uložení bez výsledku zahlásí „Vyber výsledek hovoru" a skupinu orámuje akcentem · výběr výsledku se propíše · odchod z rozepsaného formuláře otevře vlastní dialog „Zahodit rozepsaný záznam?" · prázdný stav obou obrazovek vykreslen.

### Dvě věci z ověřování
- **Sticky patička na mobilu** nejdřív visela uprostřed formuláře. Příčina: `bottom` u `position: sticky` se počítá proti spodní hraně OBSAHU, a `.main-content` má pod obsahem 80 px rezervu na spodní navigaci — vlastní odsazení se tak sečetlo. S `bottom: 0` sedí patička těsně nad navigací a formulář jí scrolluje pod rukama.
- **Slepá ulička v měření:** `getComputedStyle` v náhledovém panelu vracel u tlačítek výsledku zastaralé hodnoty (inline styl říkal `var(--accent)`, computed hlásil barvu okraje), takže to vypadalo, že se výběr nepropisuje. Screenshot ukázal, že vykreslení je správně. Úpravu, kterou jsem na základě špatné diagnózy udělal, jsem **vrátil zpátky** — v kódu po ní nezůstal ani komentář, který by tvrdil neexistující chybu prohlížeče.

Tím je sekce Cold cally hotová v celém rozsahu zadání: data a import (krok 1), seznam (krok 2), záznam a Co se učím (krok 3).

## Cold cally — „kde skončil" a rozpad fází
K záznamu hovoru přibylo pole **Kde skončil**: button group *Hned zavěsil · Po představení · Při popisu produktu · U ceny · U schůzky*. Výsledek říká, JAK to dopadlo; fáze říká, KDE se to zlomilo — a z toho jde poznat, jestli se láme začátek skriptu, nebo až cena.

Pole je **nepovinné** a druhý tap na vybranou fázi ji zruší: u „nedovoláno" se hovor k žádné fázi nedostal a nahraný lead žádnou nemá. Prázdná fáze do rozpadu nevstupuje, jinak by trychtýř tvrdil, že polovina hovorů skončila „nikde". Migrace 0022 přidává sloupec jako nullable s checkem na pět hodnot a částečný index pro rozpad.

**„Co se učím" se přesunulo pod seznam hovorů** a route `/co-se-ucim` je zrušená i s položkou v postranním panelu (ve spodní liště nikdy nebyla). Poznámky se čtou k seznamu, ze kterého pocházejí, takže sedí pod ním — a odpadá jedna položka navigace, která na 390px stejně nebyla kam dát. Sekce má nadpis, počet poznámek, kartu **„Kde hovory končí"** (řádek na fázi: popisek, proporční pruh, počet a procento) a pod ní poznámky v rozměrech z handoffu (17.5px/1.62 na desktopu, 15.5/1.6 na mobilu, položka 22 / 18 px, dělicí linka).

Rozpad i poznámky se počítají **ze všech hovorů**, ne z toho, co je zrovna vidět: filtr nad seznamem slouží k hledání záznamu, ne k učení se z nich.

Export CSV má nový sloupec `kde_skoncil` s českým popiskem.

### Ověřeno
- **Migrace proti skutečnému Postgresu:** dvojí spuštění, stávající řádky mají fázi NULL a nic se nerozbilo, platná hodnota projde, neplatná narazí na check, agregace vrací počty po fázích.
- **Vykresleno na 1440 i 390:** button group má pět tlačítek 44 px (46 na mobilu), výběr se propisuje a druhý tap ho ruší · rozpad počítá „z 7 hovorů" a rozdělí 3 · 43 % / 1 · 14 % ×4 (tři hovory bez fáze se nepočítají) · poznámky sedí pod rozpadem · v navigaci ani na stránce už není odkaz na „Co se učím" jako samostatnou obrazovku · nic nepřetéká do stran.
- **Opraveno při ověřování:** popisek „Při popisu produktu" se na 390 px ořízl na „Při popisu produ…", sloupec s popisky je proto širší (126 px) a písmo o půl bodu menší.

Poznámka k průběhu: smazal jsem `.next` za běhu dev serveru a rozbil ho — přesně ta chyba, která je popsaná v CLAUDE.md. Správně je server nejdřív zastavit.

## Cold cally — barevný pruh podle výsledku a bohatší řádek
**Modré podbarvení fronty je pryč.** Zůstal jen barevný pruh 3 px u levého kraje a ten teď nese **každý** řádek podle výsledku: čeká modrý, nedovoláno šedý, odmítnuto červený, zájem jantarový, schůzka zelený. Barvy jsou tytéž, jaké má tečka v badge, takže se nemají jak rozejít. Výsledek jde poznat od pohledu i bez čtení badge; podbarvení celého bloku na to bylo moc.

**Druhý řádek nese kontext.** U leadu telefon a kontaktní osoba — co potřebuješ před vytáčením. U zavolaného na mobilu datum, kontakt a začátek „co příště jinak", na desktopu kontakt a poznámka (datum má vlastní sloupec). Vždy na **jednu řádku s třemi tečkami**, aby výška řádků zůstala pravidelná: 57 px na desktopu, 58 na mobilu, přesně jak má handoff.

Řádek bez kontaktu i bez poznámky (typicky „nedovoláno") druhý řádek prostě nemá — prázdná šedá řádka by jen dělala hluk.

Ověřeno vykreslené na **1440 i 390**: pruhy `rgb(78,140,240)` / `rgb(135,141,150)` / `rgb(232,25,44)` / `rgb(239,175,60)` / `rgb(52,196,106)` podle výsledku, pozadí všech řádků `rgba(0,0,0,0)` (žádné podbarvení), předěly bez výplně, výška řádků 57 / 58 i u dvouřádkových, dlouhé poznámky oříznuté třemi tečkami, nic nepřetéká do stran.

Nepoužité proměnné `--cc-queue-bg` a `--cc-queue-line` jsou odstraněné — pruh bere barvu z palety badge.

## Cold cally — čitelný předěl „ZAVOLÁNO"
„ZAVOLÁNO" bylo tlumené (`--muted` bez podkladu) a v tmavém motivu se skoro ztrácelo, takže seznam vypadal, jako by fronta pokračovala dál. Obě hlavičky mají teď **stejný styl**: 11,5px/800, letter-spacing .1em, verzálky, barva `--text` a jemný podklad `--hover-bg`, který je oddělí od řádků v obou motivech. „ZAVOLÁNO" dostalo počet jako fronta, se správným skloňováním (1 hovor / 2–4 hovory / 5+ hovorů, totéž pro leady).

Ověřeno vykreslené: v tmavém motivu obě hlavičky `rgb(255,255,255)` na `rgba(255,255,255,.04)`, ve světlém `rgb(17,24,39)` na `rgb(243,244,246)` — stejné hodnoty u obou, tedy ani jedna není výraznější; počty „2 leady" a „5 hovorů" tlumeně vedle popisku.
