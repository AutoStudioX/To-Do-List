'use client'
import { useCallback, useEffect, useMemo, useState } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { Toast, useToast } from '@/components/Toast'
import { useConfirm } from '@/components/ConfirmDialog'
import { useToday } from '@/lib/useToday'
import { useLiveData } from '@/lib/useLiveData'
import ImportModal from '@/components/coldCalls/ImportModal'
import {
  statistiky, serad, hledej, fmtKdy, fmtTelefon, doCsv, telefonKlic,
  VYSLEDEK_STYL, VYSLEDKY, type ColdCall, type Vysledek,
} from '@/lib/coldCalls'
import {
  Phone, PhoneCall, CircleX, CalendarCheck, Plus, Upload, Download, Search, Lightbulb, Trash2,
} from 'lucide-react'

// „Co se učím" je samostatná stránka (/co-se-ucim), ale mimo navigaci —
// chodí se tam odsud, protože se to čte k hovorům, ne samo o sobě.

type Filtr = 'vse' | Vysledek

/**
 * Seznam hovorů podle handoffu (artboardy 1a/1b).
 *
 * Rozměry, rozestupy a radiusy jsou z designu doslova; barvy jdou přes
 * proměnné appky, aby sekce fungovala i ve světlém motivu.
 */
export default function ColdCallyPage() {
  const router = useRouter()
  const supabase = useMemo(() => createClient(), [])
  const [calls, setCalls] = useState<ColdCall[]>([])
  const [loading, setLoading] = useState(true)
  const [isMobile, setIsMobile] = useState(false)
  const [dotaz, setDotaz] = useState('')
  const [filtr, setFiltr] = useState<Filtr>('vse')
  const [importOpen, setImportOpen] = useState(false)
  const { toast, showToast, hideToast } = useToast()
  const { confirm, dialog } = useConfirm()

  useEffect(() => {
    const check = () => setIsMobile(window.innerWidth <= 768)
    check()
    window.addEventListener('resize', check)
    return () => window.removeEventListener('resize', check)
  }, [])

  const dnes = useToday()

  const load = useCallback(async () => {
    const { data: { session } } = await supabase.auth.getSession()
    const user = session?.user
    if (!user) { setLoading(false); return }
    const { data, error } = await supabase.from('cold_calls').select('*').eq('user_id', user.id)
    if (error) { showToast(`Načtení selhalo: ${error.message}`, 'error'); setLoading(false); return }
    setCalls((data || []) as ColdCall[])
    setLoading(false)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [supabase])

  useEffect(() => { load() }, [load])
  useLiveData(['cold_calls'], load)

  const stat = useMemo(() => statistiky(calls, dnes), [calls, dnes])
  const videt = useMemo(() => {
    const podleFiltru = filtr === 'vse' ? calls : calls.filter(c => c.vysledek === filtr)
    return serad(hledej(podleFiltru, dotaz))
  }, [calls, filtr, dotaz])

  const fronta = videt.filter(c => c.vysledek === 'ceka')
  const zavolane = videt.filter(c => c.vysledek !== 'ceka')

  async function importuj(radky: {
    firma: string; kontakt_jmeno: string | null; telefon: string | null; info: string | null
  }[]) {
    const { data: { session } } = await supabase.auth.getSession()
    const user = session?.user
    if (!user) { showToast('Import selhal: nejsi přihlášený', 'error'); return }
    const { error } = await supabase.from('cold_calls')
      .insert(radky.map(r => ({ ...r, user_id: user.id, vysledek: 'ceka' as const })))
    if (error) { showToast(`Import selhal: ${error.message}`, 'error'); return }
    showToast(`Naimportováno ${radky.length} ${radky.length === 1 ? 'lead' : radky.length < 5 ? 'leady' : 'leadů'}`)
    load()
  }

  function exportuj() {
    if (!videt.length) { showToast('Není co exportovat', 'error'); return }
    const blob = new Blob([doCsv(videt)], { type: 'text/csv;charset=utf-8' })
    const a = document.createElement('a')
    a.href = URL.createObjectURL(blob)
    a.download = `cold-cally-${dnes}.csv`
    a.click()
    URL.revokeObjectURL(a.href)
    showToast(`Exportováno ${videt.length} záznamů`)
  }

  /** Smazání jednoho záznamu. Potvrzení jmenuje firmu, ať je jasné, co zmizí. */
  async function smaz(c: ColdCall) {
    if (!await confirm(`Smazat záznam „${c.firma}"? Nejde to vrátit.`, 'Smazat')) return
    const { error } = await supabase.from('cold_calls').delete().eq('id', c.id)
    if (error) { showToast(`Smazání selhalo: ${error.message}`, 'error'); return }
    setCalls(prev => prev.filter(x => x.id !== c.id))
    showToast(`Záznam „${c.firma}" smazán`)
  }

  /**
   * Hromadné smazání fronty — po nahrání špatného souboru se nemaže po jednom.
   *
   * Maže přesně to, co je pod hlavičkou „K obvolání" vidět, takže s aktivním
   * hledáním/filtrem jde smazat i jen část; potvrzení to říká. `vysledek` je
   * v dotazu navíc jako pojistka: zavolaný hovor tudy zmizet nesmí, ani kdyby
   * se seznam id rozešel se skutečností.
   */
  async function smazFrontu() {
    if (!fronta.length) return
    const filtrovano = dotaz.trim() !== '' || filtr !== 'vse'
    const kolik = pocetSlovem(fronta.length, 'lead')
    const ok = await confirm(filtrovano
      ? `Smazat z fronty to, co teď vidíš — ${kolik}? Nejde to vrátit.`
      : `Smazat celou frontu — ${kolik}? Nejde to vrátit.`, 'Smazat')
    if (!ok) return
    const ids = fronta.map(c => c.id)
    const { error } = await supabase.from('cold_calls')
      .delete().eq('vysledek', 'ceka').in('id', ids)
    if (error) { showToast(`Smazání selhalo: ${error.message}`, 'error'); return }
    setCalls(prev => prev.filter(c => !ids.includes(c.id)))
    showToast(`Smazáno ${kolik}`)
  }

  // ---- kusy ----

  const badge = (v: Vysledek) => {
    const s = VYSLEDEK_STYL[v]
    return (
      <span style={{
        display: 'inline-flex', alignItems: 'center', gap: isMobile ? 6 : 7,
        height: isMobile ? 25 : 26, padding: isMobile ? '0 10px' : '0 11px', borderRadius: 999,
        fontSize: isMobile ? 12 : 12.5, fontWeight: 600, color: s.text, background: s.bg, flexShrink: 0,
      }}>
        <span style={{ width: 6, height: 6, borderRadius: 999, background: s.dot, flexShrink: 0 }} />
        {s.label}
      </span>
    )
  }

  const dlazdice = (label: string, cislo: number, Icon: typeof Phone, zeleny = false) => (
    <div key={label} style={{
      background: 'var(--card)', border: '1px solid var(--border)', borderRadius: 12,
      padding: isMobile ? '12px 14px' : '16px 18px',
    }}>
      <div style={{
        display: 'flex', alignItems: 'center', gap: 8,
        fontSize: isMobile ? 12 : 13, fontWeight: 500, color: 'var(--muted)',
      }}>
        {/* Na mobilu jsou dlaždice bez ikon — přesně jak je má artboard 1b. */}
        {!isMobile && <Icon size={15} style={{ color: 'var(--muted)', opacity: 0.75 }} />}
        {label}
      </div>
      <div style={{
        marginTop: isMobile ? 6 : 12, fontSize: isMobile ? 23 : 31, fontWeight: 700,
        letterSpacing: '-.02em', fontVariantNumeric: 'tabular-nums',
        color: zeleny ? 'var(--cc-sch-text)' : 'var(--text)',
      }}>{cislo}</div>
    </div>
  )

  /**
   * Řádek seznamu. Barevný pruh u levého kraje nese výsledek — jde ho poznat
   * od pohledu, i když badge zrovna není v zorném poli. Podbarvení celého
   * řádku by na to bylo moc, jeden pruh stačí.
   *
   * Druhý řádek: u leadu telefon a kontakt (co potřebuješ před vytáčením),
   * u zavolaného datum, kontakt a začátek poznámky „co příště jinak" — vždy
   * na jednu řádku s třemi tečkami, ať výška řádků zůstane pravidelná.
   */
  const radek = (c: ColdCall, lead: boolean, posledni = false) => {
    const pruh = VYSLEDEK_STYL[c.vysledek].dot
    const kontakt = c.kontakt_jmeno?.trim()
    const poznamka = c.co_priste_jinak?.trim()
    const kdy = fmtKdy(c.volano_at || c.created_at)
    // Druhá řádka začíná telefonem u fronty i u zavolaných — číslo je to
    // první, co člověk hledá, a nemá smysl, aby u zavolaného chybělo.
    const tel = c.telefon ? fmtTelefon(c.telefon) : (lead ? 'bez čísla' : null)
    const druhyRadek = lead
      ? [tel, kontakt].filter(Boolean)
      : [tel, isMobile ? kdy : null, kontakt, poznamka].filter(Boolean)

    const obsah = (
      <span style={{ flex: 1, minWidth: 0 }}>
        <span style={{
          display: 'block', fontSize: 15, lineHeight: 1.25, fontWeight: 600, color: 'var(--text)',
          whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis',
        }}>{c.firma}</span>
        {druhyRadek.length > 0 && (
          <span style={{
            display: 'block', marginTop: 2, fontSize: isMobile ? 12.5 : 13, lineHeight: 1.3,
            color: 'var(--muted)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis',
          }}>{druhyRadek.join(' · ')}</span>
        )}
      </span>
    )

    // Koš je vlastní tlačítko vedle řádku, ne uvnitř něj — tlačítko v tlačítku
    // je neplatné HTML a klik by procházel na otevření záznamu.
    return (
      <div key={c.id} className="cc-row" style={{
        display: 'flex', alignItems: 'center',
        // Poslední řádek v kartě už linku nepotřebuje — kryla by se s okrajem.
        borderBottom: posledni ? 'none' : '1px solid var(--border)',
        borderLeft: `3px solid ${pruh}`, boxSizing: 'border-box',
      }}>
        <button onClick={() => router.push(`/cold-cally/${c.id}`)} style={{
          flex: 1, minWidth: 0, display: 'flex', alignItems: 'center',
          // Spodní linka je na obalu, takže si ji vnitřek odečte — jinak by
          // řádek s linkou byl o pixel vyšší než ten poslední v kartě.
          gap: isMobile ? 12 : 18, minHeight: (isMobile ? 58 : 57) - (posledni ? 0 : 1),
          padding: isMobile ? '9px 8px 9px 14px' : '9px 12px 9px 20px',
          background: 'transparent', border: 'none', boxSizing: 'border-box',
          textAlign: 'left', cursor: 'pointer', touchAction: 'manipulation',
        }}>
          {obsah}
          {!isMobile && (
            <span style={{
              fontSize: 13, color: 'var(--muted)', fontVariantNumeric: 'tabular-nums', flexShrink: 0,
            }}>{lead ? '' : kdy}</span>
          )}
          {isMobile
            ? badge(c.vysledek)
            : <span style={{ width: 128, display: 'flex', justifyContent: 'flex-end', flexShrink: 0 }}>{badge(c.vysledek)}</span>}
        </button>
        <button
          onClick={() => smaz(c)}
          aria-label={`Smazat ${c.firma}`}
          title="Smazat"
          className="cc-trash"
          style={{
            width: 44, height: 44, marginRight: isMobile ? 6 : 8, flexShrink: 0,
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            background: 'transparent', border: 'none', borderRadius: 9,
            color: 'var(--muted)', cursor: 'pointer', touchAction: 'manipulation',
          }}
        >
          <Trash2 size={16} />
        </button>
      </div>
    )
  }

  /** 1 lead / 2–4 leady / 5+ leadů, totéž pro hovory. */
  const pocetSlovem = (n: number, jedn: 'lead' | 'hovor') => {
    const tvary = jedn === 'lead' ? ['lead', 'leady', 'leadů'] : ['hovor', 'hovory', 'hovorů']
    return `${n} ${n === 1 ? tvary[0] : n < 5 ? tvary[1] : tvary[2]}`
  }

  /**
   * Hlavička části seznamu. Obě jsou stejně výrazné — „ZAVOLÁNO" bylo dřív
   * tlumené a v tmavém motivu se skoro ztrácelo, takže seznam vypadal, jako by
   * fronta pokračovala dál.
   */
  const predel = (text: string, pocet: number, jedn: 'lead' | 'hovor', akce?: React.ReactNode) => (
    <div style={{
      display: 'flex', alignItems: 'center', gap: 10, minHeight: 45, boxSizing: 'border-box',
      padding: isMobile ? '0 8px 0 14px' : '0 12px 0 20px',
      background: 'var(--hover-bg)', borderBottom: '1px solid var(--border)',
      fontSize: 11.5, fontWeight: 800, letterSpacing: '.1em', textTransform: 'uppercase',
      color: 'var(--text)',
    }}>
      {text}
      <span style={{ fontWeight: 600, letterSpacing: 0, textTransform: 'none', color: 'var(--muted)' }}>
        {pocetSlovem(pocet, jedn)}
      </span>
      {akce && <span style={{ marginLeft: 'auto' }}>{akce}</span>}
    </div>
  )

  const karta: React.CSSProperties = {
    background: 'var(--card)', border: '1px solid var(--border)',
    borderRadius: 12, overflow: 'hidden',
  }

  const primaryBtn: React.CSSProperties = {
    display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: 9,
    height: 44, padding: '0 20px', borderRadius: 11, border: 'none',
    background: 'var(--accent)', color: '#fff', fontSize: 14.5, fontWeight: 600,
    cursor: 'pointer', touchAction: 'manipulation', flexShrink: 0,
  }
  const ghostBtn: React.CSSProperties = {
    display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: 8,
    height: 44, padding: '0 16px', borderRadius: 10, background: 'transparent',
    border: '1px solid var(--border)', color: 'var(--text)', fontSize: 14, fontWeight: 600,
    cursor: 'pointer', touchAction: 'manipulation', flexShrink: 0,
  }

  const datum = new Date().toLocaleDateString('cs-CZ',
    isMobile ? { weekday: 'short', day: 'numeric', month: 'numeric' }
      : { weekday: 'long', day: 'numeric', month: 'numeric', year: 'numeric' })

  if (loading) return <div style={{ color: 'var(--muted)', padding: 24 }}>Načítání…</div>

  const prazdno = calls.length === 0
  const nicNenalezeno = !prazdno && videt.length === 0

  return (
    <div style={{ maxWidth: 1120, margin: '0 auto', paddingBottom: 24 }}>
      <style>{`
        .cc-row:hover { background: var(--hover-bg) !important; }
        .cc-trash:hover, .cc-smazat-frontu:hover { color: #E8192C !important; }
      `}</style>

      {/* hlavička */}
      <div style={{
        display: 'flex', alignItems: isMobile ? 'baseline' : 'center',
        justifyContent: 'space-between', gap: 16,
      }}>
        <div>
          <h1 className="cc-h1" style={{
            margin: 0, fontSize: isMobile ? 20 : 23, fontWeight: 700,
            letterSpacing: '-.015em', color: 'var(--text)',
          }}>Cold cally</h1>
          {!isMobile && <div style={{ marginTop: 5, fontSize: 13.5, color: 'var(--muted)' }}>{datum}</div>}
        </div>
        {isMobile
          ? <span style={{ fontSize: 13, color: 'var(--muted)' }}>{datum}</span>
          : (
            <div style={{ display: 'flex', gap: 10 }}>
              <button onClick={() => router.push('/co-se-ucim')} style={ghostBtn}>
                <Lightbulb size={16} /> Co se učím
              </button>
              <button onClick={() => setImportOpen(true)} style={ghostBtn}>
                <Upload size={16} /> Nahrát leady
              </button>
              <button onClick={() => router.push('/cold-cally/novy')} style={primaryBtn}>
                <Plus size={16} strokeWidth={2.5} /> Přidat hovor
              </button>
            </div>
          )}
      </div>

      {/* statistiky */}
      <div style={{
        display: 'grid', gridTemplateColumns: isMobile ? '1fr 1fr' : 'repeat(4, 1fr)',
        gap: isMobile ? 10 : 14, marginTop: isMobile ? 12 : 26,
      }}>
        {dlazdice('Dnes zavoláno', stat.dnes, Phone)}
        {dlazdice('Celkem hovorů', stat.celkem, PhoneCall)}
        {dlazdice('Odmítnutí', stat.odmitnuti, CircleX)}
        {dlazdice('Schůzky', stat.schuzky, CalendarCheck, true)}
      </div>

      {/* hledání, filtr, export */}
      <div style={{
        display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: isMobile ? 8 : 10,
        marginTop: isMobile ? 12 : 26,
      }}>
        <div style={{ position: 'relative', flex: isMobile ? '1 1 100%' : '1 1 260px', minWidth: 0 }}>
          <Search size={16} style={{
            position: 'absolute', left: 14, top: '50%', transform: 'translateY(-50%)',
            color: 'var(--muted)', pointerEvents: 'none',
          }} />
          <input
            value={dotaz}
            onChange={e => setDotaz(e.target.value)}
            placeholder="Hledat firmu nebo kontakt…"
            style={{
              width: '100%', height: 44, padding: '0 14px 0 40px', borderRadius: 10,
              border: '1px solid var(--border)', background: 'var(--input-bg)', color: 'var(--text)',
              fontSize: 14.5, boxSizing: 'border-box',
            }}
          />
        </div>
        <div className="hide-scrollbar" style={{ display: 'flex', gap: 8, overflowX: 'auto', maxWidth: '100%' }}>
          {(['vse', ...VYSLEDKY] as Filtr[]).map(f => {
            const on = filtr === f
            const label = f === 'vse' ? 'Vše' : VYSLEDEK_STYL[f].label
            return (
              <button key={f} onClick={() => setFiltr(f)} style={{
                height: 44, padding: '0 16px', borderRadius: 10, fontSize: 14, fontWeight: 600,
                cursor: 'pointer', touchAction: 'manipulation', whiteSpace: 'nowrap', flexShrink: 0,
                border: `1px solid ${on ? 'var(--accent)' : 'var(--border)'}`,
                background: on ? 'rgba(232,25,44,.16)' : 'var(--input-bg)',
                color: on ? 'var(--text)' : 'var(--muted)',
              }}>{label}</button>
            )
          })}
        </div>
        {!isMobile && (
          <button onClick={exportuj} style={{ ...ghostBtn, marginLeft: 'auto' }}>
            <Download size={16} /> Export CSV
          </button>
        )}
      </div>

      {/* seznam — fronta a zavolané jsou DVĚ karty s mezerou, ne jeden blok:
          jsou to dva různé seznamy (co mě čeká vs. co mám za sebou). */}
      <div style={{
        marginTop: isMobile ? 14 : 26,
        display: 'flex', flexDirection: 'column', gap: isMobile ? 10 : 14,
      }}>
        {prazdno ? (
          <div style={{ ...karta, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 8,
            padding: isMobile ? 40 : 56, textAlign: 'center' }}>
            <Phone size={26} style={{ color: 'var(--muted)', opacity: 0.6 }} />
            <div style={{ fontSize: 15, fontWeight: 600, color: 'var(--text)' }}>Zatím žádné hovory</div>
            <div style={{ fontSize: 13, color: 'var(--muted)' }}>
              Záznamy se objeví hned po prvním hovoru. Leady nahraješ tlačítkem „Nahrát leady".
            </div>
          </div>
        ) : nicNenalezeno ? (
          <div style={{ ...karta, padding: isMobile ? 32 : 48, textAlign: 'center', fontSize: 14, color: 'var(--muted)' }}>
            Nic neodpovídá hledání ani filtru.
          </div>
        ) : (
          <>
            {fronta.length > 0 && (
              <div style={karta}>
                {predel('K obvolání', fronta.length, 'lead', (
                  /* Předěl má 45px (44 + spodní linka), aby se tap target vešel
                     dovnitř a obě hlavičky zůstaly stejně vysoké — i ta bez
                     tlačítka. */
                  <button onClick={smazFrontu} className="cc-smazat-frontu" style={{
                    display: 'inline-flex', alignItems: 'center', gap: 6,
                    height: 44, padding: '0 10px', borderRadius: 9,
                    background: 'transparent', border: 'none', color: 'var(--muted)',
                    fontSize: 12.5, fontWeight: 600, letterSpacing: 0, textTransform: 'none',
                    cursor: 'pointer', touchAction: 'manipulation',
                  }}>
                    <Trash2 size={15} /> {isMobile ? 'Smazat' : 'Smazat frontu'}
                  </button>
                ))}
                {fronta.map((c, i) => radek(c, true, i === fronta.length - 1))}
              </div>
            )}
            {zavolane.length > 0 && (
              <div style={karta}>
                {predel('Zavoláno', zavolane.length, 'hovor')}
                {zavolane.map((c, i) => radek(c, false, i === zavolane.length - 1))}
              </div>
            )}
          </>
        )}
      </div>

      {/* mobilní akce dole */}
      {isMobile && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10, padding: '12px 0 0' }}>
          <button onClick={() => router.push('/cold-cally/novy')} style={{ ...primaryBtn, width: '100%', height: 52, borderRadius: 13 }}>
            <Plus size={18} strokeWidth={2.5} /> Přidat hovor
          </button>
          <div style={{ display: 'flex', gap: 10 }}>
            <button onClick={() => setImportOpen(true)} style={{ ...ghostBtn, flex: 1 }}>
              <Upload size={16} /> Nahrát leady
            </button>
            <button onClick={exportuj} style={{ ...ghostBtn, flex: 1 }}>
              <Download size={16} /> Export
            </button>
          </div>
          {/* Na mobilu je „Přidat hovor" tady dole, takže odkaz na Co se učím
              patří k němu — v hlavičce je jen datum. */}
          <button onClick={() => router.push('/co-se-ucim')} style={{ ...ghostBtn, width: '100%' }}>
            <Lightbulb size={16} /> Co se učím
          </button>
        </div>
      )}

      <ImportModal
        isOpen={importOpen}
        onClose={() => setImportOpen(false)}
        existujiciTelefony={calls.map(c => c.telefon || '').filter(t => telefonKlic(t))}
        onImport={importuj}
      />
      {toast && <Toast message={toast.message} type={toast.type} onClose={hideToast} />}
      {dialog}
    </div>
  )
}
