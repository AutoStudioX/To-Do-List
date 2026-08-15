// Cold cally — typy a odvozená data.
//
// Nic z odvozeného se neukládá: statistiky i seznam poznámek se počítají za
// běhu ze záznamů, aby se nemělo co rozejít po ruční opravě.

export type Vysledek = 'ceka' | 'nedovolano' | 'odmitnuto' | 'zajem' | 'schuzka'

/** Kde hovor skončil. Výsledek říká JAK to dopadlo, fáze KDE se to zlomilo. */
export type Faze = 'hned' | 'po_predstaveni' | 'pri_popisu' | 'u_ceny' | 'u_schuzky'

export type ColdCall = {
  id: string
  user_id: string
  firma: string
  kontakt_jmeno: string | null
  telefon: string | null
  /** co o firmě vím před hovorem — obor, velikost, obrat, čím se živí */
  info: string | null
  vysledek: Vysledek
  /** `null` = lead, nebo se hovor k žádné fázi nedostal (nedovoláno) */
  faze: Faze | null
  co_jsem_rekl: string | null
  co_odpovedel: string | null
  co_spatne: string | null
  co_priste_jinak: string | null
  created_at: string
  volano_at: string | null
}

/**
 * Barvy badge. Hodnoty jsou v `globals.css` jako proměnné, aby sekce fungovala
 * i ve světlém motivu — odstíny z handoffu jsou laděné na tmavé pozadí a na
 * bílé kartě by text neměl kontrast. Rozměry a rozestupy zůstávají z designu
 * přesně, mění se jen barva.
 *
 * `ceka` v prototypu není — je to stav navíc pro nahrané leady. Modrá se
 * v paletě sekce nikde jinde nevyskytuje, takže fronta k obvolání je na první
 * pohled něco jiného než výsledek hovoru a není to další odstín červené.
 */
export const VYSLEDEK_STYL: Record<Vysledek, { label: string; text: string; dot: string; bg: string }> = {
  ceka:       { label: 'Čeká',       text: 'var(--cc-ceka-text)', dot: 'var(--cc-ceka-dot)', bg: 'var(--cc-ceka-bg)' },
  nedovolano: { label: 'Nedovoláno', text: 'var(--cc-ned-text)',  dot: 'var(--cc-ned-dot)',  bg: 'var(--cc-ned-bg)' },
  odmitnuto:  { label: 'Odmítnuto',  text: 'var(--cc-odm-text)',  dot: 'var(--cc-odm-dot)',  bg: 'var(--cc-odm-bg)' },
  zajem:      { label: 'Zájem',      text: 'var(--cc-zaj-text)',  dot: 'var(--cc-zaj-dot)',  bg: 'var(--cc-zaj-bg)' },
  schuzka:    { label: 'Schůzka',    text: 'var(--cc-sch-text)',  dot: 'var(--cc-sch-dot)',  bg: 'var(--cc-sch-bg)' },
}

/**
 * Fáze v pořadí, jak jdou po sobě v hovoru — od zavěšení hned po řeč
 * o schůzce. Pořadí je tu důležité: rozpad se čte odshora dolů jako trychtýř.
 */
export const FAZE: Faze[] = ['hned', 'po_predstaveni', 'pri_popisu', 'u_ceny', 'u_schuzky']

export const FAZE_LABEL: Record<Faze, string> = {
  hned: 'Hned zavěsil',
  po_predstaveni: 'Po představení',
  pri_popisu: 'Při popisu produktu',
  u_ceny: 'U ceny',
  u_schuzky: 'U schůzky',
}

/**
 * Kolikrát hovor skončil v které fázi. Prázdná fáze (lead, nedovoláno) se
 * nepočítá — jinak by trychtýř tvrdil, že polovina hovorů skončila „nikde".
 */
export function rozpadFazi(calls: ColdCall[]): { faze: Faze; pocet: number; podil: number }[] {
  const pocty = Object.fromEntries(FAZE.map(f => [f, 0])) as Record<Faze, number>
  let celkem = 0
  for (const c of calls) {
    if (!c.faze) continue
    pocty[c.faze]++
    celkem++
  }
  return FAZE.map(f => ({ faze: f, pocet: pocty[f], podil: celkem ? pocty[f] / celkem : 0 }))
}

