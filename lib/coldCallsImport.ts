// Import leadů z CSV nebo Excelu.
//
// Celý soubor je čistá funkce nad polem řádků — parsování, rozpoznání sloupců
// i náhled jdou otestovat bez prohlížeče a bez databáze. Čtení souboru
// (FileReader / XLSX) je až v UI vrstvě.

import { telefonKlic, firmaChyba, telefonChyba, emailChyba, normalizujTelefon } from '@/lib/coldCalls'

export type Mrizka = string[][]

export type Sloupce = { firma: number; kontakt: number; telefon: number; email: number; info: number }

export type NahledRadek = {
  /** číslo řádku v souboru, 1 = první datový řádek (kvůli hlášce uživateli) */
  cislo: number
  firma: string
  kontakt: string
  telefon: string
  email: string
  info: string
  stav: 'ok' | 'bez-telefonu' | 'duplicita' | 'chybna-firma' | 'chybne-cislo'
  /** proč je řádek chybný — text z kontroly, ať uživatel nehádá */
  duvod?: string
  /**
   * E-mail neprošel kontrolou. Není to chyba řádku: lead se naimportuje,
   * jen bez adresy. Bez firmy a bez čísla je lead k ničemu, bez e-mailu ne.
   */
  emailVynechan?: boolean
}

export type Nahled = {
  sloupce: Sloupce
  /** rozpoznaná hlavička; `null` = soubor hlavičku nemá a sloupce se hádaly z obsahu */
  hlavicka: string[] | null
  radky: NahledRadek[]
  pocty: {
    celkem: number; kImportu: number; bezTelefonu: number; duplicit: number
    chybnaFirma: number; chybneCislo: number; chybnych: number
    /** naimportují se, jen bez e-mailu */
    emailVynechan: number
  }
}

// ---- CSV ----

/**
 * Oddělovač se hádá z první řádky: česká verze Excelu ukládá středníkem,
 * export z většiny webů čárkou, občas přistane i tabulátor.
 */
export function detekujOddelovac(text: string): string {
  const prvni = text.split(/\r?\n/, 1)[0] ?? ''
  const pocty = [';', ',', '\t'].map(d => ({ d, n: (prvni.match(new RegExp(`\\${d}`, 'g')) || []).length }))
  const nej = pocty.sort((a, b) => b.n - a.n)[0]
  return nej && nej.n > 0 ? nej.d : ';'
}

/**
 * Parser CSV, který umí uvozovky (a zdvojené uvozovky uvnitř), oddělovač
 * v hodnotě i konce řádků uvnitř uvozovek. `split(',')` by na exportu
 * s adresami spadl hned na prvním „Praha 4, Nusle".
 */
export function parsujCsv(text: string, oddelovac = detekujOddelovac(text)): Mrizka {
  const out: Mrizka = []
  let radek: string[] = []
  let pole = ''
  let vUvozovkach = false
  const cistyText = text.replace(/^﻿/, '')   // BOM z Excelu

  for (let i = 0; i < cistyText.length; i++) {
    const z = cistyText[i]
    if (vUvozovkach) {
      if (z === '"') {
        if (cistyText[i + 1] === '"') { pole += '"'; i++ }
        else vUvozovkach = false
      } else pole += z
      continue
    }
    if (z === '"') { vUvozovkach = true; continue }
    if (z === oddelovac) { radek.push(pole); pole = ''; continue }
    if (z === '\n' || z === '\r') {
      if (z === '\r' && cistyText[i + 1] === '\n') i++
      radek.push(pole); pole = ''
      out.push(radek); radek = []
      continue
    }
    pole += z
  }
  if (pole !== '' || radek.length) { radek.push(pole); out.push(radek) }
  // úplně prázdné řádky (na konci souboru jich bývá víc) do importu nepatří
  return out.filter(r => r.some(b => b.trim() !== ''))
}

// ---- Rozpoznání sloupců ----

const klic = (s: string) => s.normalize('NFD').replace(/[\u0300-\u036f]/g, '')
  .toLowerCase().replace(/[^a-z0-9]/g, '')

// Pořadí uvnitř pole je pořadím jistoty: první shoda vyhrává.
const NAZVY = {
  telefon: ['telefon', 'tel', 'mobil', 'phone', 'mobile', 'cislo', 'telcislo', 'telefonnicislo', 'kontakttelefon', 'gsm'],
  kontakt: ['kontaktnijmeno', 'kontaktniosoba', 'kontaktjmeno', 'kontaktniosobajmeno', 'jmeno', 'kontakt', 'osoba', 'contact', 'contactname', 'person', 'jmenoaprijmeni'],
  firma: ['firma', 'spolecnost', 'company', 'nazevfirmy', 'nazev', 'obchodnijmeno', 'subjekt', 'klient', 'organizace', 'name'],
  // Stejně jako info: jen podle hlavičky. „e-mail" i „mail" projdou, protože
  // `klic()` zahazuje všechno kromě písmen a číslic.
  email: ['email', 'mail', 'emailovaadresa', 'emailadresa', 'kontaktniemail', 'mailovaadresa'],
  // Co o firmě víme předem. Sloupec se hledá JEN podle hlavičky — hádat ho
  // z obsahu by znamenalo, že nejdelší text v souboru skončí jako info,
  // i když je to adresa nebo cokoli jiného.
  info: ['info', 'informace', 'poznamka', 'poznamky', 'popis', 'popisfirmy', 'obor', 'oborcinnosti',
    'cinnost', 'predmetpodnikani', 'note', 'notes', 'description', 'komentar', 'detail'],
} as const

