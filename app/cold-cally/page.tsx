'use client'
import { useCallback, useEffect, useMemo, useState } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { Toast, useToast } from '@/components/Toast'
import { useToday } from '@/lib/useToday'
import { useLiveData } from '@/lib/useLiveData'
import ImportModal from '@/components/coldCalls/ImportModal'
import {
  statistiky, serad, hledej, fmtKdy, fmtTelefon, fmtRelativne, doCsv, telefonKlic,
  rozpadFazi, FAZE_LABEL, VYSLEDEK_STYL, VYSLEDKY, type ColdCall, type Vysledek,
} from '@/lib/coldCalls'
import {
  Phone, PhoneCall, CircleX, CalendarCheck, Plus, Upload, Download, Search, Lightbulb,
} from 'lucide-react'

// „Co se učím" není samostatná obrazovka: poznámky i rozpad fází se čtou
// k seznamu, ze kterého pocházejí, takže sedí pod ním.

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

  // Poznámky a rozpad se počítají ze VŠECH hovorů, ne z toho, co je zrovna
  // vidět — filtr v seznamu je na hledání záznamu, ne na učení se z nich.
  const poznamky = useMemo(() => calls
    .filter(c => (c.co_priste_jinak ?? '').trim())
    .sort((a, b) => (b.volano_at || b.created_at).localeCompare(a.volano_at || a.created_at)),
  [calls])
  const rozpad = useMemo(() => rozpadFazi(calls), [calls])
  const fazíCelkem = rozpad.reduce((a, r) => a + r.pocet, 0)

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

    return (
      <button key={c.id} onClick={() => router.push(`/cold-cally/${c.id}`)} className="cc-row" style={{
        width: '100%', display: 'flex', alignItems: 'center',
        gap: isMobile ? 12 : 18, minHeight: isMobile ? 58 : 57,
        padding: isMobile ? '9px 14px' : '9px 20px',
        // Poslední řádek v kartě už linku nepotřebuje — kryla by se s okrajem.
        borderBottom: posledni ? 'none' : '1px solid var(--border)', boxSizing: 'border-box',
        background: 'transparent', border: 'none',
        borderLeft: `3px solid ${pruh}`,
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
  const predel = (text: string, pocet: number, jedn: 'lead' | 'hovor') => (
    <div style={{
      display: 'flex', alignItems: 'baseline', gap: 10,
      padding: isMobile ? '10px 14px' : '11px 20px',
      background: 'var(--hover-bg)', borderBottom: '1px solid var(--border)',
      fontSize: 11.5, fontWeight: 800, letterSpacing: '.1em', textTransform: 'uppercase',
      color: 'var(--text)',
    }}>
      {text}
      <span style={{ fontWeight: 600, letterSpacing: 0, textTransform: 'none', color: 'var(--muted)' }}>
        {pocetSlovem(pocet, jedn)}
      </span>
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
      <style>{`.cc-row:hover { background: var(--hover-bg) !important; }`}</style>

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
                {predel('K obvolání', fronta.length, 'lead')}
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
        </div>
      )}

      {/* ── Co se učím ── */}
      <div style={{ marginTop: isMobile ? 22 : 40 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 9 }}>
          <Lightbulb size={17} style={{ color: 'var(--accent)' }} />
          <h2 style={{
            margin: 0, fontSize: isMobile ? 17 : 19, fontWeight: 700,
            letterSpacing: '-.01em', color: 'var(--text)',
          }}>Co se učím</h2>
        </div>
        <div style={{ marginTop: 5, fontSize: 13.5, color: 'var(--muted)' }}>
          Všechna „co příště jinak" z hovorů · {poznamky.length}{' '}
          {poznamky.length === 1 ? 'poznámka' : poznamky.length < 5 ? 'poznámky' : 'poznámek'}
        </div>

        {/* Rozpad fází — měřitelné vedle dojmů z poznámek. Čte se odshora
            dolů jako trychtýř: kde hovory padají nejčastěji. */}
        <div style={{
          marginTop: 14, background: 'var(--card)', border: '1px solid var(--border)',
          borderRadius: 12, padding: isMobile ? '14px 16px' : '18px 20px',
        }}>
          <div style={{
            display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', gap: 12,
            fontSize: 11.5, fontWeight: 800, letterSpacing: '.1em', textTransform: 'uppercase',
            color: 'var(--muted)',
          }}>
            Kde hovory končí
            <span style={{ fontWeight: 600, letterSpacing: 0, textTransform: 'none' }}>
              {fazíCelkem ? `z ${fazíCelkem} hovorů` : 'zatím bez dat'}
            </span>
          </div>
          <div style={{ marginTop: 12, display: 'flex', flexDirection: 'column', gap: 9 }}>
            {rozpad.map(r => (
              <div key={r.faze} style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                <span style={{
                  // Na 390px se „Při popisu produktu" do 116px nevešlo a ořízlo
                  // se na „Při popisu produ…" — sloupec je proto širší.
                  width: isMobile ? 126 : 150, flexShrink: 0, fontSize: isMobile ? 13 : 13.5, color: 'var(--text)',
                  overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                }}>{FAZE_LABEL[r.faze]}</span>
                <span style={{
                  flex: 1, minWidth: 0, height: 8, borderRadius: 99,
                  background: 'var(--progress-track)', overflow: 'hidden',
                }}>
                  <span style={{
                    display: 'block', width: `${Math.round(r.podil * 100)}%`, height: '100%',
                    borderRadius: 99, background: 'var(--accent)',
                  }} />
                </span>
                <span style={{
                  width: 58, flexShrink: 0, textAlign: 'right', fontSize: 13.5, fontWeight: 600,
                  color: r.pocet ? 'var(--text)' : 'var(--muted)', fontVariantNumeric: 'tabular-nums',
                }}>{r.pocet}{fazíCelkem ? ` · ${Math.round(r.podil * 100)} %` : ''}</span>
              </div>
            ))}
          </div>
          {!fazíCelkem && (
            <div style={{ marginTop: 12, fontSize: 12.5, color: 'var(--muted)' }}>
              Vyplň u hovoru „Kde skončil" a uvidíš, ve které fázi to nejčastěji padá.
            </div>
          )}
        </div>

        {/* Poznámky — rozměry z handoffu (obrazovka 3). */}
        {poznamky.length === 0 ? (
          <div style={{
            marginTop: 14, padding: isMobile ? 24 : 32, textAlign: 'center',
            background: 'var(--card)', border: '1px solid var(--border)', borderRadius: 12,
            fontSize: 13.5, color: 'var(--muted)',
          }}>
            Objeví se tu všechno, co u hovoru napíšeš do „Co příště jinak".
          </div>
        ) : (
          <div style={{ marginTop: isMobile ? 6 : 10, maxWidth: 720 }}>
            {poznamky.map(c => (
              <button key={c.id} onClick={() => router.push(`/cold-cally/${c.id}`)} style={{
                display: 'block', width: '100%', textAlign: 'left', cursor: 'pointer',
                padding: isMobile ? '18px 0' : '22px 0', background: 'transparent', border: 'none',
                borderBottom: '1px solid var(--border)',
              }}>
                <span style={{
                  display: 'block', fontSize: isMobile ? 15.5 : 17.5,
                  lineHeight: isMobile ? 1.6 : 1.62, color: 'var(--text)',
                }}>{c.co_priste_jinak}</span>
                <span style={{
                  display: 'block', marginTop: 9, fontSize: isMobile ? 12.5 : 13, color: 'var(--muted)',
                }}>{c.firma} · {fmtRelativne(c.volano_at || c.created_at)}</span>
              </button>
            ))}
          </div>
        )}
      </div>

      <ImportModal
        isOpen={importOpen}
        onClose={() => setImportOpen(false)}
        existujiciTelefony={calls.map(c => c.telefon || '').filter(t => telefonKlic(t))}
        onImport={importuj}
      />
      {toast && <Toast message={toast.message} type={toast.type} onClose={hideToast} />}
    </div>
  )
}