/** Pořadí ve filtru: fronta první, pak výsledky hovoru tak, jak v designu. */
export const VYSLEDKY: Vysledek[] = ['ceka', 'nedovolano', 'odmitnuto', 'zajem', 'schuzka']

/** Výsledky skutečného hovoru — to, co nabízí formulář záznamu. */
export const VYSLEDKY_HOVORU: Vysledek[] = ['nedovolano', 'odmitnuto', 'zajem', 'schuzka']

/**
 * Fáze dává smysl jen tam, kde hovor doopravdy proběhl. U „nedovoláno" se
 * k žádné fázi nedostal a u leadu žádný hovor nebyl — tam se pole nenabízí
 * a případná dřív uložená fáze se zahazuje, ať trychtýř nepočítá s nesmysly.
 */
export const maFazi = (v: Vysledek | '') =>
  v === 'odmitnuto' || v === 'zajem' || v === 'schuzka'

export const jeLead = (c: Pick<ColdCall, 'vysledek'>) => c.vysledek === 'ceka'

// ---- Statistiky ----

export type Statistiky = { dnes: number; celkem: number; odmitnuti: number; schuzky: number; fronta: number }

/**
 * „Dnes zavoláno" počítá podle `volano_at`, ne podle `created_at` — jinak by
 * dnešní import stovky leadů vypadal jako sto hovorů.
 *
 * „Celkem hovorů" ze stejného důvodu nepočítá frontu.
 */
export function statistiky(calls: ColdCall[], dnesKey: string): Statistiky {
  let dnes = 0, celkem = 0, odmitnuti = 0, schuzky = 0, fronta = 0
  for (const c of calls) {
    if (c.vysledek === 'ceka') { fronta++; continue }
    celkem++
    if (c.volano_at && c.volano_at.slice(0, 10) === dnesKey) dnes++
    if (c.vysledek === 'odmitnuto') odmitnuti++
    if (c.vysledek === 'schuzka') schuzky++
  }
  return { dnes, celkem, odmitnuti, schuzky, fronta }
}

/**
 * Řazení seznamu: fronta k obvolání nahoře (nejstarší lead první — kdo čeká
 * nejdéle, na toho se volá dřív), pod ní hovory od nejnovějšího.
 */
export function serad(calls: ColdCall[]): ColdCall[] {
  const klic = (c: ColdCall) => c.volano_at || c.created_at
  return [...calls].sort((a, b) => {
    const la = jeLead(a), lb = jeLead(b)
    if (la !== lb) return la ? -1 : 1
    if (la && lb) return klic(a).localeCompare(klic(b))     // fronta: nejstarší nahoře
    return klic(b).localeCompare(klic(a))                   // hovory: nejnovější nahoře
  })
}

/** Hledání podle firmy i kontaktu, bez ohledu na diakritiku a velikost písmen. */
export function bezDiakritiky(s: string): string {
  return s.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase()
}

export function hledej(calls: ColdCall[], dotaz: string): ColdCall[] {
  const q = bezDiakritiky(dotaz.trim())
  if (!q) return calls
  return calls.filter(c =>
    bezDiakritiky(c.firma).includes(q) || bezDiakritiky(c.kontakt_jmeno ?? '').includes(q))
}

// ---- Datum ----

const DNY_ZKRATKY = ['ne', 'po', 'út', 'st', 'čt', 'pá', 'so']

/**
 * „Dnes 10:12" / „Včera 16:40" / „st 12. 8." — formát z handoffu.
 * Lead bez hovoru ukazuje, kdy přišel do fronty.
 */
export function fmtKdy(iso: string, ted = new Date()): string {
  const d = new Date(iso)
  const den = new Date(d.getFullYear(), d.getMonth(), d.getDate())
  const dnes = new Date(ted.getFullYear(), ted.getMonth(), ted.getDate())
  const rozdil = Math.round((dnes.getTime() - den.getTime()) / 86400000)
  const cas = `${d.getHours()}:${String(d.getMinutes()).padStart(2, '0')}`
  if (rozdil === 0) return `Dnes ${cas}`
  if (rozdil === 1) return `Včera ${cas}`
  return `${DNY_ZKRATKY[d.getDay()]} ${d.getDate()}. ${d.getMonth() + 1}.`
}

