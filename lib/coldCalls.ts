// Cold cally — typy a odvozená data.
//
// Nic z odvozeného se neukládá: statistiky i seznam poznámek se počítají za
// běhu ze záznamů, aby se nemělo co rozejít po ruční opravě.

export type Vysledek = 'ceka' | 'nedovolano' | 'odmitnuto' | 'zajem' | 'schuzka'

export type ColdCall = {
  id: string
  user_id: string
  firma: string
  kontakt_jmeno: string | null
  telefon: string | null
  vysledek: Vysledek
  co_jsem_rekl: string | null
  co_odpovedel: string | null
  co_spatne: string | null
  co_priste_jinak: string | null
  created_at: string
  volano_at: string | null
}

/**
 * Barvy badge přesně z handoffu. `ceka` v prototypu není — je to stav navíc
 * pro nahrané leady, viz `VYSLEDEK_POradi` a poznámka u návrhu.
 *
 * Modrá se v paletě sekce nikde jinde nevyskytuje, takže fronta k obvolání je
 * na první pohled něco jiného než výsledek hovoru, a přitom to není další
 * odstín červené (ta patří odmítnutí).
 */
export const VYSLEDEK_STYL: Record<Vysledek, { label: string; text: string; dot: string; bg: string }> = {
  ceka:       { label: 'Čeká',       text: '#8FB8FF', dot: '#4E8CF0', bg: 'rgba(78,140,240,.14)' },
  nedovolano: { label: 'Nedovoláno', text: '#A9AEB6', dot: '#878D96', bg: 'rgba(151,157,166,.13)' },
  odmitnuto:  { label: 'Odmítnuto',  text: '#FF7A83', dot: '#E8192C', bg: 'rgba(232,25,44,.14)' },
  zajem:      { label: 'Zájem',      text: '#F3BE5E', dot: '#EFAF3C', bg: 'rgba(239,175,60,.13)' },
  schuzka:    { label: 'Schůzka',    text: '#5BD98B', dot: '#34C46A', bg: 'rgba(52,196,106,.13)' },
}

/** Pořadí ve filtru: fronta první, pak výsledky hovoru tak, jak v designu. */
export const VYSLEDKY: Vysledek[] = ['ceka', 'nedovolano', 'odmitnuto', 'zajem', 'schuzka']

/** Výsledky skutečného hovoru — to, co nabízí formulář záznamu. */
export const VYSLEDKY_HOVORU: Vysledek[] = ['nedovolano', 'odmitnuto', 'zajem', 'schuzka']

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
  'firma', 'kontakt', 'telefon', 'vysledek', 'volano', 'vytvoreno',
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
    c.firma, c.kontakt_jmeno ?? '', c.telefon ?? '', VYSLEDEK_STYL[c.vysledek].label,
    c.volano_at ? c.volano_at.slice(0, 16).replace('T', ' ') : '',
    c.created_at.slice(0, 16).replace('T', ' '),
    c.co_jsem_rekl ?? '', c.co_odpovedel ?? '', c.co_spatne ?? '', c.co_priste_jinak ?? '',
  ].map(esc).join(';')
  return '﻿' + [EXPORT_SLOUPCE.join(';'), ...calls.map(radek)].join('\n')
}
