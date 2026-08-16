'use client'
import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { useConfirm } from '@/components/ConfirmDialog'
import {
  VYSLEDKY_HOVORU, VYSLEDEK_STYL, FAZE, FAZE_LABEL, maFazi,
  firmaChyba, telefonChyba, emailChyba, normalizujTelefon,
  naOdrazky, rozlozOdrazky, slozOdrazky, ocistiInfo,
  type ColdCall, type Faze, type Vysledek,
} from '@/lib/coldCalls'
import { ChevronLeft, Check, X, List, Plus } from 'lucide-react'

export type Draft = {
  firma: string
  kontakt_jmeno: string
  telefon: string
  email: string
  info: string
  vysledek: Vysledek | ''
  faze: Faze | ''
  co_jsem_rekl: string
  co_odpovedel: string
  co_spatne: string
  co_priste_jinak: string
}

const prazdny: Draft = {
  firma: '', kontakt_jmeno: '', telefon: '', email: '', info: '', vysledek: '', faze: '',
  co_jsem_rekl: '', co_odpovedel: '', co_spatne: '', co_priste_jinak: '',
}

export const draftZaznamu = (c: ColdCall): Draft => ({
  firma: c.firma,
  kontakt_jmeno: c.kontakt_jmeno ?? '',
  telefon: c.telefon ?? '',
  email: c.email ?? '',
  info: c.info ?? '',
  // Lead ještě nemá výsledek hovoru — `ceka` není nic, co by se dalo vybrat.
  vysledek: c.vysledek === 'ceka' ? '' : c.vysledek,
  faze: c.faze ?? '',
  co_jsem_rekl: c.co_jsem_rekl ?? '',
  co_odpovedel: c.co_odpovedel ?? '',
  co_spatne: c.co_spatne ?? '',
  co_priste_jinak: c.co_priste_jinak ?? '',
})

/**
 * Záznam hovoru (artboardy 2a/2b) — stejný formulář pro nový hovor i pro
 * úpravu existujícího záznamu včetně nahraného leadu.
 *
 * Reflexní pole jsou vizuálně nejsilnější část obrazovky schválně: podle
 * handoffu je to „to nejdůležitější z celého záznamu".
 */