/** „před 3 dny" do meta řádku na obrazovce Co se učím. */
export function fmtRelativne(iso: string, ted = new Date()): string {
  const d = new Date(iso)
  const dni = Math.round((new Date(ted.getFullYear(), ted.getMonth(), ted.getDate()).getTime()
    - new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime()) / 86400000)
  if (dni <= 0) return 'dnes'
  if (dni === 1) return 'včera'
  if (dni < 7) return `před ${dni} dny`
  if (dni < 14) return 'před týdnem'
  if (dni < 31) return `před ${Math.round(dni / 7)} týdny`
  if (dni < 60) return 'před měsícem'
  return `před ${Math.round(dni / 30)} měsíci`
}

// ---- Telefon ----

/**
 * Klíč pro porovnání duplicit. Bere posledních devět číslic, takže
 * „+420 777 123 456", „777123456" i „00420777123456" jsou totéž číslo.
 */
export function telefonKlic(tel: string | null | undefined): string {
  const cislice = (tel ?? '').replace(/\D/g, '')
  return cislice.length > 9 ? cislice.slice(-9) : cislice
}

// ---- Info o firmě v odrážkách ----

/** Odrážka v „Info o firmě": pomlčka a mezera. */
export const ODRAZKA = '– '

const jeOdrazka = (radek: string) => /^\s*[-–—•*]/.test(radek)

/** Má text aspoň jednu odrážku? Podle toho se pozná starý zápis od nového. */
export const maOdrazky = (text: string) =>
  text.split('\n').some(r => r.trim() && jeOdrazka(r))

/**
 * Volný text na odrážky, jedna věc na řádek.
 *
 * Dělí se na řádcích a na oddělovačích, kterými se seznam píše jedním tahem
 * (`·`, `•`, `;`, `|`) — na tečce ve větě ne, ta patří do textu. Řádek, který
 * odrážku už má, se nechává být, takže druhé spuštění nic nezkazí.
 */
export function naOdrazky(text: string): string {
  return text
    .split(/\r?\n|[·•;|]/)
    .map(r => r.trim())
    .filter(Boolean)
    .map(r => (jeOdrazka(r) ? r : ODRAZKA + r))
    .join('\n')
}

// ---- Kontrola a sjednocení zápisu ----

/** Firma pod tři znaky není název, se kterým se dá zvednout telefon. */
export const MIN_ZNAKU_FIRMA = 3

/** Jen číslice — mezery, závorky, pomlčky, tečky, lomítka a `+` se ignorují. */
export const cislice = (tel: string) => tel.replace(/\D/g, '')

/** Cokoli kromě číslic a oddělovačů (tedy hlavně písmena) je v čísle chyba. */
const TELEFON_ZNAKY = /^[+\d\s()./-]+$/

export const MIN_CISLIC_TELEFON = 9

/** Chyba k zobrazení, nebo `null` když je název v pořádku. */
export function firmaChyba(firma: string): string | null {
  return firma.trim().length >= MIN_ZNAKU_FIRMA
    ? null
    : `Firma musí mít aspoň ${MIN_ZNAKU_FIRMA} znaky.`
}

/**
 * Chyba k zobrazení, nebo `null` když je číslo v pořádku.
 *
 * Prázdné číslo chyba NENÍ: lead se dá nahrát i bez něj a dohledat ho později
 * (import to tak umí odjakživa). Kontroluje se jen to, co je vyplněné.
 */
export function telefonChyba(tel: string): string | null {
  const t = tel.trim()
  if (!t) return null
  if (!TELEFON_ZNAKY.test(t)) return 'Telefon smí mít jen číslice, mezery, závorky a +.'
  if (cislice(t).length < MIN_CISLIC_TELEFON) return `Telefon musí mít aspoň ${MIN_CISLIC_TELEFON} číslic.`
  return null
}

