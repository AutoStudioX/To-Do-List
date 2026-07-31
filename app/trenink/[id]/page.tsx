'use client'
import { useCallback, useEffect, useMemo, useState } from 'react'
import { useParams, useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import type { Workout, WorkoutSet, Exercise } from '@/lib/types'
import Modal from '@/components/Modal'
import NumberStepper from '@/components/gym/NumberStepper'
import ExercisePicker from '@/components/gym/ExercisePicker'
import ExerciseChart from '@/components/gym/ExerciseChart'
import { WEIGHT_STEP, REP_STEP, formatPrevious, fmtWeight, splitColor } from '@/lib/gym'
import { ChevronLeft, Plus, Check, Trash2, ArrowUp, ArrowDown, BarChart3, Flame, Timer, X } from 'lucide-react'

type ActiveSet = { key: string; id: string | null; weight: number; reps: number; is_warmup: boolean; confirmed: boolean; prefilled: boolean }
type ActiveExercise = { exercise: Exercise; previous: { weight_kg: number | null; reps: number | null }[]; sets: ActiveSet[] }

let keySeq = 0
const newKey = () => `s${++keySeq}`

const REST_DEFAULT = 90 // seconds; the rest timer NEVER auto-starts — user taps "Pauza".
const mmss = (s: number) => `${Math.floor(s / 60)}:${String(Math.max(0, s % 60)).padStart(2, '0')}`

// Comparison badge for a confirmed working set vs the same-index previous set.
function setBadge(weight: number, reps: number, prev: { weight_kg: number | null; reps: number | null }[], workingIdx: number): { text: string; kind: 'pr' | 'up' | 'same' } | null {
  const curVol = weight * reps
  const bestPrevVol = prev.reduce((m, p) => Math.max(m, (Number(p.weight_kg) || 0) * (p.reps || 0)), 0)
  if (bestPrevVol > 0 && curVol > bestPrevVol) return { text: 'PR objem', kind: 'pr' }
  const p = prev[workingIdx]
  if (!p) return null
  const pw = Number(p.weight_kg) || 0, pr = p.reps || 0
  if (weight === pw && reps === pr) return { text: '= minule', kind: 'same' }
  if (weight === pw && reps > pr) return { text: `+${reps - pr} rep`, kind: 'up' }
  if (weight > pw) return { text: `+${fmtWeight(weight - pw)} kg`, kind: 'up' }
  return null
}

export default function ActiveWorkoutPage() {
  const router = useRouter()
  const { id } = useParams<{ id: string }>()
  const [workout, setWorkout] = useState<Workout | null>(null)
  const [catalog, setCatalog] = useState<Exercise[]>([])
  const [items, setItems] = useState<ActiveExercise[]>([])
  const [loading, setLoading] = useState(true)
  const [editing, setEditing] = useState<{ ex: number; set: number } | null>(null)
  const [pickerOpen, setPickerOpen] = useState(false)
  const [chartExercise, setChartExercise] = useState<Exercise | null>(null)
  const [nowMs, setNowMs] = useState(() => Date.now())
  const [rest, setRest] = useState<number | null>(null) // remaining seconds, null = off

  const load = useCallback(async () => {
    const supabase = createClient()
    const { data: { session } } = await supabase.auth.getSession()
    const user = session?.user
    if (!user) return

    const { data: w } = await supabase.from('workouts').select('*').eq('id', id).eq('user_id', user.id).single()
    if (!w) { setLoading(false); return }
    setWorkout(w as Workout)

    const { data: cat } = await supabase.from('exercises').select('*').or(`user_id.is.null,user_id.eq.${user.id}`).order('name')
    const catalog = (cat || []) as Exercise[]
    setCatalog(catalog)
    const exMap = new Map(catalog.map(e => [e.id, e]))

    // Confirmed sets of THIS workout.
    const { data: mine } = await supabase.from('workout_sets').select('*').eq('workout_id', id).order('order_index').order('created_at')
    const confirmed = (mine || []) as WorkoutSet[]

    // Template = the most recent OTHER workout of the same split.
    let template: WorkoutSet[] = []
    if (w.split_type) {
      const { data: prevW } = await supabase.from('workouts').select('id').eq('user_id', user.id).eq('split_type', w.split_type).neq('id', id).order('date', { ascending: false }).order('created_at', { ascending: false }).limit(1)
      const prevId = (prevW || [])[0]?.id
      if (prevId) {
        const { data: prevSets } = await supabase.from('workout_sets').select('*').eq('workout_id', prevId).order('order_index').order('created_at')
        template = (prevSets || []) as WorkoutSet[]
      }
    }

    const groupBy = (arr: WorkoutSet[]) => {
      const m = new Map<string, WorkoutSet[]>()
      for (const s of arr) { const g = m.get(s.exercise_id) || []; g.push(s); m.set(s.exercise_id, g) }
      return m
    }
    const confG = groupBy(confirmed)
    const tmplG = groupBy(template)
    const order: string[] = []
    for (const s of template) if (!order.includes(s.exercise_id)) order.push(s.exercise_id)
    for (const s of confirmed) if (!order.includes(s.exercise_id)) order.push(s.exercise_id)

    const built: ActiveExercise[] = []
    for (const exId of order) {
      const ex = exMap.get(exId)
      if (!ex) continue
      const conf = confG.get(exId) || []
      const tmpl = tmplG.get(exId) || []
      const sets: ActiveSet[] = conf.map(s => ({ key: newKey(), id: s.id, weight: Number(s.weight_kg ?? 0), reps: s.reps ?? 0, is_warmup: s.is_warmup, confirmed: true, prefilled: false }))
      for (let i = conf.length; i < tmpl.length; i++) {
        const t = tmpl[i]
        sets.push({ key: newKey(), id: null, weight: Number(t.weight_kg ?? 0), reps: t.reps ?? 0, is_warmup: t.is_warmup, confirmed: false, prefilled: true })
      }
      if (sets.length === 0) sets.push({ key: newKey(), id: null, weight: 20, reps: 8, is_warmup: false, confirmed: false, prefilled: false })
      built.push({ exercise: ex, previous: tmpl.filter(t => !t.is_warmup).map(t => ({ weight_kg: t.weight_kg, reps: t.reps })), sets })
    }
    setItems(built)
    setLoading(false)
  }, [id])

  useEffect(() => { load() }, [load])

  // Live clocks: elapsed workout time + rest countdown. Rest only runs once started.
  useEffect(() => {
    const t = setInterval(() => {
      setNowMs(Date.now())
      setRest(r => (r == null ? r : Math.max(0, r - 1)))
    }, 1000)
    return () => clearInterval(t)
  }, [])

  const supabase = useMemo(() => createClient(), [])

  const patchSet = (ex: number, set: number, patch: Partial<ActiveSet>) =>
    setItems(prev => prev.map((it, i) => i !== ex ? it : { ...it, sets: it.sets.map((s, j) => j !== set ? s : { ...s, ...patch }) }))

  async function confirmSet(ex: number, set: number) {
    const it = items[ex]; const s = it.sets[set]
    const payload = { workout_id: id, exercise_id: it.exercise.id, order_index: ex, weight_kg: s.weight, reps: s.reps, is_warmup: s.is_warmup }
    if (s.confirmed && s.id) {
      await supabase.from('workout_sets').update(payload).eq('id', s.id)
      patchSet(ex, set, { prefilled: false })
    } else {
      const { data } = await supabase.from('workout_sets').insert(payload).select().single()
      patchSet(ex, set, { confirmed: true, prefilled: false, id: data?.id ?? null })
    }
    setEditing(null)
  }

  async function deleteSet(ex: number, set: number) {
    const s = items[ex].sets[set]
    if (s.confirmed && s.id) await supabase.from('workout_sets').delete().eq('id', s.id)
    setItems(prev => prev.map((it, i) => i !== ex ? it : { ...it, sets: it.sets.filter((_, j) => j !== set) }))
    setEditing(null)
  }

  function addSet(ex: number) {
    setItems(prev => prev.map((it, i) => {
      if (i !== ex) return it
      const last = it.sets[it.sets.length - 1]
      return { ...it, sets: [...it.sets, { key: newKey(), id: null, weight: last?.weight ?? 20, reps: last?.reps ?? 8, is_warmup: false, confirmed: false, prefilled: false }] }
    }))
  }

  async function toggleWarmup(ex: number, set: number) {
    const s = items[ex].sets[set]
    const nv = !s.is_warmup
    patchSet(ex, set, { is_warmup: nv })
    if (s.confirmed && s.id) await supabase.from('workout_sets').update({ is_warmup: nv }).eq('id', s.id)
  }

  async function addExercise(ex: Exercise) {
    setPickerOpen(false)
    if (items.some(it => it.exercise.id === ex.id)) return
    // Prefill from this exercise's most recent previous set, if any.
    const { data: { session } } = await supabase.auth.getSession()
    let previous: { weight_kg: number | null; reps: number | null }[] = []
    let seed = { weight: 20, reps: 8 }
    if (session?.user) {
      const { data: prev } = await supabase
        .from('workout_sets')
        .select('weight_kg, reps, is_warmup, workout_id, workouts!inner(user_id, date)')
        .eq('exercise_id', ex.id)
        .neq('workout_id', id)
        .order('created_at', { ascending: false })
        .limit(12)
      const rows = (prev || []) as { weight_kg: number | null; reps: number | null; is_warmup: boolean; workout_id: string }[]
      const working = rows.filter(r => !r.is_warmup)
      if (working.length) { seed = { weight: Number(working[0].weight_kg ?? 20), reps: working[0].reps ?? 8 }; previous = working.slice(0, 4).map(r => ({ weight_kg: r.weight_kg, reps: r.reps })) }
    }
    setItems(prev => [...prev, { exercise: ex, previous, sets: [{ key: newKey(), id: null, weight: seed.weight, reps: seed.reps, is_warmup: false, confirmed: false, prefilled: !!previous.length }] }])
  }

  async function addCustomExercise(name: string) {
    const { data: { session } } = await supabase.auth.getSession()
    if (!session?.user) return
    const { data } = await supabase.from('exercises').insert({ user_id: session.user.id, name, is_custom: true }).select().single()
    if (data) { setCatalog(c => [...c, data as Exercise]); addExercise(data as Exercise) }
  }

  async function removeExercise(ex: number) {
    const it = items[ex]
    const ids = it.sets.filter(s => s.confirmed && s.id).map(s => s.id as string)
    if (ids.length) await supabase.from('workout_sets').delete().in('id', ids)
    setItems(prev => prev.filter((_, i) => i !== ex))
  }

  async function moveExercise(ex: number, dir: -1 | 1) {
    const to = ex + dir
    if (to < 0 || to >= items.length) return
    setItems(prev => { const a = [...prev]; const [m] = a.splice(ex, 1); a.splice(to, 0, m); return a })
    // best-effort persist order for confirmed sets
    const arr = [...items]; const [m] = arr.splice(ex, 1); arr.splice(to, 0, m)
    for (let i = 0; i < arr.length; i++) {
      const ids = arr[i].sets.filter(s => s.confirmed && s.id).map(s => s.id as string)
      if (ids.length) await supabase.from('workout_sets').update({ order_index: i }).in('id', ids)
    }
  }

  async function finish() {
    if (workout?.created_at) {
      const mins = Math.max(1, Math.round((Date.now() - new Date(workout.created_at).getTime()) / 60000))
      await supabase.from('workouts').update({ duration_min: mins }).eq('id', id)
    }
    router.push('/trenink')
  }

  // Derived counters for the header.
  const { doneSets, totalSets } = useMemo(() => {
    let done = 0, total = 0
    for (const it of items) for (const s of it.sets) {
      if (s.is_warmup) continue
      total++
      if (s.confirmed) done++
    }
    return { doneSets: done, totalSets: total }
  }, [items])

  const elapsedMin = workout?.created_at ? Math.floor((nowMs - new Date(workout.created_at).getTime()) / 60000) : 0
  const elapsedSec = workout?.created_at ? Math.floor((nowMs - new Date(workout.created_at).getTime()) / 1000) % 60 : 0

  if (loading) return <div style={{ color: 'var(--muted)', padding: 24 }}>Načítání…</div>
  if (!workout) return <div style={{ color: 'var(--muted)', padding: 24 }}>Trénink nenalezen.</div>

  return (
    <div style={{ maxWidth: 720, margin: '0 auto', paddingBottom: rest != null ? 120 : 96 }}>
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 16 }}>
        <button onClick={() => router.push('/trenink')} aria-label="Zpět" style={{ minWidth: 44, minHeight: 44, display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'var(--card)', border: '1px solid var(--border)', borderRadius: 12, color: 'var(--text)', cursor: 'pointer' }}><ChevronLeft size={22} /></button>
        {workout.split_type && <span style={{ fontSize: 13, fontWeight: 800, letterSpacing: 0.4, color: '#fff', background: splitColor(workout.split_type), borderRadius: 8, padding: '5px 12px', textTransform: 'uppercase' }}>{workout.split_type}</span>}
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontSize: 15, fontWeight: 700, color: 'var(--text)' }}>Dnes</div>
          <div style={{ fontSize: 12, color: 'var(--muted)' }}>{mmss(elapsedMin * 60 + elapsedSec)} · {doneSets} z {totalSets} sérií</div>
        </div>
        <button onClick={finish} style={{ minHeight: 44, padding: '0 16px', background: '#10b981', border: 'none', borderRadius: 12, color: '#fff', fontSize: 14, fontWeight: 700, cursor: 'pointer' }}>Hotovo</button>
      </div>

      {items.length > 0 && (
        <div style={{ fontSize: 11, letterSpacing: 0.6, color: 'var(--muted)', fontWeight: 700, margin: '0 0 10px' }}>CVIKY · {items.length}</div>
      )}

      <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
        {items.map((it, exIdx) => {
          let workingIdx = -1
          return (
            <div key={it.exercise.id} style={{ background: 'var(--card)', border: '1px solid var(--border)', borderRadius: 16, padding: 14, boxShadow: 'var(--shadow)' }}>
              <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 8, marginBottom: 10 }}>
                <button onClick={() => setChartExercise(it.exercise)} style={{ background: 'transparent', border: 'none', padding: 0, textAlign: 'left', cursor: 'pointer', minWidth: 0, flex: 1, display: 'flex', gap: 10, alignItems: 'center' }}>
                  <span style={{ width: 26, height: 26, borderRadius: 8, background: '#E8192C', color: '#fff', fontSize: 13, fontWeight: 800, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>{exIdx + 1}</span>
                  <span style={{ minWidth: 0 }}>
                    <span style={{ fontSize: 16, fontWeight: 700, color: 'var(--text)', display: 'flex', alignItems: 'center', gap: 6 }}>{it.exercise.name} <BarChart3 size={14} color="var(--muted)" /></span>
                    {it.previous.length > 0 && <span style={{ fontSize: 12, color: 'var(--muted)', display: 'block', marginTop: 2 }}>minule: {formatPrevious(it.previous)}</span>}
                  </span>
                </button>
                <div style={{ display: 'flex', gap: 8, flexShrink: 0 }}>
                  <button onClick={() => moveExercise(exIdx, -1)} aria-label="Nahoru" style={iconBtn}><ArrowUp size={16} /></button>
                  <button onClick={() => moveExercise(exIdx, 1)} aria-label="Dolů" style={iconBtn}><ArrowDown size={16} /></button>
                  <button onClick={() => removeExercise(exIdx)} aria-label="Odebrat cvik" style={{ ...iconBtn, background: 'rgba(232,25,44,0.12)', color: '#E8192C', borderColor: 'rgba(232,25,44,0.4)' }}><Trash2 size={16} /></button>
                </div>
              </div>

              <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                {it.sets.map((s, setIdx) => {
                  const isEditing = editing && editing.ex === exIdx && editing.set === setIdx
                  const grey = !s.confirmed && s.prefilled
                  if (!s.is_warmup) workingIdx++
                  const badge = s.confirmed && !s.is_warmup ? setBadge(s.weight, s.reps, it.previous, workingIdx) : null
                  const badgeColor = badge?.kind === 'pr' ? '#E8192C' : badge?.kind === 'up' ? '#10b981' : 'var(--muted)'
                  return (
                    <div key={s.key} style={{ border: `1px solid ${s.confirmed ? '#10b981' : 'var(--border)'}`, borderRadius: 12, background: s.confirmed ? 'rgba(16,185,129,0.06)' : 'transparent' }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: 8 }}>
                        <button onClick={() => toggleWarmup(exIdx, setIdx)} aria-label="Rozehřívací série" title="Warm-up (nepočítá se)" style={{ minWidth: 44, minHeight: 44, display: 'flex', alignItems: 'center', justifyContent: 'center', borderRadius: 10, border: '1px solid var(--border)', background: s.is_warmup ? '#fef3c7' : 'var(--input-bg)', color: s.is_warmup ? '#d97706' : 'var(--muted)', cursor: 'pointer', touchAction: 'manipulation' }}><Flame size={16} /></button>
                        <button onClick={() => setEditing(isEditing ? null : { ex: exIdx, set: setIdx })} style={{ flex: 1, minHeight: 44, background: 'transparent', border: 'none', cursor: 'pointer', textAlign: 'left', color: grey ? 'var(--muted)' : 'var(--text)', fontSize: 18, fontWeight: 700, touchAction: 'manipulation', display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                          <span>{fmtWeight(s.weight)} kg <span style={{ color: 'var(--muted)', fontWeight: 500 }}>×</span> {s.reps}</span>
                          {s.is_warmup && <span style={{ fontSize: 11, color: '#d97706', fontWeight: 700 }}>W</span>}
                          {badge && <span style={{ fontSize: 11, color: badgeColor, fontWeight: 700 }}>{badge.text}</span>}
                        </button>
                        <button onClick={() => confirmSet(exIdx, setIdx)} aria-label="Potvrdit sérii" style={{ minWidth: 44, minHeight: 44, display: 'flex', alignItems: 'center', justifyContent: 'center', borderRadius: 10, border: 'none', background: s.confirmed ? '#10b981' : '#E8192C', color: '#fff', cursor: 'pointer', touchAction: 'manipulation' }}><Check size={20} /></button>
                      </div>
                      {isEditing && (
                        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 16, alignItems: 'flex-end', padding: '0 8px 10px' }}>
                          <NumberStepper label="Váha (kg)" value={s.weight} step={WEIGHT_STEP} allowDecimal onChange={v => patchSet(exIdx, setIdx, { weight: v })} />
                          <NumberStepper label="Opakování" value={s.reps} step={REP_STEP} min={0} onChange={v => patchSet(exIdx, setIdx, { reps: v })} />
                          <button onClick={() => deleteSet(exIdx, setIdx)} style={{ minHeight: 44, padding: '0 14px', background: 'transparent', border: '1px solid rgba(232,25,44,0.4)', borderRadius: 10, color: '#E8192C', fontSize: 14, cursor: 'pointer' }}>Smazat sérii</button>
                        </div>
                      )}
                    </div>
                  )
                })}
              </div>

              <div style={{ display: 'flex', gap: 8, marginTop: 10 }}>
                <button onClick={() => addSet(exIdx)} style={{ flex: 1, minHeight: 44, background: 'transparent', border: '1px dashed var(--border)', borderRadius: 10, color: 'var(--muted)', fontSize: 14, fontWeight: 600, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6, touchAction: 'manipulation' }}><Plus size={16} /> Série</button>
                <button onClick={() => setRest(REST_DEFAULT)} style={{ minHeight: 44, padding: '0 16px', background: 'transparent', border: '1px solid var(--border)', borderRadius: 10, color: 'var(--text)', fontSize: 14, fontWeight: 600, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 6, touchAction: 'manipulation' }}><Timer size={16} /> Pauza</button>
              </div>
            </div>
          )
        })}
      </div>

      {items.length === 0 && (
        <div style={{ background: 'var(--card)', border: '1px solid var(--border)', borderRadius: 16, padding: 24, textAlign: 'center', boxShadow: 'var(--shadow)' }}>
          <div style={{ fontSize: 15, fontWeight: 700, color: 'var(--text)', marginBottom: 6 }}>Zatím žádný cvik</div>
          <div style={{ fontSize: 13, color: 'var(--muted)' }}>Přidej cvik — u známých se předvyplní váhy z posledního tréninku téhož splitu.</div>
        </div>
      )}

      <button onClick={() => setPickerOpen(true)} style={{ marginTop: 14, width: '100%', minHeight: 52, background: 'transparent', border: '1px dashed var(--border)', borderRadius: 14, color: 'var(--text)', fontSize: 15, fontWeight: 600, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8, touchAction: 'manipulation' }}><Plus size={18} /> Přidat cvik</button>

      {/* Rest timer — appears only after the user taps "Pauza" (never auto-starts) */}
      {rest != null && (
        <div style={{ position: 'fixed', left: 0, right: 0, bottom: 'calc(var(--bottom-nav-h, 64px))', zIndex: 90, display: 'flex', justifyContent: 'center', padding: '0 12px', pointerEvents: 'none' }}>
          <div style={{ pointerEvents: 'auto', width: '100%', maxWidth: 696, display: 'flex', alignItems: 'center', gap: 10, background: 'var(--card)', border: `1px solid ${rest === 0 ? '#10b981' : 'var(--border)'}`, borderRadius: 14, padding: '10px 12px', boxShadow: '0 6px 24px rgba(0,0,0,0.35)' }}>
            <Timer size={18} color={rest === 0 ? '#10b981' : '#E8192C'} />
            <span style={{ fontSize: 12, color: 'var(--muted)', fontWeight: 600 }}>PAUZA</span>
            <span style={{ fontSize: 22, fontWeight: 800, color: rest === 0 ? '#10b981' : 'var(--text)', minWidth: 62 }}>{rest === 0 ? 'Hotovo' : mmss(rest)}</span>
            <div style={{ flex: 1 }} />
            <button onClick={() => setRest(r => (r == null ? 30 : r + 30))} style={{ minHeight: 40, padding: '0 12px', background: 'var(--input-bg)', border: '1px solid var(--border)', borderRadius: 10, color: 'var(--text)', fontSize: 13, fontWeight: 600, cursor: 'pointer' }}>+30 s</button>
            <button onClick={() => setRest(null)} aria-label="Přeskočit pauzu" style={{ minWidth: 40, minHeight: 40, display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'transparent', border: '1px solid var(--border)', borderRadius: 10, color: 'var(--muted)', cursor: 'pointer' }}><X size={16} /></button>
          </div>
        </div>
      )}

      <Modal isOpen={pickerOpen} onClose={() => setPickerOpen(false)} title="Přidat cvik">
        <ExercisePicker exercises={catalog} onPick={addExercise} onAddCustom={addCustomExercise} />
      </Modal>
      <Modal isOpen={!!chartExercise} onClose={() => setChartExercise(null)} title={chartExercise?.name || 'Cvik'}>
        {chartExercise && <ExerciseChart exerciseId={chartExercise.id} exerciseName={chartExercise.name} muscleGroup={chartExercise.muscle_group} />}
      </Modal>
    </div>
  )
}

const iconBtn: React.CSSProperties = { minWidth: 44, minHeight: 44, display: 'flex', alignItems: 'center', justifyContent: 'center', borderRadius: 10, border: '1px solid var(--border)', background: 'var(--input-bg)', color: 'var(--text)', cursor: 'pointer', touchAction: 'manipulation' }
