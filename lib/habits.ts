// Návyky — odvozená data.
//
// NIC Z TOHOTO SE NEUKLÁDÁ. Série, procenta, sytosti i úspěšnost se počítají
// za běhu z `habit_entries` podle README (sekce State Management). Uložená
// derivace by se rozešla s daty při první ruční opravě záznamu.

export type HabitType = 'bool' | 'cil'
export type HabitSource = 'rucne' | 'trenink'

export type Habit = {
  id: string
  klic: string | null
  nazev: string
  podtitul: string | null
  typ: HabitType
  cil: number | null
  jednotka: string | null
  krok: number | null
  ikona: string
  poradi: number
  zdroj: HabitSource
  archivovany: boolean
  /** „06:30" — nepovinný začátek; NULL = bez času */
  cas: string | null
  /** „08:00" — nepovinný konec rozsahu; bez `cas` nedává smysl */
  cas_do: string | null
  /** dny platnosti 1=Po … 7=Ne; NULL nebo prázdné = každý den */
  dny: number[] | null
  /** kdy návyk vznikl — dřívější dny se nekreslí ani nepočítají */
  created_at?: string
}

/** „Splněný den" pro série a souhrn = aspoň tolik splněných návyků (README). */
export const DAY_DONE_THRESHOLD = 4

/** Sytost mřížky 0→4. */
export const LEVEL_COLORS = ['#1C1D21', '#4A1A1D', '#7A2126', '#B02A30', '#E5484D'] as const

export const DAY_LABELS = ['Po', 'Út', 'St', 'Čt', 'Pá', 'So', 'Ne'] as const

/** 1 → „den", 2–4 → „dny", jinak „dní". */
export function dayWord(n: number): string {
  return n === 1 ? 'den' : (n >= 2 && n <= 4 ? 'dny' : 'dní')
}

/**
 * 1 → „návyk", 2–4 → „návyky", jinak „návyků".
 *
 * Prototyp má v hintu natvrdo „Splň ještě {k} návyky", takže při k=1 psal
 * „Splň ještě 1 návyky". README skloňování řeší u dnů, ale u návyků na to
 * zapomněl.
 */
export function habitWord(n: number): string {
  return n === 1 ? 'návyk' : (n >= 2 && n <= 4 ? 'návyky' : 'návyků')
}

export function metOn(h: Pick<Habit, 'typ' | 'cil'>, v: number): boolean {
  return h.typ === 'bool' ? v >= 1 : v >= (h.cil ?? Infinity)
}

export function ratio(h: Pick<Habit, 'typ' | 'cil'>, v: number): number {
  if (h.typ === 'bool') return v >= 1 ? 1 : 0
  const cil = h.cil ?? 0
  return cil > 0 ? Math.min(1, v / cil) : 0
}

export function level(r: number): 0 | 1 | 2 | 3 | 4 {
  return r >= 1 ? 4 : r >= 0.75 ? 3 : r >= 0.5 ? 2 : r > 0 ? 1 : 0
}

/**
 * Sytost souhrnného řádku dne: podíl splněných návyků přepočtený na 0–4.
 * Prototyp má dělitel natvrdo 5 (tolik měl návyků) — tady je to počet návyků,
 * aby to sedělo i po přidání dalšího.
 */
export function dayLevel(count: number, habitCount: number): 0 | 1 | 2 | 3 | 4 {
  if (count <= 0 || habitCount <= 0) return 0
  return Math.max(1, Math.round(count / habitCount * 4)) as 1 | 2 | 3 | 4
}

/**
 * Série z denních počtů (nejstarší → nejnovější).
 *
 * `cur` se schválně počítá od PŘEDPOSLEDNÍHO dne dozadu a dnešek se přičte až
 * nakonec — den, který ještě neskončil, tak sérii nesrazí. Nesplněné dnešní
 * ráno neznamená, že o sérii přicházíš; teprve zítra.
 */
export function streaks(counts: number[]): { cur: number; longest: number } {
  const ok = counts.map(c => c >= DAY_DONE_THRESHOLD)
  let longest = 0, run = 0
  for (const v of ok) { run = v ? run + 1 : 0; if (run > longest) longest = run }
  let cur = 0
  for (let i = ok.length - 2; i >= 0; i--) { if (ok[i]) cur++; else break }
  if (ok[ok.length - 1]) cur++
  return { cur, longest }
}