export default function CallForm({ zaznam, isMobile, onSaved, onError }: {
  /** vyplněné = úprava (i lead), prázdné = nový hovor */
  zaznam?: ColdCall
  isMobile: boolean
  onSaved: (hlaska: string) => void
  onError: (hlaska: string) => void
}) {
  const router = useRouter()
  const [d, setD] = useState<Draft>(zaznam ? draftZaznamu(zaznam) : prazdny)
  const [saving, setSaving] = useState(false)
  const [ukazChyby, setUkazChyby] = useState(false)
  // Chyba se ukáže až po opuštění pole nebo po pokusu uložit — ne u druhého
  // znaku názvu, kdy uživatel teprve píše.
  const [dotknuto, setDotknuto] = useState<{ firma?: boolean; telefon?: boolean; email?: boolean }>({})
  const { confirm, dialog } = useConfirm()

  const set = <K extends keyof Draft>(k: K, v: Draft[K]) => setD(p => ({ ...p, [k]: v }))

  // ---- odrážky v „Info o firmě" ----
  const odrazky = rozlozOdrazky(d.info)
  const nastavOdrazky = (nove: string[]) => set('info', slozOdrazky(nove))
  /** Po přidání/ubrání odrážky patří kurzor do té, se kterou uživatel pracuje. */
  const zaostri = (i: number, naKonec = false) => setTimeout(() => {
    const el = document.getElementById(`cc-info-${i}`) as HTMLInputElement | null
    el?.focus()
    if (el && naKonec) el.setSelectionRange(el.value.length, el.value.length)
  }, 0)

  function klavesaOdrazky(e: React.KeyboardEvent<HTMLInputElement>, i: number) {
    if (e.key === 'Enter' && !e.nativeEvent.isComposing) {
      e.preventDefault()
      const nove = [...odrazky]
      nove.splice(i + 1, 0, '')
      nastavOdrazky(nove)
      zaostri(i + 1)
      return
    }
    // Backspace v prázdné odrážce ji zruší — jinak by po ní zůstal prázdný
    // řádek, který jde smazat jen přes tlačítko.
    if (e.key === 'Backspace' && odrazky[i] === '' && odrazky.length > 1) {
      e.preventDefault()
      nastavOdrazky(odrazky.filter((_, j) => j !== i))
      zaostri(Math.max(0, i - 1), true)
    }
  }

  const zmeneno = JSON.stringify(d) !== JSON.stringify(zaznam ? draftZaznamu(zaznam) : prazdny)
  const chybaFirmy = firmaChyba(d.firma)
  const chybaTelefonu = telefonChyba(d.telefon)
  const chybaEmailu = emailChyba(d.email)
  const chybiVysledek = !d.vysledek
  const chybiFirma = !!chybaFirmy
  // Tvar, ve kterém se číslo uloží — ukazuje se, jen když se liší od zápisu.
  const telefonPoUlozeni = chybaTelefonu ? null : normalizujTelefon(d.telefon)
  const fazeVidet = maFazi(d.vysledek)

  // Nový záznam startuje s kurzorem ve Firmě, jak chce handoff.
  useEffect(() => {
    if (!zaznam) document.getElementById('cc-firma')?.focus()
  }, [zaznam])

  async function uloz() {
    // Neuloží se nic, co neprojde kontrolou — a uživatel se dozví proč,
    // v hlášce i u pole samotného.
    const prvniChyba = chybaFirmy || chybaTelefonu || chybaEmailu
      || (chybiVysledek ? 'Vyber výsledek hovoru' : null)
    if (prvniChyba) {
      setUkazChyby(true)
      onError(prvniChyba)
      return
    }
    setSaving(true)
    const supabase = createClient()
    const { data: { session } } = await supabase.auth.getSession()
    const user = session?.user
    if (!user) { setSaving(false); onError('Uložení selhalo: nejsi přihlášený'); return }

    const payload = {
      firma: d.firma.trim(),
      kontakt_jmeno: d.kontakt_jmeno.trim() || null,
      // Jeden tvar pro celou appku: +420 777 123 456.
      telefon: normalizujTelefon(d.telefon),
      email: d.email.trim() || null,
      info: ocistiInfo(d.info),
      vysledek: d.vysledek as Vysledek,
      // Fáze je nepovinná a u výsledku bez fáze se neukládá vůbec —
      // i kdyby ji záznam nesl z dřívějška.
      faze: (maFazi(d.vysledek as Vysledek) && d.faze) || null,
      co_jsem_rekl: d.co_jsem_rekl.trim() || null,
      co_odpovedel: d.co_odpovedel.trim() || null,
      co_spatne: d.co_spatne.trim() || null,
      co_priste_jinak: d.co_priste_jinak.trim() || null,
      // Čas hovoru se zapisuje teď — u leadu tím teprve vzniká, u úpravy
      // hotového hovoru se původní čas nepřepisuje.
      volano_at: zaznam?.volano_at ?? new Date().toISOString(),
    }
    const { error } = zaznam
      ? await supabase.from('cold_calls').update(payload).eq('id', zaznam.id)
      : await supabase.from('cold_calls').insert({ ...payload, user_id: user.id })
    setSaving(false)
    if (error) { onError(`Uložení selhalo: ${error.message}`); return }
    onSaved(zaznam ? 'Hovor upraven' : 'Hovor uložen')
  }

  async function zrus() {
    // Rozepsaný formulář se nezahazuje bez zeptání — a nikdy nativním confirm().
    if (zmeneno && !await confirm('Zahodit rozepsaný záznam? Nejde to vrátit.', 'Zahodit')) return
    router.push('/cold-cally')
  }

  // ---- styly z handoffu ----
  const label: React.CSSProperties = {
    display: 'block', fontSize: 13, fontWeight: 600, color: 'var(--muted)', marginBottom: 8,
  }
  const pole: React.CSSProperties = {
    width: '100%', height: isMobile ? 46 : 44, padding: isMobile ? '0 14px' : '0 14px',
    borderRadius: isMobile ? 11 : 10,
    // Longhand schválně: `chybne()` přepisuje jen barvu rámečku a míchat
    // zkratku `border` s `borderColor` React při překreslení hlásí jako chybu.
    borderWidth: 1, borderStyle: 'solid', borderColor: 'var(--border)',
    background: 'var(--input-bg)', color: 'var(--text)', fontSize: isMobile ? 16 : 14.5,
    boxSizing: 'border-box', fontFamily: 'inherit',
  }
  // `--cc-ta` přebíjí globální tap-target `min-height: 44px !important`,
  // které by víceřádková pole srazilo na výšku jednoho řádku.
  const textarea = (min: number): React.CSSProperties => ({
    ...pole, height: undefined, minHeight: min, padding: '12px 14px', lineHeight: 1.55,
    resize: 'vertical', ...({ '--cc-ta': `${min}px` } as React.CSSProperties),
  })
  const chybne = (je: boolean, ukaz = ukazChyby): React.CSSProperties =>
    (je && ukaz ? { borderColor: 'var(--accent)' } : {})

  // Chyba se ukáže po opuštění pole nebo po pokusu uložit.
  const ukazFirmu = ukazChyby || !!dotknuto.firma
  const ukazTelefon = ukazChyby || !!dotknuto.telefon
  const ukazEmail = ukazChyby || !!dotknuto.email
  const hlaska = (text: string, jeChyba = true) => (
    <div style={{
      marginTop: 6, fontSize: 12.5, lineHeight: 1.4,
      color: jeChyba ? 'var(--cc-odm-text)' : 'var(--muted)',
    }}>{text}</div>
  )
  /** Chyba pole, nebo — když je číslo v pořádku a přepíše se — tvar po uložení. */
  const podTelefonem = () => {
    if (ukazTelefon && chybaTelefonu) return hlaska(chybaTelefonu)
    if (telefonPoUlozeni && telefonPoUlozeni !== d.telefon.trim())
      return hlaska(`Uloží se jako ${telefonPoUlozeni}`, false)
    return null
  }

  const primary: React.CSSProperties = {
    display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: 8,
    height: 44, padding: '0 24px', borderRadius: 11, border: 'none', background: 'var(--accent)',
    color: '#fff', fontSize: 14.5, fontWeight: 600, cursor: 'pointer', touchAction: 'manipulation',
  }
  const ghost: React.CSSProperties = {
    display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: 8,
    height: 44, padding: '0 20px', borderRadius: 11, background: 'transparent',
    border: '1px solid var(--border)', color: 'var(--text)', fontSize: 14.5, fontWeight: 600,
    cursor: 'pointer', touchAction: 'manipulation',
  }

  const vysledekBtn = (v: Vysledek) => {
    const on = d.vysledek === v
    return (
      <button
        key={v} type="button" role="radio" aria-checked={on}
        // Přepnutí na výsledek bez fáze uloženou fázi zahodí — jinak by
        // u „nedovoláno" zůstala viset fáze z předchozí volby.
        onClick={() => setD(p => ({ ...p, vysledek: v, faze: maFazi(v) ? p.faze : '' }))}
        style={{
          height: isMobile ? 46 : 44, padding: isMobile ? '0 12px' : '0 20px',
          borderRadius: 10, fontSize: 14, fontWeight: 600, cursor: 'pointer',
          touchAction: 'manipulation', whiteSpace: 'nowrap',
          border: `1px solid ${on || (chybiVysledek && ukazChyby) ? 'var(--accent)' : 'var(--border)'}`,
          background: on ? 'rgba(232,25,44,.16)' : 'var(--input-bg)',
          color: on ? 'var(--text)' : 'var(--muted)',
        }}>{VYSLEDEK_STYL[v].label}</button>
    )
  }

  const fazeBtn = (f: Faze) => {
    const on = d.faze === f
    return (
      <button
        key={f} type="button" role="radio" aria-checked={on}
        // Druhý tap na vybranou fázi ji zruší — fáze je nepovinná a jinak by
        // šla jen přepsat, ne vzít zpět.
        onClick={() => set('faze', on ? '' : f)}
        style={{
          height: isMobile ? 46 : 44, padding: isMobile ? '0 12px' : '0 18px',
          borderRadius: 10, fontSize: 14, fontWeight: 600, cursor: 'pointer',
          touchAction: 'manipulation', whiteSpace: 'nowrap',
          border: `1px solid ${on ? 'var(--accent)' : 'var(--border)'}`,
          background: on ? 'rgba(232,25,44,.16)' : 'var(--input-bg)',
          color: on ? 'var(--text)' : 'var(--muted)',
        }}>{FAZE_LABEL[f]}</button>
    )
  }

  const kdy = new Date(zaznam?.volano_at || zaznam?.created_at || Date.now())
  const datumRadek = kdy.toLocaleDateString('cs-CZ', { weekday: 'long', day: 'numeric', month: 'numeric', year: 'numeric' })
    + ' · ' + kdy.toLocaleTimeString('cs-CZ', { hour: 'numeric', minute: '2-digit' })

  return (
    <div style={{ maxWidth: 880, margin: '0 auto', paddingBottom: isMobile ? 12 : 24 }}>
      {/* hlavička */}
      {isMobile ? (
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 16 }}>
          <button onClick={zrus} aria-label="Zpět" style={{
            width: 44, height: 44, flexShrink: 0, borderRadius: 11, border: '1px solid var(--border)',
            background: 'var(--card)', display: 'flex', alignItems: 'center', justifyContent: 'center',
            color: 'var(--muted)', cursor: 'pointer', touchAction: 'manipulation',
          }}><ChevronLeft size={22} /></button>
          <h1 className="cc-h1" style={{
            ...({ '--cc-h1': '17px' } as React.CSSProperties),
            margin: 0, fontSize: 17, fontWeight: 700, color: 'var(--text)',
          }}>
            {zaznam ? 'Záznam hovoru' : 'Nový hovor'}
          </h1>
        </div>
      ) : (
        <>
          <button onClick={zrus} style={{
            display: 'inline-flex', alignItems: 'center', gap: 6, height: 44, padding: 0,
            background: 'transparent', border: 'none', color: 'var(--muted)',
            fontSize: 13.5, fontWeight: 500, cursor: 'pointer',
          }}><ChevronLeft size={17} /> Cold cally</button>
          <h1 style={{ margin: '2px 0 0', fontSize: 23, fontWeight: 700, letterSpacing: '-.015em', color: 'var(--text)' }}>
            Záznam hovoru
          </h1>
          <div style={{ marginTop: 5, fontSize: 13.5, color: 'var(--muted)' }}>{datumRadek}</div>
        </>
      )}

      <div style={{ display: 'flex', flexDirection: 'column', gap: isMobile ? 16 : 18, marginTop: isMobile ? 0 : 22 }}>
        {/* firma / kontakt / telefon */}
        {isMobile ? (
          <>
            <div>
              <label style={label} htmlFor="cc-firma">Firma</label>
              <input id="cc-firma" value={d.firma} onChange={e => set('firma', e.target.value)}
                onBlur={() => setDotknuto(p => ({ ...p, firma: true }))}
                placeholder="Název firmy" style={{ ...pole, ...chybne(chybiFirma, ukazFirmu) }} />
              {ukazFirmu && chybaFirmy && hlaska(chybaFirmy)}
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
              <div>
                <label style={label} htmlFor="cc-kontakt">Kontakt — jméno</label>
                <input id="cc-kontakt" value={d.kontakt_jmeno} onChange={e => set('kontakt_jmeno', e.target.value)} style={pole} />
              </div>
              <div>
                <label style={label} htmlFor="cc-telefon">Telefon</label>
                <input id="cc-telefon" value={d.telefon} onChange={e => set('telefon', e.target.value)}
                  onBlur={() => setDotknuto(p => ({ ...p, telefon: true }))}
                  inputMode="tel" placeholder="+420 777 123 456"
                  style={{ ...pole, ...chybne(!!chybaTelefonu, ukazTelefon) }} />
                {podTelefonem()}
              </div>
            </div>
            {/* E-mail patří k telefonu, na 390 px ale pod něj: tři pole vedle
                sebe by měla po 120 px a adresa se do nich nevejde. */}
            <div>
              <label style={label} htmlFor="cc-email">E-mail</label>
              <input id="cc-email" value={d.email} onChange={e => set('email', e.target.value)}
                onBlur={() => setDotknuto(p => ({ ...p, email: true }))}
                inputMode="email" autoCapitalize="off" autoCorrect="off" spellCheck={false}
                placeholder="jan@firma.cz"
                style={{ ...pole, ...chybne(!!chybaEmailu, ukazEmail) }} />
              {ukazEmail && chybaEmailu && hlaska(chybaEmailu)}
            </div>
          </>
        ) : (
          <div style={{ display: 'grid', gridTemplateColumns: '1.15fr 1fr 1fr 1.15fr', gap: 14 }}>
            <div>
              <label style={label} htmlFor="cc-firma">Firma</label>
              <input id="cc-firma" value={d.firma} onChange={e => set('firma', e.target.value)}
                onBlur={() => setDotknuto(p => ({ ...p, firma: true }))}
                placeholder="Název firmy" style={{ ...pole, ...chybne(chybiFirma, ukazFirmu) }} />
              {ukazFirmu && chybaFirmy && hlaska(chybaFirmy)}
            </div>
            <div>
              <label style={label} htmlFor="cc-kontakt">Kontakt — jméno</label>
              <input id="cc-kontakt" value={d.kontakt_jmeno} onChange={e => set('kontakt_jmeno', e.target.value)} style={pole} />
            </div>
            <div>
              <label style={label} htmlFor="cc-telefon">Telefon</label>
              <input id="cc-telefon" value={d.telefon} onChange={e => set('telefon', e.target.value)}
                onBlur={() => setDotknuto(p => ({ ...p, telefon: true }))}
                inputMode="tel" placeholder="+420 777 123 456"
                style={{ ...pole, ...chybne(!!chybaTelefonu, ukazTelefon) }} />
              {podTelefonem()}
            </div>
            <div>
              <label style={label} htmlFor="cc-email">E-mail</label>
              <input id="cc-email" value={d.email} onChange={e => set('email', e.target.value)}
                onBlur={() => setDotknuto(p => ({ ...p, email: true }))}
                inputMode="email" autoCapitalize="off" autoCorrect="off" spellCheck={false}
                placeholder="jan@firma.cz"
                style={{ ...pole, ...chybne(!!chybaEmailu, ukazEmail) }} />
              {ukazEmail && chybaEmailu && hlaska(chybaEmailu)}
            </div>
          </div>
        )}

        {/* Info o firmě — patří NAHORU, čte se před vytáčením. Dole u reflexe
            by bylo k ničemu: to se píše až po hovoru.

            Není to jedno velké pole, ale seznam odrážek: každá má vlastní
            vstup a na desktopu jdou ve DVOU sloupcích po řádcích (1 vlevo,
            2 vpravo, 3 pod jedničkou…). Krátkých údajů se tak vejde dvakrát
            tolik bez posouvání. Jediná odrážka zabere celou šířku — sloupec
            s prázdnou půlkou vypadá jako chyba. Na mobilu je sloupec jeden,
            dva by se do 390 px nevešly. */}
        <div>
          <span style={label}>Info o firmě</span>
          <div style={{
            display: 'grid',
            gridTemplateColumns: isMobile ? '1fr' : 'repeat(2, minmax(0, 1fr))',
            gap: isMobile ? 8 : 10,
          }}>
            {odrazky.map((text, i) => (
              <div key={i} style={{
                ...pole, display: 'flex', alignItems: 'center', gap: 8,
                padding: isMobile ? '0 12px' : '0 12px',
                // Jedna jediná odrážka přes obě půlky.
                gridColumn: !isMobile && odrazky.length === 1 ? '1 / -1' : undefined,
              }}>
                <span aria-hidden style={{ color: 'var(--muted)', flexShrink: 0 }}>–</span>
                <input
                  id={`cc-info-${i}`}
                  value={text}
                  onChange={e => nastavOdrazky(odrazky.map((t, j) => (j === i ? e.target.value : t)))}
                  onKeyDown={e => klavesaOdrazky(e, i)}
                  placeholder={i === 0 ? '5 lidí' : ''}
                  aria-label={`Odrážka ${i + 1}`}
                  style={{
                    flex: 1, minWidth: 0, height: '100%', border: 'none', background: 'transparent',
                    color: 'var(--text)', fontSize: isMobile ? 16 : 14.5, fontFamily: 'inherit',
                    padding: 0, outline: 'none',
                  }}
                />
                {odrazky.length > 1 && (
                  <button
                    type="button"
                    onClick={() => { nastavOdrazky(odrazky.filter((_, j) => j !== i)); zaostri(Math.max(0, i - 1), true) }}
                    aria-label={`Smazat odrážku ${i + 1}`}
                    style={{
                      // 44px tap target; záporný okraj ho drží uvnitř řádku,
                      // aby odrážka nevyrostla nad výšku ostatních polí.
                      width: 44, height: 44, marginRight: -10, flexShrink: 0, borderRadius: 8,
                      display: 'flex', alignItems: 'center', justifyContent: 'center',
                      background: 'transparent', border: 'none', color: 'var(--muted)',
                      cursor: 'pointer', touchAction: 'manipulation',
                    }}><X size={15} /></button>
                )}
              </div>
            ))}
          </div>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 14, alignItems: 'center' }}>
            <button
              type="button"
              onClick={() => { nastavOdrazky([...odrazky, '']); zaostri(odrazky.length) }}
              style={{
                display: 'inline-flex', alignItems: 'center', gap: 7, marginTop: 4,
                height: 44, padding: '0 12px 0 0', background: 'transparent', border: 'none',
                color: 'var(--muted)', fontSize: 12.5, fontWeight: 600,
                cursor: 'pointer', touchAction: 'manipulation',
              }}><Plus size={14} /> Přidat odrážku</button>
            {/* Starý zápis („5 lidí · řemeslníci · ABRA") na odrážky až na klik —
                přepsat ho sám při otevření záznamu by uživateli měnilo text
                pod rukama a nešlo by to vrátit jinak než ručně. */}
            {odrazky.some(t => /[·•;|]/.test(t)) && (
              <button type="button" onClick={() => set('info', naOdrazky(d.info))} style={{
                display: 'inline-flex', alignItems: 'center', gap: 7, marginTop: 4,
                height: 44, padding: '0 12px 0 0', background: 'transparent', border: 'none',
                color: 'var(--accent)', fontSize: 12.5, fontWeight: 600,
                cursor: 'pointer', touchAction: 'manipulation',
              }}>
                <List size={14} /> Převést na odrážky
              </button>
            )}
          </div>
        </div>

        {/* výsledek */}
        <div>
          <span style={label}>Výsledek</span>
          <div role="radiogroup" aria-label="Výsledek hovoru" style={{
            display: isMobile ? 'grid' : 'flex',
            gridTemplateColumns: isMobile ? '1fr 1fr' : undefined,
            gap: 8,
          }}>
            {VYSLEDKY_HOVORU.map(vysledekBtn)}
          </div>
        </div>

        {/* Kde hovor skončil — jen u výsledků, kde hovor doopravdy proběhl.
            Vyjíždí plynule: `grid-template-rows` 0fr → 1fr animuje výšku obsahu,
            aniž by se musela hádat v pixelech. Záporný spodní okraj v zavřeném
            stavu vyruší mezeru sloupce, jinak by po poli zůstala díra. */}
        <div
          inert={!fazeVidet}
          aria-hidden={!fazeVidet}
          style={{
            display: 'grid', gridTemplateRows: fazeVidet ? '1fr' : '0fr',
            opacity: fazeVidet ? 1 : 0,
            marginBottom: fazeVidet ? 0 : -(isMobile ? 16 : 18),
            transition: 'grid-template-rows .24s ease, opacity .18s ease, margin-bottom .24s ease',
          }}
        >
          <div style={{ overflow: 'hidden', minHeight: 0 }}>
            <span style={label}>Kde skončil</span>
            <div role="radiogroup" aria-label="Kde hovor skončil" style={{
              display: isMobile ? 'grid' : 'flex',
              gridTemplateColumns: isMobile ? '1fr 1fr' : undefined,
              flexWrap: isMobile ? undefined : 'wrap',
              gap: 8,
            }}>
              {FAZE.map(fazeBtn)}
            </div>
            <div style={{ marginTop: 8, fontSize: 12.5, color: 'var(--muted)' }}>
              Nepovinné. Z toho se v „Co se učím" počítá, kde hovory nejčastěji padají.
            </div>
          </div>
        </div>

        {/* co jsem řekl / co odpověděl */}
        <div style={{
          display: 'grid', gridTemplateColumns: isMobile ? '1fr' : '1fr 1fr',
          gap: isMobile ? 16 : 14,
        }}>
          <div>
            <label style={label} htmlFor="cc-rekl">Co jsem řekl</label>
            <textarea id="cc-rekl" className="cc-textarea" value={d.co_jsem_rekl} onChange={e => set('co_jsem_rekl', e.target.value)}
              style={textarea(isMobile ? 88 : 96)} />
          </div>
          <div>
            <label style={label} htmlFor="cc-odpovedel">Co odpověděl</label>
            <textarea id="cc-odpovedel" className="cc-textarea" value={d.co_odpovedel} onChange={e => set('co_odpovedel', e.target.value)}
              style={textarea(isMobile ? 88 : 96)} />
          </div>
        </div>

        {/* reflexe — nejdůležitější část záznamu */}
        <div style={{ marginTop: isMobile ? 2 : 6 }}>
          <div style={{
            fontSize: 12, fontWeight: 800, letterSpacing: '.12em', textTransform: 'uppercase',
            color: 'var(--accent)',
          }}>Reflexe</div>
          <div style={{ marginTop: 4, fontSize: 13.5, color: 'var(--muted)' }}>
            To nejdůležitější z celého záznamu — piš konkrétně.
          </div>
        </div>
        <div>
          <label style={{ ...label, fontSize: 15, fontWeight: 700, color: 'var(--text)' }} htmlFor="cc-spatne">
            Co jsem udělal špatně
          </label>
          <textarea id="cc-spatne" className="cc-textarea" value={d.co_spatne} onChange={e => set('co_spatne', e.target.value)}
            style={{ ...textarea(isMobile ? 132 : 150), fontSize: 15, lineHeight: 1.6, background: 'var(--hover-bg)' }} />
        </div>
        <div>
          <label style={{ ...label, fontSize: 15, fontWeight: 700, color: 'var(--text)' }} htmlFor="cc-priste">
            Co příště jinak
          </label>
          <textarea id="cc-priste" className="cc-textarea" value={d.co_priste_jinak} onChange={e => set('co_priste_jinak', e.target.value)}
            style={{ ...textarea(isMobile ? 132 : 150), fontSize: 15, lineHeight: 1.6, background: 'var(--hover-bg)' }} />
        </div>

        {/* akce */}
        {!isMobile && (
          <div style={{ display: 'flex', gap: 10, marginTop: 4 }}>
            <button onClick={uloz} disabled={saving} style={{ ...primary, opacity: saving ? 0.6 : 1 }}>
              <Check size={16} /> {saving ? 'Ukládám…' : 'Uložit hovor'}
            </button>
            <button onClick={zrus} style={ghost}><X size={16} /> Zrušit</button>
          </div>
        )}
      </div>

      {/* Mobilní patička drží tlačítko nad spodní navigací appky — ta v designu
          není, ale v appce ano, takže se sticky opírá o její výšku. */}
      {isMobile && (
        <div style={{
          // `bottom: 0` je proti spodní hraně OBSAHU, ne okna — a `.main-content`
          // už má pod obsahem 80px rezervu na spodní navigaci appky (v designu
          // žádná není). Patička tak sedí těsně nad ní; s vlastním odsazením
          // by se odlepila doprostřed formuláře.
          position: 'sticky', bottom: 0, zIndex: 5,
          marginTop: 18, padding: '12px 0 14px', background: 'var(--bg)',
          borderTop: '1px solid var(--border)',
        }}>
          <button onClick={uloz} disabled={saving} style={{
            ...primary, width: '100%', height: 52, borderRadius: 13, opacity: saving ? 0.6 : 1,
          }}><Check size={18} /> {saving ? 'Ukládám…' : 'Uložit hovor'}</button>
        </div>
      )}
      {dialog}
    </div>
  )
}
