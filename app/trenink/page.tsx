'use client'
import { useCallback, useEffect, useMemo, useState } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import type { Workout, SplitType } from '@/lib/types'
import { useLiveData } from '@/lib/useLiveData'
import { SPLITS, nextSplit, splitColor, volume, fmtTonnage, pctDelta, topSet, fmtSet, startOfWeek } from '@/lib/gym'
import { Plus, Dumbbell, ChevronRight, Trash2 } from 'lucide-react'

type SetRow = { workout_id: string; exercise_id: string; weight_kg: number | null; reps: number | null; is_warmup: boolean; order_index: number }
type Derived = { count: number; vol: number; summary: { name: string; set: string }[] }

// "dnes" / "včera" / "29. 7."
function relDate(iso: string): string {
  const d = new Date(iso)
  const today = new Date(); today.setHours(0, 0, 0, 0)
  const day = new Date(d.getFullYear(), d.getMonth(), d.getDate())
  const diff = Math.round((today.getTime() - day.getTime()) / 86400000)
  if (diff === 0) return 'dnes'
  if (diff === 1) return 'včera'
  return d.toLocaleDateString('cs-CZ', { day: 'numeric', month: 'numeric' })
}

export default function TreninkPage() {
  const router = useRouter()
  const [workouts, setWorkouts] = useState<Workout[]>([])
  const [derived, setDerived] = useState<Record<string, Derived>>({})
  const [loading, setLoading] = useState(true)
  const [picking, setPicking] = useState(false)
  const [split, setSplit] = useState<SplitType>('Push')
  const [customMode, setCustomMode] = useState(false)
  const [customName, setCustomName] = useState('')
  const [starting, setStarting] = useState(false)
  const [deleting, setDeleting] = useState<string | null>(null)
  const [filter, setFilter] = useState<'Vše' | SplitType>('Vše')

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
      const ids = list.map(w => w.id)
      const [{ data: sets }, { data: cat }] = await Promise.all([
        supabase.from('workout_sets').select('workout_id, exercise_id, weight_kg, reps, is_warmup, order_index').in('workout_id', ids),
        supabase.from('exercises').select('id, name').or(`user_id.is.null,user_id.eq.${user.id}`),
      ])
      const names = new Map<string, string>((cat || []).map((e: { id: string; name: string }) => [e.id, e.name]))
      const byWorkout = new Map<string, SetRow[]>()
      for (const s of (sets || []) as SetRow[]) {
        const g = byWorkout.get(s.workout_id) || []; g.push(s); byWorkout.set(s.workout_id, g)
      }
      const d: Record<string, Derived> = {}
      for (const w of list) {
        const rows = byWorkout.get(w.id) || []
        const working = rows.filter(r => !r.is_warmup)
        // top set per exercise, exercises ordered by order_index, first 3
        const perEx = new Map<string, SetRow[]>()
        for (const r of rows) { const g = perEx.get(r.exercise_id) || []; g.push(r); perEx.set(r.exercise_id, g) }
        const exOrder = [...perEx.entries()].sort((a, b) => (a[1][0]?.order_index ?? 0) - (b[1][0]?.order_index ?? 0))
        const summary = exOrder.slice(0, 3).map(([exId, exSets]) => ({
          name: names.get(exId) || 'Cvik',
          set: fmtSet(topSet(exSets)),
        })).filter(s => s.set)
        d[w.id] = { count: working.length, vol: volume(rows), summary }
      }
      setDerived(d)
    } else {
      setDerived({})
    }
    setLoading(false)
  }, [])

  useEffect(() => { load() }, [load])
  useLiveData(['workouts', 'workout_sets'], load)

  // Weekly stats (Mon–Sun): this week vs last week.
  const week = useMemo(() => {
    const mon = startOfWeek(new Date()).getTime()
    const lastMon = mon - 7 * 86400000
    let count = 0, vol = 0, sets = 0, lastVol = 0
    for (const w of workouts) {
      const t = new Date(w.date).getTime()
      const dv = derived[w.id]
      if (t >= mon) { count++; vol += dv?.vol || 0; sets += dv?.count || 0 }
      else if (t >= lastMon) { lastVol += dv?.vol || 0 }
    }
    return { count, vol, sets, delta: pctDelta(vol, lastVol) }
  }, [workouts, derived])

  // Most recent workout of the currently-selected split → preview card.
  const lastOfSplit = useMemo(() => {
    if (customMode) return null
    const w = workouts.find(x => x.split_type === split)
    if (!w) return null
    return { workout: w, summary: derived[w.id]?.summary || [] }
  }, [workouts, split, customMode, derived])

  const last = workouts[0]

  async function startWorkout() {
    const split_type = customMode ? customName.trim() : split
    if (customMode && !split_type) return
    setStarting(true)
    const supabase = createClient()
    const { data: { session } } = await supabase.auth.getSession()
    const user = session?.user
    if (!user) { setStarting(false); return }
    const { data, error } = await supabase.from('workouts').insert({ user_id: user.id, split_type }).select().single()
    setStarting(false)
    if (error || !data) return
    router.push(`/trenink/${data.id}`)
  }

  async function deleteWorkout(id: string) {
    if (!confirm('Opravdu smazat tento trénink i s jeho sériemi?')) return
    setDeleting(id)
    const supabase = createClient()
    const { error } = await supabase.from('workouts').delete().eq('id', id)
    setDeleting(null)
    if (error) return
    setWorkouts(prev => prev.filter(w => w.id !== id))
  }

  const shown = filter === 'Vše' ? workouts : workouts.filter(w => w.split_type === filter)

  if (loading) return <div style={{ color: 'var(--muted)', padding: 24 }}>Načítání…</div>

  return (
    <div style={{ maxWidth: 720, margin: '0 auto', paddingBottom: 24 }}>
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 18 }}>
        <div style={{ width: 40, height: 40, borderRadius: 12, background: '#E8192C', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
          <Dumbbell size={22} color="#fff" />
        </div>
        <div>
          <h1 style={{ fontSize: 24, fontWeight: 800, color: 'var(--text)', margin: 0, lineHeight: 1.1 }}>Trénink</h1>
          {last && <div style={{ fontSize: 13, color: 'var(--muted)', marginTop: 2 }}>Poslední: {last.split_type || '—'} · {relDate(last.date)}</div>}
        </div>
      </div>

      {/* Weekly stats */}
      <div style={{ fontSize: 11, letterSpacing: 0.6, color: 'var(--muted)', fontWeight: 700, margin: '0 0 8px' }}>TENTO TÝDEN</div>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, minmax(0,1fr))', gap: 8, marginBottom: 20 }}>
        {[
          { big: String(week.count), small: 'tréninky' },
          { big: week.vol ? fmtTonnage(week.vol) : '0', small: week.delta != null ? `${week.delta >= 0 ? '+' : ''}${week.delta} % objem` : 'objem' },
          { big: String(week.sets), small: 'sérií' },
        ].map((s, i) => (
          <div key={i} style={{ background: 'var(--card)', border: '1px solid var(--border)', borderRadius: 14, padding: '14px 12px', boxShadow: 'var(--shadow)' }}>
            <div style={{ fontSize: 24, fontWeight: 800, color: 'var(--text)', lineHeight: 1 }}>{s.big}</div>
            <div style={{ fontSize: 11, color: i === 1 && week.delta != null && week.delta >= 0 ? '#10b981' : 'var(--muted)', marginTop: 5 }}>{s.small}</div>
          </div>
        ))}
      </div>

      {/* New workout */}
      {!picking ? (
        <button
          onClick={() => setPicking(true)}
          style={{ width: '100%', minHeight: 56, background: '#E8192C', color: '#fff', border: 'none', borderRadius: 14, fontSize: 16, fontWeight: 700, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8, boxShadow: '0 4px 14px rgba(232, 25, 44,0.35)', touchAction: 'manipulation' }}
        >
          <Plus size={20} /> Nový trénink
        </button>
      ) : (
        <div style={{ background: 'var(--card)', border: '1px solid var(--border)', borderRadius: 16, padding: 16, boxShadow: 'var(--shadow)' }}>
          <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', marginBottom: 10 }}>
            <div style={{ fontSize: 11, letterSpacing: 0.6, color: 'var(--muted)', fontWeight: 700 }}>TYP TRÉNINKU</div>
            {!customMode && <div style={{ fontSize: 12, color: 'var(--muted)' }}>na řadě je <span style={{ color: '#E8192C', fontWeight: 700 }}>{split}</span></div>}
          </div>
          <div style={{ display: 'flex', gap: 8, marginBottom: 14 }}>
            {SPLITS.map(s => {
              const active = !customMode && split === s
              return (
                <button key={s} type="button" onClick={() => { setCustomMode(false); setSplit(s) }} style={{
                  flex: 1, minHeight: 48, borderRadius: 12, fontSize: 15, fontWeight: 700, cursor: 'pointer', touchAction: 'manipulation',
                  border: `1px solid ${active ? splitColor(s) : 'var(--border)'}`,
                  background: active ? splitColor(s) : 'var(--input-bg)', color: active ? '#fff' : 'var(--text)',
                }}>{s}</button>
              )
            })}
            <button type="button" onClick={() => setCustomMode(true)} style={{
              flex: 1, minHeight: 48, borderRadius: 12, fontSize: 15, fontWeight: 700, cursor: 'pointer', touchAction: 'manipulation',
              border: `1px solid ${customMode ? splitColor(null) : 'var(--border)'}`,
              background: customMode ? splitColor(null) : 'var(--input-bg)', color: customMode ? '#fff' : 'var(--text)',
            }}>Jiný</button>
          </div>
          {customMode && (
            <input
              autoFocus
              value={customName}
              onChange={e => setCustomName(e.target.value)}
              placeholder="Např. Full body, Ruce, Kardio…"
              maxLength={40}
              style={{ width: '100%', minHeight: 48, marginBottom: 14, padding: '0 14px', borderRadius: 12, border: '1px solid var(--border)', background: 'var(--input-bg)', color: 'var(--text)', fontSize: 15, boxSizing: 'border-box' }}
            />
          )}
          {/* Preview of the last same-split workout */}
          {lastOfSplit && lastOfSplit.summary.length > 0 && (
            <div style={{ background: 'var(--input-bg)', border: '1px solid var(--border)', borderRadius: 12, padding: 12, marginBottom: 14 }}>
              <div style={{ fontSize: 10, letterSpacing: 0.5, color: 'var(--muted)', fontWeight: 700, marginBottom: 8 }}>
                MINULÝ {String(lastOfSplit.workout.split_type || '').toUpperCase()} · {relDate(lastOfSplit.workout.date)}
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                {lastOfSplit.summary.map((s, i) => (
                  <div key={i} style={{ display: 'flex', justifyContent: 'space-between', gap: 10, fontSize: 13 }}>
                    <span style={{ color: 'var(--text)', fontWeight: 500, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{s.name}</span>
                    <span style={{ color: 'var(--muted)', flexShrink: 0 }}>{s.set}</span>
                  </div>
                ))}
              </div>
            </div>
          )}
          <div style={{ display: 'flex', gap: 8 }}>
            <button onClick={() => { setPicking(false); setCustomMode(false) }} style={{ flex: 1, minHeight: 48, background: 'transparent', border: '1px solid var(--border)', borderRadius: 12, color: 'var(--text)', fontSize: 15, cursor: 'pointer' }}>Zrušit</button>
            <button onClick={startWorkout} disabled={starting || (customMode && !customName.trim())} style={{ flex: 2, minHeight: 48, background: '#E8192C', border: 'none', borderRadius: 12, color: '#fff', fontSize: 15, fontWeight: 700, cursor: 'pointer', opacity: (starting || (customMode && !customName.trim())) ? 0.6 : 1 }}>
              {starting ? 'Zakládám…' : customMode ? 'Začít' : `Začít ${split}`}
            </button>
          </div>
        </div>
      )}

      {/* History */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', margin: '24px 0 10px' }}>
        <div style={{ fontSize: 11, letterSpacing: 0.6, color: 'var(--muted)', fontWeight: 700 }}>HISTORIE</div>
        <div style={{ display: 'flex', gap: 6 }}>
          {(['Vše', ...SPLITS] as const).map(f => {
            const active = filter === f
            return (
              <button key={f} onClick={() => setFilter(f)} style={{
                minHeight: 32, padding: '0 12px', borderRadius: 999, fontSize: 12, fontWeight: 600, cursor: 'pointer', touchAction: 'manipulation',
                border: `1px solid ${active ? (f === 'Vše' ? 'var(--text)' : splitColor(f)) : 'var(--border)'}`,
                background: active ? (f === 'Vše' ? 'var(--text)' : splitColor(f)) : 'transparent',
                color: active ? (f === 'Vše' ? 'var(--bg)' : '#fff') : 'var(--muted)',
              }}>{f}</button>
            )
          })}
        </div>
      </div>

      {shown.length === 0 ? (
        <div style={{ background: 'var(--card)', border: '1px solid var(--border)', borderRadius: 14, padding: 24, textAlign: 'center', color: 'var(--muted)' }}>Zatím žádné tréninky.</div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          {shown.map(w => {
            const d = derived[w.id]
            return (
              <div key={w.id} style={{ display: 'flex', alignItems: 'stretch', background: 'var(--card)', border: '1px solid var(--border)', borderRadius: 14, boxShadow: 'var(--shadow)', overflow: 'hidden' }}>
                <button onClick={() => router.push(`/trenink/${w.id}`)} style={{ flex: 1, minWidth: 0, display: 'flex', alignItems: 'center', gap: 12, background: 'transparent', border: 'none', padding: '12px 4px 12px 14px', cursor: 'pointer', textAlign: 'left', touchAction: 'manipulation' }}>
                  {w.split_type && <span style={{ fontSize: 11, fontWeight: 800, letterSpacing: 0.4, color: '#fff', background: splitColor(w.split_type), borderRadius: 8, padding: '5px 9px', flexShrink: 0, textTransform: 'uppercase' }}>{w.split_type}</span>}
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ display: 'flex', alignItems: 'baseline', gap: 8 }}>
                      <span style={{ fontSize: 15, fontWeight: 700, color: 'var(--text)' }}>{relDate(w.date)}</span>
                      <span style={{ fontSize: 12, color: 'var(--muted)' }}>{d?.count ?? 0} sérií{w.duration_min ? ` · ${w.duration_min} min` : ''}</span>
                    </div>
                    {d && d.summary.length > 0 && (
                      <div style={{ fontSize: 12, color: 'var(--muted)', marginTop: 3, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                        {d.summary.map(s => `${s.name} ${s.set}`).join(' · ')}
                      </div>
                    )}
                  </div>
                  <ChevronRight size={18} color="var(--muted)" style={{ flexShrink: 0 }} />
                </button>
                <button onClick={() => deleteWorkout(w.id)} disabled={deleting === w.id} aria-label="Smazat trénink" style={{ minWidth: 44, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0, background: 'transparent', border: 'none', color: '#E8192C', cursor: 'pointer', opacity: deleting === w.id ? 0.5 : 1, touchAction: 'manipulation' }}>
                  <Trash2 size={18} />
                </button>
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}