const vypadaJakoTelefon = (v: string) => {
  const c = v.replace(/\D/g, '')
  return c.length >= 9 && c.length <= 14 && /^[\d\s+()./-]+$/.test(v.trim())
}

/**
 * Rozpoznání sloupců podle hlavičky; když hlavička chybí nebo nesedí, hádá se
 * z obsahu. „Hlavičku poznej sám" znamená hlavně nespoléhat na pořadí sloupců —
 * exporty z různých CRM mají firmu jednou první, jindy třetí.
 */
export function detekujSloupce(mrizka: Mrizka): { sloupce: Sloupce; hlavicka: string[] | null } {
  const prvni = mrizka[0] ?? []
  const klice = prvni.map(klic)
  const najdi = (kandidati: readonly string[]) => {
    for (const k of kandidati) {
      const i = klice.findIndex(h => h === k)
      if (i >= 0) return i
    }
    for (const k of kandidati) {
      const i = klice.findIndex(h => h.includes(k))
      if (i >= 0) return i
    }
    return -1
  }
  const podleHlavicky: Sloupce = {
    telefon: najdi(NAZVY.telefon),
    kontakt: najdi(NAZVY.kontakt),
    firma: najdi(NAZVY.firma),
    email: najdi(NAZVY.email),
    info: najdi(NAZVY.info),
  }
  // Aspoň dvě shody v POVINNÉ trojici = první řádek je opravdu hlavička.
  // Samotné „poznámka" o hlavičce nesvědčí.
  const shod = [podleHlavicky.firma, podleHlavicky.kontakt, podleHlavicky.telefon]
    .filter(i => i >= 0).length
  if (shod >= 2) return { sloupce: dopln(podleHlavicky, mrizka.slice(1)), hlavicka: prvni }

  // Bez použitelné hlavičky se hádá z obsahu: telefonní sloupec je ten, kde
  // většina buněk vypadá jako číslo; firma je nejdelší textový sloupec.
  return { sloupce: dopln({ firma: -1, kontakt: -1, telefon: -1, email: -1, info: -1 }, mrizka), hlavicka: null }
}

/** Doplní chybějící sloupce odhadem z obsahu. */
function dopln(s: Sloupce, data: Mrizka): Sloupce {
  const sirka = Math.max(0, ...data.map(r => r.length))
  const obsazene = new Set(Object.values(s).filter(i => i >= 0))
  const sloupec = (i: number) => data.map(r => (r[i] ?? '').trim()).filter(Boolean)

  if (s.telefon < 0) {
    let nej = -1, nejPodil = 0
    for (let i = 0; i < sirka; i++) {
      if (obsazene.has(i)) continue
      const bunky = sloupec(i)
      if (!bunky.length) continue
      const podil = bunky.filter(vypadaJakoTelefon).length / bunky.length
      if (podil > nejPodil && podil >= 0.6) { nejPodil = podil; nej = i }
    }
    if (nej >= 0) { s.telefon = nej; obsazene.add(nej) }
  }
  if (s.firma < 0) {
    // Nejdelší text napříč sloupci — název firmy bývá delší než jméno osoby.
    let nej = -1, nejDelka = 0
    for (let i = 0; i < sirka; i++) {
      if (obsazene.has(i)) continue
      const bunky = sloupec(i).filter(b => !vypadaJakoTelefon(b))
      if (!bunky.length) continue
      const delka = bunky.reduce((a, b) => a + b.length, 0) / bunky.length
      if (delka > nejDelka) { nejDelka = delka; nej = i }
    }
    if (nej >= 0) { s.firma = nej; obsazene.add(nej) }
  }
  if (s.kontakt < 0) {
    for (let i = 0; i < sirka; i++) {
      if (!obsazene.has(i) && sloupec(i).length) { s.kontakt = i; break }
    }
  }
  return s
}

// ---- Náhled ----

/**
 * Co se naimportuje. Duplicita se pozná podle telefonu — jak proti už uloženým
 * záznamům, tak uvnitř souboru (stejná firma bývá v exportu dvakrát).
 *
 * Řádek, který neprojde kontrolou, se označí a NEnaimportuje — stejně jako
 * duplicita. Tvrdá jsou dvě pole: název firmy (aspoň tři znaky) a vyplněný
 * telefon (aspoň devět číslic, žádná písmena) — bez nich je lead k ničemu.
 *
 * Vadný e-mail řádek nezabíjí: naimportuje se bez adresy a v náhledu je to
 * varování, ne chyba. Kvůli překlepu v mailu nemá smysl zahodit firmu i číslo.
 *
 * Řádek bez telefonu se naimportovat DÁ, jen je označený — číslo se dá
 * dohledat, ale ať uživatel ví, kolik jich bude. Prázdné pole není špatně
 * vyplněné pole.
 */