/**
 * Předvolby, které umíme odříznout od zbytku čísla. Bez nich by se nedalo
 * poznat, kde končí předvolba a začíná číslo — a mezery po trojicích by se
 * počítaly od špatného místa.
 */
const PREDVOLBY = ['420', '421', '380', '359', '353', '386', '385', '381',
  '30', '31', '32', '33', '34', '36', '39', '40', '41', '43', '44', '45', '46', '47', '48', '49',
  '1', '7']

/** Mezery po trojicích zleva: „777123456" → „777 123 456". */
const poTrojicich = (c: string) => c.replace(/(\d{3})(?=\d)/g, '$1 ')

/**
 * Jeden tvar čísla pro celou appku: `+420 777 123 456`.
 *
 * Devět číslic bez předvolby je české číslo, takže dostane +420. Cizí předvolba
 * se nechává (`+48 123 456 789`), zapsaná s `+`, s `00` i bez čehokoli. Číslo,
 * které se nepodaří rozebrat, se jen očistí a rozdělí po trojicích — nikdy se
 * nezahazuje, ať uživatel nepřijde o to, co napsal.
 */
export function normalizujTelefon(tel: string | null | undefined): string | null {
  const t = (tel ?? '').trim()
  if (!t) return null
  let c = cislice(t)
  if (!c) return null

  let mezinarodni = t.startsWith('+')
  if (!mezinarodni && c.startsWith('00')) { c = c.slice(2); mezinarodni = true }

  // Starý zápis s nulou napřed („0 777 123 456") je pořád české číslo.
  if (!mezinarodni && c.length === MIN_CISLIC_TELEFON + 1 && c.startsWith('0')) c = c.slice(1)

  // Devět číslic bez předvolby = české číslo.
  if (!mezinarodni && c.length === MIN_CISLIC_TELEFON) return `+420 ${poTrojicich(c)}`

  // Delší číslo bez `+` bývá předvolba napsaná bez plusu (420777123456).
  const predvolba = PREDVOLBY.find(p => c.startsWith(p)
    && c.length - p.length >= 6 && (mezinarodni || c.length > MIN_CISLIC_TELEFON))
  if (predvolba) return `+${predvolba} ${poTrojicich(c.slice(predvolba.length))}`

  return mezinarodni ? `+${poTrojicich(c)}` : poTrojicich(c)
}

/** „777123456" → „777 123 456"; cizí formáty nechává být. */
export function fmtTelefon(tel: string | null | undefined): string {
  const t = (tel ?? '').trim()
  const c = t.replace(/\D/g, '')
  if (c.length === 9) return `${c.slice(0, 3)} ${c.slice(3, 6)} ${c.slice(6)}`
  if (c.length === 12 && c.startsWith('420')) return `+420 ${c.slice(3, 6)} ${c.slice(6, 9)} ${c.slice(9)}`
  return t
}

// ---- Export ----

const EXPORT_SLOUPCE = [
  'firma', 'kontakt', 'telefon', 'info', 'vysledek', 'kde_skoncil', 'volano', 'vytvoreno',
  'co_jsem_rekl', 'co_odpovedel', 'co_spatne', 'co_priste_jinak',
] as const

/**
 * CSV se středníkem a BOM — stejně jako export tréninků: česká verze Excelu
 * čte čárku jako oddělovač desetin a bez BOM zobrazí háčky rozbitě.
 */
export function doCsv(calls: ColdCall[]): string {
  const esc = (v: unknown) => {
    const s = v == null ? '' : String(v)
    return /[";\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s
  }
  const radek = (c: ColdCall) => [
    c.firma, c.kontakt_jmeno ?? '', c.telefon ?? '', c.info ?? '', VYSLEDEK_STYL[c.vysledek].label,
    c.faze ? FAZE_LABEL[c.faze] : '',
    c.volano_at ? c.volano_at.slice(0, 16).replace('T', ' ') : '',
    c.created_at.slice(0, 16).replace('T', ' '),
    c.co_jsem_rekl ?? '', c.co_odpovedel ?? '', c.co_spatne ?? '', c.co_priste_jinak ?? '',
  ].map(esc).join(';')
  return '﻿' + [EXPORT_SLOUPCE.join(';'), ...calls.map(radek)].join('\n')
}