/** Kolik návyků bylo splněno v každém dni okna. */
export function dayCounts(habits: Habit[], valuesByDay: Record<string, number>[]): number[] {
  return valuesByDay.map(vals => habits.reduce((c, h) => c + (metOn(h, vals[h.id] ?? 0) ? 1 : 0), 0))
}

/** Úspěšnost návyku v okně: podíl dnů, kdy byl splněn. */
export function successRate(h: Habit, values: number[]): number {
  if (!values.length) return 0
  return values.filter(v => metOn(h, v)).length / values.length
}

/** Nejslabší návyk okna. Návyky bez historie se neposuzují. */
export function weakestHabit(habits: Habit[], valuesByHabit: Record<string, number[]>): { habit: Habit; rate: number } | null {
  let best: { habit: Habit; rate: number } | null = null
  for (const h of habits) {
    const vals = valuesByHabit[h.id]
    if (!vals?.length) continue
    const rate = successRate(h, vals)
    if (!best || rate < best.rate) best = { habit: h, rate }
  }
  return best
}

// ---- Datum ----

/** `2026-08-11` v místním čase. `toISOString()` by u večerních hodin ujel o den. */
export function dayKey(d: Date): string {
  const p = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`
}

/** Klíče posledních `n` dnů, nejstarší → dnešek. */
export function lastDays(n: number, today = new Date()): string[] {
  const base = new Date(today.getFullYear(), today.getMonth(), today.getDate())
  const out: string[] = []
  for (let i = n - 1; i >= 0; i--) {
    const d = new Date(base)
    d.setDate(d.getDate() - i)
    out.push(dayKey(d))
  }
  return out
}

/** Posun o dny: „2026-08-12" + (-1) → „2026-08-11". Přes měsíce i roky. */
export function shiftDay(key: string, delta: number): string {
  const [y, m, d] = key.split('-').map(Number)
  const dt = new Date(y, m - 1, d)
  dt.setDate(dt.getDate() + delta)
  return dayKey(dt)
}

/** Po=0 … Ne=6 (README má popisky Po–Ne). */
export function weekdayIndex(key: string): number {
  const [y, m, d] = key.split('-').map(Number)
  return (new Date(y, m - 1, d).getDay() + 6) % 7
}

// ---- Návyk napojený na trénink ----

/**
 * Hodnoty návyku „trénink" se NEČTOU z `habit_entries` — dopočítají se z dnů,
 * kdy existuje trénink. Čtení, ne zápis: jediná pravda je trénink sám, takže
 * se nemá co rozejít a nic se nemusí synchronizovat.
 */
export function trainingValues(days: string[], workoutDates: Set<string>): Record<string, number> {
  const out: Record<string, number> = {}
  for (const d of days) out[d] = workoutDates.has(d) ? 1 : 0
  return out
}

/** Návyk, na který se v UI nedá ťuknout — hodnota je odjinud. */
export function isReadOnly(h: Pick<Habit, 'zdroj'>): boolean {
  return h.zdroj !== 'rucne'
}

/**
 * Série jednoho návyku. Schválně jede přes `streaks()` na převedeném poli,
 * aby platilo TOTÉŽ pravidlo jako v Přehledu — včetně toho, že rozdělaný
 * dnešek sérii nesrazí. Prototyp měl v detailu vlastní počítání, které se
 * lámalo hned na dnešku, a návyk s týdnem za sebou ukazoval „0 dní v řadě".
 */
export function habitStreaks(h: Pick<Habit, 'typ' | 'cil'>, values: number[]): { cur: number; longest: number } {
  return streaks(values.map(v => (metOn(h, v) ? DAY_DONE_THRESHOLD : 0)))
}

/** Kde nejdelší série ležela — kvůli notě „duben – květen" místo natvrdo psaného textu. */
export function longestStreakSpan(counts: number[], days: string[]): { length: number; from: string; to: string } | null {
  let best = 0, bestEnd = -1, run = 0
  counts.forEach((c, i) => {
    run = c >= DAY_DONE_THRESHOLD ? run + 1 : 0
    if (run > best) { best = run; bestEnd = i }
  })
  if (!best || bestEnd < 0) return null
  return { length: best, from: days[bestEnd - best + 1], to: days[bestEnd] }
}

const MONTHS = ['leden', 'únor', 'březen', 'duben', 'květen', 'červen',
  'červenec', 'srpen', 'září', 'říjen', 'listopad', 'prosinec']

/** „duben – květen" / „srpen" — nota k nejdelší sérii. */
export function fmtMonthSpan(from: string, to: string): string {
  const a = MONTHS[Number(from.slice(5, 7)) - 1]
  const b = MONTHS[Number(to.slice(5, 7)) - 1]
  return a === b ? a : `${a} – ${b}`
}

/**
 * Kolik prázdných buněk předchází prvnímu dni v roční mřížce.
 * Prototyp má natvrdo 6 (sedělo to na jeho generovaná data) — u reálných dat
 * to musí vyjít ze skutečného dne v týdnu, jinak mřížka sedí na špatné řádky.
 */
export function yearGridOffset(firstDay: string): number {
  return weekdayIndex(firstDay)
}

/** Barva skóre v matici: ≥80 % akcent, ≥50 % běžný text, jinak tlumeně. */
export function scoreTone(hit: number, total: number): 'accent' | 'text' | 'muted' {
  if (!total) return 'muted'
  const r = hit / total
  return r >= 0.8 ? 'accent' : r >= 0.5 ? 'text' : 'muted'
}

// ---- Čas a dny platnosti ----

/** „06:30:00" → „6:30". Bez času prázdný řetězec. */
export function fmtTime(cas: string | null | undefined): string {
  if (!cas) return ''
  return cas.slice(0, 5).replace(/^0/, '')
}

/**
 * „7:30 – 8:00" s rozsahem, „7:30" jen se začátkem, prázdno bez času.
 * Pomlčka je půlčtverčíková (–), ne spojovník.
 */
export function fmtTimeRange(cas: string | null | undefined, casDo: string | null | undefined): string {
  const od = fmtTime(cas)
  if (!od) return ''
  const doK = fmtTime(casDo)
  return doK ? `${od} – ${doK}` : od
}

/** Platí návyk v daný den? Prázdné `dny` = každý den. */
export function appliesOn(h: Pick<Habit, 'dny'>, day: string): boolean {
  if (!h.dny || h.dny.length === 0) return true
  return h.dny.includes(weekdayIndex(day) + 1)
}

/** Dny, ve kterých návyk platí, vzestupně (1=Po). Prázdné `dny` = všech sedm. */
export function activeDays(h: Pick<Habit, 'dny'>): number[] {
  if (!h.dny || h.dny.length === 0) return [1, 2, 3, 4, 5, 6, 7]
  return [...new Set(h.dny)].filter(d => d >= 1 && d <= 7).sort((a, b) => a - b)
}

// ---- Čas po dnech ----
//
// `habits.cas` / `cas_do` je VÝCHOZÍ čas a platí pro všechny dny. Tabulka
// `habit_times` drží jen výjimky — den bez záznamu jede podle výchozího.

export type HabitTime = {
  habit_id: string
  /** 1 = pondělí … 7 = neděle */
  den: number
  cas_od: string
  cas_do: string | null
}

export type CasRozsah = { cas: string | null; cas_do: string | null }

/** habit_id → den → vlastní čas. */
export type TimeOverrides = Record<string, Record<number, CasRozsah>>

export function indexTimes(rows: HabitTime[]): TimeOverrides {
  const out: TimeOverrides = {}
  for (const r of rows) {
    ;(out[r.habit_id] ||= {})[r.den] = { cas: r.cas_od, cas_do: r.cas_do }
  }
  return out
}

/**
 * Čas návyku pro konkrétní den: výjimka pro ten den, jinak výchozí z návyku.
 *
 * Výjimka platí i u návyku bez výchozího času — „záznam pro den chybí" je
 * jediná podmínka, za které se sahá po výchozím.
 */
export function timeOn(
  h: Pick<Habit, 'id' | 'cas' | 'cas_do'>, overrides: TimeOverrides, day: string,
): CasRozsah {
  const vlastni = overrides[h.id]?.[weekdayIndex(day) + 1]
  return vlastni ?? { cas: h.cas, cas_do: h.cas_do }
}

/** Má návyk aspoň jednu denní výjimku? Rozhoduje o přepínači v editoru. */
export function hasPerDayTimes(h: Pick<Habit, 'id'>, overrides: TimeOverrides): boolean {
  return Object.keys(overrides[h.id] ?? {}).length > 0
}

/**
 * Řazení hlavní stránky: nejdřív návyky S ČASEM vzestupně, pod nimi ostatní
 * podle ručního pořadí. Šipky proto přeuspořádávají jen tu druhou skupinu —
 * u návyku s časem rozhoduje čas, ne `poradi`.
 */
export function sortHabits(list: Habit[]): Habit[] {
  return sortByTime(list, h => h.cas)
}

/**
 * Řazení seznamu KONKRÉTNÍHO dne. Focus v 7:00 ve středu musí ve středu stát
 * nad snídaní v 7:30, i když jeho výchozí čas je 10:00 — jinak by se seznam
 * řadil podle času, který ten den neplatí.
 */
export function sortHabitsOn(list: Habit[], overrides: TimeOverrides, day: string): Habit[] {
  return sortByTime(list, h => timeOn(h, overrides, day).cas)
}

function sortByTime(list: Habit[], cas: (h: Habit) => string | null): Habit[] {
  return [...list].sort((a, b) => {
    const ca = cas(a), cb = cas(b)
    if (ca && cb) return ca.localeCompare(cb) || a.poradi - b.poradi
    if (ca) return -1
    if (cb) return 1
    return a.poradi - b.poradi
  })
}

/**
 * Existoval návyk v ten den? Den před jeho vznikem není „nesplněno", ale
 * „neexistovalo" — nesmí se kreslit ani počítat do skóre.
 */
export function existsOn(h: Pick<Habit, 'created_at'>, day: string): boolean {
  if (!h.created_at) return true
  return day >= h.created_at.slice(0, 10)
}

/** Den, který se u návyku vůbec sleduje: existoval A platil. */
export function tracksOn(h: Pick<Habit, 'dny' | 'created_at'>, day: string): boolean {
  return existsOn(h, day) && appliesOn(h, day)
}

/**
 * Za každý den okna: kolik návyků ten den PLATILO a kolik jich bylo splněno.
 *
 * Den, kdy návyk neplatil, se nesmí počítat jako nesplněný — jinak by úterní
 * návyk táhl statistiku dolů za všechny ostatní dny v týdnu.
 */
export function dayStats(
  habits: Habit[], days: string[], byHabit: Record<string, number[]>,
): { applicable: number; met: number }[] {
  return days.map((d, i) => {
    let applicable = 0, met = 0
    for (const h of habits) {
      if (!tracksOn(h, d)) continue
      applicable++
      if (metOn(h, byHabit[h.id]?.[i] ?? 0)) met++
    }
    return { applicable, met }
  })
}

/** Úspěšnost návyku jen přes dny, kdy platil. */
export function successRateOn(h: Habit, days: string[], values: number[]): { hit: number; total: number } {
  let hit = 0, total = 0
  days.forEach((d, i) => {
    if (!tracksOn(h, d)) return
    total++
    if (metOn(h, values[i] ?? 0)) hit++
  })
  return { hit, total }
}

/** Série návyku jen přes dny, kdy platil — vynechané dny sérii nelámou. */
export function habitStreaksOn(h: Habit, days: string[], values: number[]): { cur: number; longest: number } {
  const applicable: number[] = []
  days.forEach((d, i) => {
    if (!tracksOn(h, d)) return
    applicable.push(metOn(h, values[i] ?? 0) ? DAY_DONE_THRESHOLD : 0)
  })
  return streaks(applicable)
}

/**
 * Index prvního dne okna, který má smysl kreslit — nikdy dřív, než vznikl
 * nejstarší z návyků.
 *
 * Bez toho měl řádek u návyku založeného dnes třicet buněk, z toho 29
 * prázdných výplní, a skóre 0/30 místo 0/1.
 */
export function windowStart(habits: Pick<Habit, 'created_at'>[], days: string[]): number {
  if (!habits.length) return 0
  let earliest: string | null = null
  for (const h of habits) {
    const d = h.created_at?.slice(0, 10)
    if (!d) return 0                       // neznámý vznik → okno neomezujeme
    if (!earliest || d < earliest) earliest = d
  }
  const i = days.findIndex(d => d >= earliest!)
  return i < 0 ? Math.max(0, days.length - 1) : i
}
