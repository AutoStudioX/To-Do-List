'use client'
import { useCallback, useEffect, useMemo, useState } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { Toast, useToast } from '@/components/Toast'
import { useLiveData } from '@/lib/useLiveData'
import { fmtRelativne, type ColdCall } from '@/lib/coldCalls'
import { Lightbulb, ChevronLeft } from 'lucide-react'

/**
 * Co se učím (artboardy 3a/3b) — čistý výpis poznámek „co příště jinak".
 *
 * Podle handoffu tu nejsou žádné filtry ani akce: obrazovka se má přečíst
 * jedním tahem, ne procházet. Kliknutí na položku vede na záznam, ze kterého
 * poznámka je — to je jediná interakce.
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
    const { data, error } = await supabase.from('cold_calls').select('*')
      .eq('user_id', user.id).not('co_priste_jinak', 'is', null)
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

  if (loading) return <div style={{ color: 'var(--muted)', padding: 24 }}>Načítání…</div>

  return (
    <div style={{ maxWidth: 720, margin: '0 auto', paddingBottom: 24 }}>
      {isMobile && (
        <button onClick={() => router.push('/cold-cally')} style={{
          display: 'inline-flex', alignItems: 'center', gap: 6, height: 44, padding: 0,
          background: 'transparent', border: 'none', color: 'var(--muted)',
          fontSize: 13.5, fontWeight: 500, cursor: 'pointer',
        }}><ChevronLeft size={17} /> Cold cally</button>
      )}
      <h1 className="cc-h1" style={{
        margin: 0, fontSize: isMobile ? 20 : 23, fontWeight: 700,
        letterSpacing: '-.015em', color: 'var(--text)',
      }}>Co se učím</h1>
      <div style={{ marginTop: 5, fontSize: 13.5, color: 'var(--muted)' }}>
        Všechna „co příště jinak" z hovorů · {poznamky.length}{' '}
        {poznamky.length === 1 ? 'poznámka' : poznamky.length < 5 ? 'poznámky' : 'poznámek'}
      </div>

      {poznamky.length === 0 ? (
        <div style={{
          display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 8,
          padding: isMobile ? 40 : 56, marginTop: 20, textAlign: 'center',
          background: 'var(--card)', border: '1px solid var(--border)', borderRadius: 12,
        }}>
          <Lightbulb size={26} style={{ color: 'var(--muted)', opacity: 0.6 }} />
          <div style={{ fontSize: 15, fontWeight: 600, color: 'var(--text)' }}>Zatím žádné poznámky</div>
          <div style={{ fontSize: 13, color: 'var(--muted)' }}>
            Objeví se tu všechno, co u hovoru napíšeš do „Co příště jinak".
          </div>
        </div>
      ) : (
        <div style={{ marginTop: isMobile ? 6 : 10 }}>
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
      {toast && <Toast message={toast.message} type={toast.type} onClose={hideToast} />}
    </div>
  )
}
