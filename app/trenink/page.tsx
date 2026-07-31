'use client'
import { useCallback, useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import type { Workout, SplitType } from '@/lib/types'
import { useLiveData } from '@/lib/useLiveData'
import { SPLITS, nextSplit } from '@/lib/gym'
import { Plus, Dumbbell, ChevronRight } from 'lucide-react'

const splitColor: Record<SplitType, string> = { Push: '#e53e3e', Pull: '#2563eb', Legs: '#059669' }

export default function TreninkPage() {
  const router = useRouter()
  const [workouts, setWorkouts] = useState<Workout[]>([])
  const [counts, setCounts] = useState<Record<string, number>>({})
  const [loading, setLoading] = useState(true)
  const [picking, setPicking] = useState(false)
  const [split, setSplit] = useState<SplitType>('Push')
  const [starting, setStarting] = useState(false)

  const load = useCallback(async () => {
    const supabase = createClient()
    const { data: { session } } = await supabase.auth.getSession()
    const user = session?.user
    if (!user) return
    const { data: ws } = await supabase.from('workouts').select('*').eq('user_id', user.id).order('date', { ascending: false }).order('created_at', { ascending: false })
    const list = (ws || []) as Workout[]
    setWorkouts(list)
    setSplit(nextSplit(list[0]?.split_type))
    if (list.length) {
      const { data: sets } = await supabase.from('workout_sets').select('workout_id, is_warmup').in('workout_id', list.map(w => w.id))
      const c: Record<string, number> = {}
      for (const s of (sets || []) as { workout_id: string; is_warmup: boolean }[]) {
        if (!s.is_warmup) c[s.workout_id] = (c[s.workout_id] || 0) + 1
      }
      setCounts(c)
    }
    setLoading(false)
  }, [])

  useEffect(() => { load() }, [load])
  useLiveData(['workouts', 'workout_sets'], load)

  async function startWorkout() {
    setStarting(true)
    const supabase = createClient()
    const { data: { session } } = await supabase.auth.getSession()
    const user = session?.user
    if (!user) { setStarting(false); return }
    const { data, error } = await supabase.from('workouts').insert({ user_id: user.id, split_type: split }).select().single()
    setStarting(false)
    if (error || !data) return
    router.push(`/trenink/${data.id}`)
  }

  const fmtDate = (d: string) => new Date(d).toLocaleDateString('cs-CZ', { day: 'numeric', month: 'numeric' })

  if (loading) return <div style={{ color: 'var(--muted)', padding: 24 }}>Načítání…</div>

  return (
    <div style={{ maxWidth: 640, margin: '0 auto', paddingBottom: 24 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 16 }}>
        <Dumbbell size={24} />
        <h1 style={{ fontSize: 26, fontWeight: 700, color: 'var(--text)', margin: 0 }}>Trénink</h1>
      </div>

      {!picking ? (
        <button
          onClick={() => setPicking(true)}
          style={{ width: '100%', minHeight: 52, background: '#e53e3e', color: '#fff', border: 'none', borderRadius: 12, fontSize: 16, fontWeight: 700, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8, boxShadow: '0 4px 14px rgba(229,62,62,0.35)', touchAction: 'manipulation' }}
        >
          <Plus size={20} /> Nový trénink
        </button>
      ) : (
        <div style={{ background: 'var(--card)', border: '1px solid var(--border)', borderRadius: 12, padding: 16, boxShadow: 'var(--shadow)' }}>
          <div style={{ fontSize: 13, color: 'var(--muted)', marginBottom: 10, fontWeight: 500 }}>Typ tréninku</div>
          <div style={{ display: 'flex', gap: 8, marginBottom: 14 }}>
            {SPLITS.map(s => {
              const active = split === s
              return (
                <button key={s} type="button" onClick={() => setSplit(s)} style={{
                  flex: 1, minHeight: 48, borderRadius: 10, fontSize: 15, fontWeight: 700, cursor: 'pointer', touchAction: 'manipulation',
                  border: `1px solid ${active ? splitColor[s] : 'var(--border)'}`,
                  background: active ? splitColor[s] : 'var(--input-bg)', color: active ? '#fff' : 'var(--text)',
                }}>{s}</button>
              )
            })}
          </div>
          <div style={{ display: 'flex', gap: 8 }}>
            <button onClick={() => setPicking(false)} style={{ flex: 1, minHeight: 48, background: 'transparent', border: '1px solid var(--border)', borderRadius: 10, color: 'var(--text)', fontSize: 15, cursor: 'pointer' }}>Zrušit</button>
            <button onClick={startWorkout} disabled={starting} style={{ flex: 2, minHeight: 48, background: '#e53e3e', border: 'none', borderRadius: 10, color: '#fff', fontSize: 15, fontWeight: 700, cursor: 'pointer', opacity: starting ? 0.6 : 1 }}>
              {starting ? 'Zakládám…' : 'Začít'}
            </button>
          </div>
        </div>
      )}

      <div style={{ fontSize: 13, color: 'var(--muted)', fontWeight: 500, margin: '22px 0 10px' }}>Historie</div>
      {workouts.length === 0 ? (
        <div style={{ background: 'var(--card)', border: '1px solid var(--border)', borderRadius: 12, padding: 24, textAlign: 'center', color: 'var(--muted)' }}>Zatím žádné tréninky.</div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          {workouts.map(w => (
            <button key={w.id} onClick={() => router.push(`/trenink/${w.id}`)} style={{ display: 'flex', alignItems: 'center', gap: 12, minHeight: 56, background: 'var(--card)', border: '1px solid var(--border)', borderRadius: 12, padding: '10px 14px', cursor: 'pointer', textAlign: 'left', boxShadow: 'var(--shadow)', touchAction: 'manipulation' }}>
              {w.split_type && <span style={{ fontSize: 12, fontWeight: 700, color: '#fff', background: splitColor[w.split_type], borderRadius: 8, padding: '4px 10px' }}>{w.split_type}</span>}
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: 15, fontWeight: 600, color: 'var(--text)' }}>{fmtDate(w.date)}</div>
                <div style={{ fontSize: 12, color: 'var(--muted)' }}>{counts[w.id] || 0} sérií{w.duration_min ? ` · ${w.duration_min} min` : ''}</div>
              </div>
              <ChevronRight size={18} color="var(--muted)" />
            </button>
          ))}
        </div>
      )}
    </div>
  )
}
