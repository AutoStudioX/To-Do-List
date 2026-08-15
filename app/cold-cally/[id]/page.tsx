'use client'
import { useCallback, useEffect, useMemo, useState } from 'react'
import { useParams, useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import CallForm from '@/components/coldCalls/CallForm'
import { Toast, useToast } from '@/components/Toast'
import type { ColdCall } from '@/lib/coldCalls'

/** Detail/úprava záznamu — stejný formulář jako nový hovor, jen předvyplněný.
 *  Sem se chodí i z fronty: nahraný lead se tímhle formulářem „zavolá". */
export default function DetailHovoruPage() {
  const router = useRouter()
  const { id } = useParams<{ id: string }>()
  const supabase = useMemo(() => createClient(), [])
  const [zaznam, setZaznam] = useState<ColdCall | null>(null)
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
    if (!session?.user) { setLoading(false); return }
    const { data, error } = await supabase.from('cold_calls').select('*').eq('id', id).single()
    if (error) { showToast(`Načtení selhalo: ${error.message}`, 'error'); setLoading(false); return }
    setZaznam(data as ColdCall)
    setLoading(false)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [supabase, id])

  useEffect(() => { load() }, [load])

  if (loading) return <div style={{ color: 'var(--muted)', padding: 24 }}>Načítání…</div>
  if (!zaznam) return <div style={{ color: 'var(--muted)', padding: 24 }}>Záznam nenalezen.</div>

  return (
    <>
      <CallForm
        zaznam={zaznam}
        isMobile={isMobile}
        onSaved={(h) => { showToast(h); router.push('/cold-cally') }}
        onError={(h) => showToast(h, 'error')}
      />
      {toast && <Toast message={toast.message} type={toast.type} onClose={hideToast} />}
    </>
  )
}