export function pripravNahled(mrizka: Mrizka, existujiciTelefony: Iterable<string>): Nahled {
  const { sloupce, hlavicka } = detekujSloupce(mrizka)
  const data = hlavicka ? mrizka.slice(1) : mrizka
  const videne = new Set<string>()
  for (const t of existujiciTelefony) { const k = telefonKlic(t); if (k) videne.add(k) }

  const radky: NahledRadek[] = data.map((r, i) => {
    const bunka = (idx: number) => (idx >= 0 ? (r[idx] ?? '').trim() : '')
    const firma = bunka(sloupce.firma)
    const kontakt = bunka(sloupce.kontakt)
    const telefon = bunka(sloupce.telefon)
    const email = bunka(sloupce.email)
    const info = bunka(sloupce.info)
    const k = telefonKlic(telefon)
    const chybaF = firmaChyba(firma)
    const chybaT = telefonChyba(telefon)
    const chybaE = emailChyba(email)
    let stav: NahledRadek['stav']
    let duvod: string | undefined
    if (chybaF) { stav = 'chybna-firma'; duvod = chybaF }
    else if (chybaT) { stav = 'chybne-cislo'; duvod = chybaT }
    else if (k && videne.has(k)) stav = 'duplicita'
    else if (!k) stav = 'bez-telefonu'
    else stav = 'ok'
    if (stav === 'ok') videne.add(k)
    return { cislo: i + 1, firma, kontakt, telefon, email, info, stav, duvod,
      emailVynechan: !!chybaE || undefined }
  })

  const spocti = (s: NahledRadek['stav']) => radky.filter(r => r.stav === s).length
  const chybnaFirma = spocti('chybna-firma')
  const chybneCislo = spocti('chybne-cislo')
  return {
    sloupce, hlavicka, radky,
    pocty: {
      celkem: radky.length,
      kImportu: spocti('ok') + spocti('bez-telefonu'),
      bezTelefonu: spocti('bez-telefonu'),
      duplicit: spocti('duplicita'),
      chybnaFirma, chybneCislo, chybnych: chybnaFirma + chybneCislo,
      // Počítá se jen u řádků, které se opravdu uloží — u přeskočeného řádku
      // by hláška „naimportuje se bez e-mailu" lhala.
      emailVynechan: radky.filter(r => r.emailVynechan
        && (r.stav === 'ok' || r.stav === 'bez-telefonu')).length,
    },
  }
}

/** Řádky, které se opravdu uloží — s telefonem sjednoceným do jednoho tvaru. */
export function kImportu(nahled: Nahled): {
  firma: string; kontakt_jmeno: string | null; telefon: string | null
  email: string | null; info: string | null
}[] {
  return nahled.radky
    .filter(r => r.stav === 'ok' || r.stav === 'bez-telefonu')
    .map(r => ({
      firma: r.firma.trim(),
      kontakt_jmeno: r.kontakt || null,
      telefon: normalizujTelefon(r.telefon),
      // Vadná adresa se zahodí, řádek projde bez ní.
      email: r.emailVynechan ? null : (r.email.trim() || null),
      info: r.info || null,
    }))
}

// ---- Čtení souboru ----

/**
 * Načte CSV i Excel do stejné mřížky, takže zbytek importu o formátu neví.
 *
 * `xlsx` (SheetJS) se natahuje dynamicky — je to skoro megabajt a při běžné
 * práci se sekcí ho nikdo nepotřebuje. CSV se parsuje vlastním parserem výš,
 * knihovna se zapojí až u opravdového Excelu.
 */
export async function nactiSoubor(file: File): Promise<Mrizka> {
  const jmeno = file.name.toLowerCase()
  const jeExcel = /\.(xlsx|xlsm|xlsb|xls)$/.test(jmeno)
  if (!jeExcel) return parsujCsv(await file.text())

  const XLSX = await import('xlsx')
  const wb = XLSX.read(await file.arrayBuffer(), { type: 'array' })
  const list = wb.Sheets[wb.SheetNames[0]]
  if (!list) return []
  // `header: 1` vrátí pole polí — stejný tvar jako z CSV. `raw: false` nechá
  // čísla naformátovaná jako text, aby se z telefonu nestala 7.77123456e8.
  const mrizka = XLSX.utils.sheet_to_json<string[]>(list, { header: 1, raw: false, defval: '' })
  return mrizka
    .map(r => (Array.isArray(r) ? r.map(b => String(b ?? '').trim()) : []))
    .filter(r => r.some(b => b !== ''))
}
