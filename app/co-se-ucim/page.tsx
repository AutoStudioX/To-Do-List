'use client'
import { useCallback, useEffect, useMemo, useState } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { Toast, useToast } from '@/components/Toast'
import { useLiveData } from '@/lib/useLiveData'
import { fmtRelativne, rozpadFazi, FAZE_LABEL, type ColdCall } from '@/lib/coldCalls'
import { Lightbulb, ChevronLeft } from 'lucide-react'

/**
 * Co se učím (artboardy 3a/3b) — poznámky „co příště jinak" a rozpad fází.
 *
 * Samostatná stránka, ale mimo navigaci: chodí se sem ze seznamu hovorů, ne
 * z postranního panelu. Je to výstup té sekce, ne další oddíl appky.
 *
 * Rozpad i poznámky se počítají ze VŠECH hovorů — filtr v seznamu slouží
 * k hledání záznamu, ne k učení se z nich, takže ho sem nepřenášíme.
 */
export default function CoSeUcimPage() {
  const router = useRouter()
  const supabase = useMemo(() => createClient(), [])
  const [calls, setCalls] = useState<ColdCall[]>([])
  const [loading, setLoading] = useState(true)
  const [isMobile, setIsMobile] = useState(false)
  const { toast, showToast, hideToast } = useToast()

  useEffect(() => {
    const check = () => setIsMobile(window.innerWidth <= 768)
    check()
    window.addEventListener('resize', check)
    return () => window.removeEventListener('resize', check)
  }, [])

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

  // Nejnovější nahoře; prázdné poznámky (samé mezery) sem nepatří.
  const poznamky = useMemo(() => calls
    .filter(c => (c.co_priste_jinak ?? '').trim())
    .sort((a, b) => (b.volano_at || b.created_at).localeCompare(a.volano_at || a.created_at)),
  [calls])
  const rozpad = useMemo(() => rozpadFazi(calls), [calls])
  const fazíCelkem = rozpad.reduce((a, r) => a + r.pocet, 0)

  if (loading) return <div style={{ color: 'var(--muted)', padding: 24 }}>Načítání…</div>

  return (
    <div style={{ maxWidth: 860, margin: '0 auto', paddingBottom: 24 }}>
      <button onClick={() => router.push('/cold-cally')} style={{
        display: 'inline-flex', alignItems: 'center', gap: 6, height: 44, padding: 0,
        background: 'transparent', border: 'none', color: 'var(--muted)',
        fontSize: 13.5, fontWeight: 500, cursor: 'pointer', touchAction: 'manipulation',
      }}><ChevronLeft size={17} /> Cold cally</button>

      <div style={{ display: 'flex', alignItems: 'center', gap: 9 }}>
        <Lightbulb size={isMobile ? 18 : 20} style={{ color: 'var(--accent)' }} />
        <h1 className="cc-h1" style={{
          margin: 0, fontSize: isMobile ? 20 : 23, fontWeight: 700,
          letterSpacing: '-.015em', color: 'var(--text)',
        }}>Co se učím</h1>
      </div>
      <div style={{ marginTop: 5, fontSize: 13.5, color: 'var(--muted)' }}>
        Všechna „co příště jinak" z hovorů · {poznamky.length}{' '}
        {poznamky.length === 1 ? 'poznámka' : poznamky.length < 5 ? 'poznámky' : 'poznámek'}
      </div>

      {/* Rozpad fází — měřitelné vedle dojmů z poznámek. Čte se odshora dolů
          jako trychtýř: kde hovory padají nejčastěji. */}
      <div style={{
        marginTop: isMobile ? 14 : 20, background: 'var(--card)', border: '1px solid var(--border)',
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
          display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 8,
          padding: isMobile ? 32 : 48, marginTop: 14, textAlign: 'center',
          background: 'var(--card)', border: '1px solid var(--border)', borderRadius: 12,
        }}>
          <Lightbulb size={26} style={{ color: 'var(--muted)', opacity: 0.6 }} />
          <div style={{ fontSize: 15, fontWeight: 600, color: 'var(--text)' }}>Zatím žádné poznámky</div>
          <div style={{ fontSize: 13, color: 'var(--muted)' }}>
            Objeví se tu všechno, co u hovoru napíšeš do „Co příště jinak".
          </div>
        </div>
      ) : (
        <div style={{ marginTop: isMobile ? 6 : 10, maxWidth: 720 }}>
          {poznamky.map(c => (
            <button key={c.id} onClick={() => router.push(`/cold-cally/${c.id}`)} style={{
              display: 'block', width: '100%', textAlign: 'left', cursor: 'pointer',
              padding: isMobile ? '18px 0' : '22px 0', background: 'transparent', border: 'none',
              borderBottom: '1px solid var(--border)', touchAction: 'manipulation',
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
      {toast && <Toast message={toast.message} type={toast.type} onClose={hideToast} />}
    </div>
  )
}
