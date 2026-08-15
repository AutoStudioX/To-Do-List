'use client'
import { useCallback, useEffect, useMemo, useState } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { Toast, useToast } from '@/components/Toast'
import { useToday } from '@/lib/useToday'
import { useLiveData } from '@/lib/useLiveData'
import ImportModal from '@/components/coldCalls/ImportModal'
import {
  statistiky, serad, hledej, fmtKdy, fmtTelefon, doCsv, telefonKlic,
  VYSLEDEK_STYL, VYSLEDKY, type ColdCall, type Vysledek,
} from '@/lib/coldCalls'
import {
  Phone, PhoneCall, CircleX, CalendarCheck, Plus, Upload, Download, Search, Lightbulb,
} from 'lucide-react'

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

  const fronta = videt.filter(c => c.vysledek === 'ceka')
  const zavolane = videt.filter(c => c.vysledek !== 'ceka')

  async function importuj(radky: { firma: string; kontakt_jmeno: string | null; telefon: string | null }[]) {
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

  const radek = (c: ColdCall, lead: boolean) => {
    const kdy = lead
      ? (c.telefon ? fmtTelefon(c.telefon) : 'bez čísla')
      : fmtKdy(c.volano_at || c.created_at)
    if (isMobile) {
      return (
        <button key={c.id} onClick={() => router.push(`/cold-cally/${c.id}`)} className="cc-row" style={{
          width: '100%', display: 'flex', alignItems: 'center', gap: 12, minHeight: 58,
          padding: '9px 14px', borderBottom: '1px solid var(--border)', boxSizing: 'border-box',
          background: lead ? 'var(--cc-queue-bg)' : 'transparent', border: 'none',
          borderLeft: lead ? '3px solid var(--cc-queue-line)' : '3px solid transparent',
          textAlign: 'left', cursor: 'pointer', touchAction: 'manipulation',
        }}>
          <span style={{ flex: 1, minWidth: 0 }}>
            {/* Výška řádku je z designu 58 px. Bez explicitní výšky řádku ji
                globální `line-height` appky přeroste na 61. */}
            <span style={{
              display: 'block', fontSize: 15, lineHeight: 1.25, fontWeight: 600, color: 'var(--text)',
              whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis',
            }}>{c.firma}</span>
            <span style={{
              display: 'block', marginTop: 2, fontSize: 12.5, lineHeight: 1.2, color: 'var(--muted)',
              fontVariantNumeric: 'tabular-nums',
            }}>{kdy}</span>
          </span>
          {badge(c.vysledek)}
        </button>
      )
    }
    return (
      <button key={c.id} onClick={() => router.push(`/cold-cally/${c.id}`)} className="cc-row" style={{
        width: '100%', display: 'flex', alignItems: 'center', gap: 18, minHeight: 57,
        padding: '0 20px', borderBottom: '1px solid var(--border)', background: lead ? 'var(--cc-queue-bg)' : 'transparent',
        border: 'none', borderLeft: lead ? '3px solid var(--cc-queue-line)' : '3px solid transparent',
        textAlign: 'left', cursor: 'pointer',
      }}>
        <span style={{
          flex: 1, minWidth: 0, fontSize: 15, fontWeight: 600, color: 'var(--text)',
          overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
        }}>{c.firma}</span>
        <span style={{ fontSize: 13, color: 'var(--muted)', fontVariantNumeric: 'tabular-nums', flexShrink: 0 }}>{kdy}</span>
        <span style={{ width: 128, display: 'flex', justifyContent: 'flex-end', flexShrink: 0 }}>{badge(c.vysledek)}</span>
      </button>
    )
  }

  /** Hlavička části seznamu — fronta k obvolání vs. odvolané hovory. */
  const predel = (text: string, pocet: number | null, modry: boolean) => (
    <div style={{
      display: 'flex', alignItems: 'center', gap: 10, padding: isMobile ? '8px 14px' : '9px 20px',
      background: modry ? 'var(--cc-queue-bg)' : 'transparent',
      borderBottom: '1px solid var(--border)',
      fontSize: 11.5, fontWeight: 800, letterSpacing: '.1em', textTransform: 'uppercase',
      color: modry ? 'var(--cc-ceka-text)' : 'var(--muted)',
    }}>
      {text}
      {pocet != null && (
        <span style={{ fontWeight: 600, letterSpacing: 0, color: 'var(--muted)', textTransform: 'none' }}>
          {pocet} {pocet === 1 ? 'lead' : pocet < 5 ? 'leady' : 'leadů'}
        </span>
      )}
    </div>
  )

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

      {/* seznam */}
      <div style={{
        marginTop: isMobile ? 14 : 26, background: 'var(--card)', border: '1px solid var(--border)',
        borderRadius: 12, overflow: 'hidden',
      }}>
        {prazdno ? (
          <div style={{
            display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 8,
            padding: isMobile ? 40 : 56, textAlign: 'center',
          }}>
            <Phone size={26} style={{ color: 'var(--muted)', opacity: 0.6 }} />
            <div style={{ fontSize: 15, fontWeight: 600, color: 'var(--text)' }}>Zatím žádné hovory</div>
            <div style={{ fontSize: 13, color: 'var(--muted)' }}>
              Záznamy se objeví hned po prvním hovoru. Leady nahraješ tlačítkem „Nahrát leady".
            </div>
          </div>
        ) : nicNenalezeno ? (
          <div style={{ padding: isMobile ? 32 : 48, textAlign: 'center', fontSize: 14, color: 'var(--muted)' }}>
            Nic neodpovídá hledání ani filtru.
          </div>
        ) : (
          <>
            {/* Fronta k obvolání — vlastní část seznamu, ne jen jiný badge. */}
            {fronta.length > 0 && predel('K obvolání', fronta.length, true)}
            {fronta.map(c => radek(c, true))}
            {fronta.length > 0 && zavolane.length > 0 && predel('Zavoláno', null, false)}
            {zavolane.map(c => radek(c, false))}
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
