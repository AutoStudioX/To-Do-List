'use client'
import { useCallback, useEffect, useMemo, useState } from 'react'
import { useParams, useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import type { Workout, WorkoutSet, Exercise } from '@/lib/types'
import Modal from '@/components/Modal'
import ExercisePicker from '@/components/gym/ExercisePicker'
import { useConfirm } from '@/components/ConfirmDialog'
import { Toast, useToast } from '@/components/Toast'
import ExerciseSparkline from '@/components/gym/ExerciseSparkline'
import { WEIGHT_STEP, REP_STEP, formatPrevious, fmtWeight, splitColor, epley1RM, fmtTonnage } from '@/lib/gym'
import { ChevronLeft, Plus, Check, Trash2, ArrowUp, ArrowDown, BarChart3, Flame, Timer, Minus, RotateCcw, Dumbbell } from 'lucide-react'

type ActiveSet = { key: string; id: string | null; weight: number; reps: number; is_warmup: boolean; confirmed: boolean; prefilled: boolean }
type ActiveExercise = { exercise: Exercise; previous: { weight_kg: number | null; reps: number | null }[]; sets: ActiveSet[] }
type Template = { date: string | null; groups: { exercise: Exercise; sets: WorkoutSet[] }[] }

let keySeq = 0
const newKey = () => `s${++keySeq}`

const REST_DEFAULT = 90 // seconds; the rest timer NEVER auto-starts — user taps "Pauza".
const MOBILE_PANEL_SPACE = 380 // room reserved under the content for the pinned stepper panel
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

const shortDate = (iso: string | null) => iso ? new Date(iso).toLocaleDateString('cs-CZ', { day: 'numeric', month: 'numeric' }) : ''

// Where the running clock counts from. started_at is the resumable origin;
// rows created before migration 0007 fall back to created_at.
const clockOrigin = (w: { started_at?: string | null; created_at?: string } | null | undefined) =>
  new Date(w?.started_at || w?.created_at || Date.now()).getTime()

export default function ActiveWorkoutPage() {
  const router = useRouter()
  const { id } = useParams<{ id: string }>()
  const [workout, setWorkout] = useState<Workout | null>(null)
  const [catalog, setCatalog] = useState<Exercise[]>([])
  const [items, setItems] = useState<ActiveExercise[]>([])
  const [tmpl, setTmpl] = useState<Template>({ date: null, groups: [] })
  const [loading, setLoading] = useState(true)
  const [activeIdx, setActiveIdx] = useState(0)
  const [selectedKey, setSelectedKey] = useState<string | null>(null)
  const [pickerOpen, setPickerOpen] = useState(false)
  const [nowMs, setNowMs] = useState(() => Date.now())
  const [rest, setRest] = useState<number | null>(null) // remaining seconds, null = off
  const [isMobile, setIsMobile] = useState(false)
  const { confirm, dialog: confirmDialog } = useConfirm()
  const { toast, showToast, hideToast } = useToast()

  useEffect(() => {
    const check = () => setIsMobile(window.innerWidth <= 768)
    check()
    window.addEventListener('resize', check)
    return () => window.removeEventListener('resize', check)
  }, [])

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
    let templateDate: string | null = null
    if (w.split_type) {
      const { data: prevW } = await supabase.from('workouts').select('id, date').eq('user_id', user.id).eq('split_type', w.split_type).neq('id', id).order('date', { ascending: false }).order('created_at', { ascending: false }).limit(1)
      const prev = (prevW || [])[0]
      if (prev?.id) {
        templateDate = prev.date ?? null
        const { data: prevSets } = await supabase.from('workout_sets').select('*').eq('workout_id', prev.id).order('order_index').order('created_at')
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

    // Keep the template around so the empty state can offer "Načíst minulý trénink".
    const tmplOrder: string[] = []
    for (const s of template) if (!tmplOrder.includes(s.exercise_id)) tmplOrder.push(s.exercise_id)
    setTmpl({
      date: templateDate,
      groups: tmplOrder.map(exId => ({ exercise: exMap.get(exId)!, sets: tmplG.get(exId) || [] })).filter(g => g.exercise),
    })

    const built: ActiveExercise[] = []
    for (const exId of order) {
      const ex = exMap.get(exId)
      if (!ex) continue
      const conf = confG.get(exId) || []
      const tmp = tmplG.get(exId) || []
      const sets: ActiveSet[] = conf.map(s => ({ key: newKey(), id: s.id, weight: Number(s.weight_kg ?? 0), reps: s.reps ?? 0, is_warmup: s.is_warmup, confirmed: true, prefilled: false }))
      for (let i = conf.length; i < tmp.length; i++) {
        const t = tmp[i]
        sets.push({ key: newKey(), id: null, weight: Number(t.weight_kg ?? 0), reps: t.reps ?? 0, is_warmup: t.is_warmup, confirmed: false, prefilled: true })
      }
      if (sets.length === 0) sets.push({ key: newKey(), id: null, weight: 20, reps: 8, is_warmup: false, confirmed: false, prefilled: false })
      built.push({ exercise: ex, previous: tmp.filter(t => !t.is_warmup).map(t => ({ weight_kg: t.weight_kg, reps: t.reps })), sets })
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

  // The stepper panel always edits a real set: keep one unconfirmed set at the
  // end of the active exercise. Bails out when one already exists.
  useEffect(() => {
    // A finished workout is read-only — don't conjure a pending set into it.
    if (workout?.duration_min != null) return
    setItems(prev => {
      const ex = prev[activeIdx]
      if (!ex || ex.sets.some(s => !s.confirmed)) return prev
      const last = ex.sets[ex.sets.length - 1]
      const next = [...prev]
      next[activeIdx] = { ...ex, sets: [...ex.sets, { key: newKey(), id: null, weight: last?.weight ?? 20, reps: last?.reps ?? 8, is_warmup: false, confirmed: false, prefilled: false }] }
      return next
    })
  }, [activeIdx, items, workout?.duration_min])

  const supabase = useMemo(() => createClient(), [])

  const patchSet = (ex: number, set: number, patch: Partial<ActiveSet>) =>
    setItems(prev => prev.map((it, i) => i !== ex ? it : { ...it, sets: it.sets.map((s, j) => j !== set ? s : { ...s, ...patch }) }))

  async function confirmSet(ex: number, set: number) {
    const it = items[ex]; const s = it?.sets[set]
    if (!it || !s) return
    const payload = { workout_id: id, exercise_id: it.exercise.id, order_index: ex, weight_kg: s.weight, reps: s.reps, is_warmup: s.is_warmup }
    if (s.confirmed && s.id) {
      await supabase.from('workout_sets').update(payload).eq('id', s.id)
      patchSet(ex, set, { prefilled: false })
    } else {
      const { data } = await supabase.from('workout_sets').insert(payload).select().single()
      patchSet(ex, set, { confirmed: true, prefilled: false, id: data?.id ?? null })
    }
    setSelectedKey(null)
  }

  async function deleteSet(ex: number, set: number) {
    const s = items[ex]?.sets[set]
    if (!s) return
    if (s.confirmed && s.id) {
      if (!await confirm(`Smazat sérii ${fmtWeight(s.weight)} kg × ${s.reps}? Nejde to vrátit.`)) return
      const { error } = await supabase.from('workout_sets').delete().eq('id', s.id)
      if (error) { showToast(`Smazání selhalo: ${error.message}`, 'error'); return }
      showToast('Série smazána')
    }
    setItems(prev => prev.map((it, i) => i !== ex ? it : { ...it, sets: it.sets.filter((_, j) => j !== set) }))
    setSelectedKey(null)
  }

  function addSet(ex: number) {
    setItems(prev => prev.map((it, i) => {
      if (i !== ex) return it
      const last = it.sets[it.sets.length - 1]
      return { ...it, sets: [...it.sets, { key: newKey(), id: null, weight: last?.weight ?? 20, reps: last?.reps ?? 8, is_warmup: false, confirmed: false, prefilled: false }] }
    }))
  }

  async function toggleWarmup(ex: number, set: number) {
    const s = items[ex]?.sets[set]
    if (!s) return
    const nv = !s.is_warmup
    patchSet(ex, set, { is_warmup: nv })
    if (s.confirmed && s.id) await supabase.from('workout_sets').update({ is_warmup: nv }).eq('id', s.id)
  }

  async function addExercise(ex: Exercise) {
    setPickerOpen(false)
    const existing = items.findIndex(it => it.exercise.id === ex.id)
    if (existing >= 0) { setActiveIdx(existing); return }
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
    setItems(prev => {
      const next = [...prev, { exercise: ex, previous, sets: [{ key: newKey(), id: null, weight: seed.weight, reps: seed.reps, is_warmup: false, confirmed: false, prefilled: !!previous.length }] }]
      setActiveIdx(next.length - 1)
      return next
    })
  }

  async function addCustomExercise(name: string) {
    const { data: { session } } = await supabase.auth.getSession()
    if (!session?.user) return
    const { data } = await supabase.from('exercises').insert({ user_id: session.user.id, name, is_custom: true }).select().single()
    if (data) { setCatalog(c => [...c, data as Exercise]); addExercise(data as Exercise) }
  }

  // Rebuild the exercise list from the previous same-split workout (empty state).
  function loadTemplate() {
    if (!tmpl.groups.length) return
    setItems(tmpl.groups.map(g => ({
      exercise: g.exercise,
      previous: g.sets.filter(s => !s.is_warmup).map(s => ({ weight_kg: s.weight_kg, reps: s.reps })),
      sets: g.sets.map(s => ({ key: newKey(), id: null, weight: Number(s.weight_kg ?? 0), reps: s.reps ?? 0, is_warmup: s.is_warmup, confirmed: false, prefilled: true })),
    })))
    setActiveIdx(0)
  }

  async function removeExercise(ex: number) {
    const it = items[ex]
    if (!it) return
    const ids = it.sets.filter(s => s.confirmed && s.id).map(s => s.id as string)
    const note = ids.length ? ` i s ${ids.length} zapsanými sériemi` : ''
    if (!await confirm(`Odebrat cvik „${it.exercise.name}"${note}? Nejde to vrátit.`, 'Odebrat')) return
    if (ids.length) {
      const { error } = await supabase.from('workout_sets').delete().in('id', ids)
      if (error) { showToast(`Odebrání selhalo: ${error.message}`, 'error'); return }
    }
    setItems(prev => prev.filter((_, i) => i !== ex))
    setActiveIdx(i => Math.max(0, i > ex ? i - 1 : i === ex ? Math.min(i, items.length - 2) : i))
    showToast('Cvik odebrán')
  }

  async function moveExercise(ex: number, dir: -1 | 1) {
    const to = ex + dir
    if (to < 0 || to >= items.length) return
    setItems(prev => { const a = [...prev]; const [m] = a.splice(ex, 1); a.splice(to, 0, m); return a })
    setActiveIdx(i => (i === ex ? to : i === to ? ex : i))
    // best-effort persist order for confirmed sets
    const arr = [...items]; const [m] = arr.splice(ex, 1); arr.splice(to, 0, m)
    for (let i = 0; i < arr.length; i++) {
      const ids = arr[i].sets.filter(s => s.confirmed && s.id).map(s => s.id as string)
      if (ids.length) await supabase.from('workout_sets').update({ order_index: i }).in('id', ids)
    }
  }

  // duration_min NULL = running, set = finished (see migration 0007).
  async function finish() {
    const origin = clockOrigin(workout)
    const mins = Math.max(1, Math.round((Date.now() - origin) / 60000))
    const { error } = await supabase.from('workouts').update({ duration_min: mins }).eq('id', id)
    if (error) { showToast(`Uložení selhalo: ${error.message}`, 'error'); return }
    setWorkout(w => w ? { ...w, duration_min: mins } : w)
    router.push('/trenink')
  }

  // Resume: move the clock origin back by the saved length so the timer
  // continues instead of restarting, and clear the finished flag.
  async function resume() {
    if (!workout) return
    const newStart = new Date(Date.now() - (workout.duration_min || 0) * 60000).toISOString()
    const { error } = await supabase.from('workouts').update({ duration_min: null, started_at: newStart }).eq('id', id)
    if (error) { showToast(`Nepodařilo se pokračovat: ${error.message}`, 'error'); return }
    setWorkout(w => w ? { ...w, duration_min: null, started_at: newStart } : w)
    setNowMs(Date.now())
    showToast('Trénink pokračuje')
  }

  // ---------- derived ----------
  const active = items[activeIdx]
  const panelIdx = useMemo(() => {
    if (!active) return -1
    const sel = selectedKey ? active.sets.findIndex(s => s.key === selectedKey) : -1
    return sel >= 0 ? sel : active.sets.findIndex(s => !s.confirmed)
  }, [active, selectedKey])
  const panelSet = panelIdx >= 0 ? active?.sets[panelIdx] : undefined
  const panelSetNo = useMemo(() => {
    if (!active || panelIdx < 0) return 1
    return active.sets.slice(0, panelIdx + 1).filter(s => !s.is_warmup).length || 1
  }, [active, panelIdx])
  const panelPrev = active?.previous[Math.max(0, panelSetNo - 1)]

  const { doneSets, totalSets } = useMemo(() => {
    let done = 0, total = 0
    for (const it of items) for (const s of it.sets) {
      if (s.is_warmup) continue
      total++
      if (s.confirmed) done++
    }
    return { doneSets: done, totalSets: total }
  }, [items])

  const exStats = useMemo(() => {
    if (!active) return null
    const todaySets = active.sets.filter(s => s.confirmed && !s.is_warmup)
    const todayVol = todaySets.reduce((sum, s) => sum + s.weight * s.reps, 0)
    const prevVol = active.previous.reduce((sum, p) => sum + (Number(p.weight_kg) || 0) * (p.reps || 0), 0)
    const oneRM = epley1RM(todaySets.map(s => ({ weight_kg: s.weight, reps: s.reps, is_warmup: false })))
    const delta = prevVol > 0 && todayVol > 0 ? Math.round(((todayVol - prevVol) / prevVol) * 1000) / 10 : null
    return { todayVol, oneRM, delta }
  }, [active])

  // Finished workouts show their saved length; the clock only runs while active.
  const finished = workout?.duration_min != null
  const elapsedSec = finished
    ? (workout!.duration_min as number) * 60
    : workout ? Math.max(0, Math.floor((nowMs - clockOrigin(workout)) / 1000)) : 0
  const doneOnActive = active ? active.sets.filter(s => s.confirmed && !s.is_warmup).length : 0

  // Enter confirms the panel set (design: "nebo klávesa Enter").
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'Enter' || e.repeat) return
      const t = e.target as HTMLElement | null
      if (t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.isContentEditable)) return
      if (pickerOpen) return
      if (panelIdx >= 0) { e.preventDefault(); confirmSet(activeIdx, panelIdx) }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeIdx, panelIdx, items, pickerOpen])

  if (loading) return <div style={{ color: 'var(--muted)', padding: 24 }}>Načítání…</div>
  if (!workout) return <div style={{ color: 'var(--muted)', padding: 24 }}>Trénink nenalezen.</div>

  const split = workout.split_type
  const accent = splitColor(split)

  // ---------- blocks ----------
  const header = (
    <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 14 }}>
      <button onClick={() => router.push('/trenink')} aria-label="Zpět" style={{ minWidth: 44, minHeight: 44, display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'var(--card)', border: '1px solid var(--border)', borderRadius: 12, color: 'var(--text)', cursor: 'pointer', flexShrink: 0 }}><ChevronLeft size={22} /></button>
      {split && <span style={{ fontSize: 12, fontWeight: 800, letterSpacing: 0.4, color: '#fff', background: accent, borderRadius: 8, padding: '5px 10px', textTransform: 'uppercase', flexShrink: 0 }}>{split}</span>}
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontSize: 15, fontWeight: 700, color: 'var(--text)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
          {isMobile && active ? active.exercise.name : 'Dnes'}
        </div>
        <div style={{ fontSize: 12, color: 'var(--muted)' }}>
          {isMobile && active
            // Finished workouts lead with the saved length so it's visible on mobile too.
            ? `${finished ? `${mmss(elapsedSec)} · ` : ''}cvik ${activeIdx + 1}/${items.length} · ${doneOnActive} ${doneOnActive === 1 ? 'série hotová' : 'série hotové'}`
            : `${mmss(elapsedSec)} · ${doneSets} z ${totalSets} sérií`}
        </div>
      </div>
      {!isMobile && (
        <div style={{ width: 180, height: 6, borderRadius: 999, background: 'var(--input-bg)', overflow: 'hidden', flexShrink: 0 }}>
          <div style={{ width: `${totalSets ? (doneSets / totalSets) * 100 : 0}%`, height: '100%', background: '#E8192C', borderRadius: 999, transition: 'width .3s' }} />
        </div>
      )}
      {finished ? (
        <button onClick={resume} style={{ minHeight: 44, padding: '0 16px', background: '#E8192C', border: 'none', borderRadius: 12, color: '#fff', fontSize: 14, fontWeight: 700, cursor: 'pointer', flexShrink: 0, display: 'flex', alignItems: 'center', gap: 7 }}>
          <RotateCcw size={16} /> {isMobile ? 'Pokračovat' : 'Pokračovat v tréninku'}
        </button>
      ) : (
        <button onClick={finish} style={{ minHeight: 44, padding: '0 16px', background: '#10b981', border: 'none', borderRadius: 12, color: '#fff', fontSize: 14, fontWeight: 700, cursor: 'pointer', flexShrink: 0 }}>{isMobile ? 'Hotovo' : 'Ukončit trénink'}</button>
      )}
    </div>
  )

  const exerciseRow = (it: ActiveExercise, i: number) => {
    const isActive = i === activeIdx
    const done = it.sets.filter(s => s.confirmed && !s.is_warmup).length
    const total = it.sets.filter(s => !s.is_warmup).length
    const prev = it.previous[0]
    return (
      <button key={it.exercise.id} onClick={() => { setActiveIdx(i); setSelectedKey(null) }} style={{
        display: 'flex', alignItems: 'center', gap: 10, textAlign: 'left', cursor: 'pointer', touchAction: 'manipulation',
        padding: '10px 12px', borderRadius: 12, minHeight: 56, width: '100%',
        border: `1px solid ${isActive ? 'rgba(232,25,44,0.35)' : 'var(--border)'}`,
        background: isActive ? 'rgba(232,25,44,0.10)' : 'var(--input-bg)',
      }}>
        <span style={{ width: 26, height: 26, borderRadius: 8, flexShrink: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 13, fontWeight: 800, background: isActive ? '#E8192C' : 'var(--card)', color: isActive ? '#fff' : 'var(--muted)', border: isActive ? 'none' : '1px solid var(--border)' }}>{i + 1}</span>
        <span style={{ minWidth: 0, flex: 1 }}>
          <span style={{ display: 'block', fontSize: 14, fontWeight: 700, color: 'var(--text)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{it.exercise.name}</span>
          <span style={{ display: 'block', fontSize: 12, color: isActive ? '#E8192C' : 'var(--muted)', marginTop: 1 }}>
            {done} / {total} série{prev ? ` · minule ${prev.weight_kg == null ? 'vlastní' : fmtWeight(Number(prev.weight_kg))} × ${prev.reps ?? '?'}` : ''}
          </span>
        </span>
      </button>
    )
  }

  const exerciseListCol = (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
      <div style={{ fontSize: 11, letterSpacing: 0.6, color: 'var(--muted)', fontWeight: 700, marginBottom: 2 }}>CVIKY · {items.length}</div>
      {items.map(exerciseRow)}
      {!finished && <button onClick={() => setPickerOpen(true)} style={{ minHeight: 48, background: 'transparent', border: '1px dashed var(--border)', borderRadius: 12, color: 'var(--text)', fontSize: 14, fontWeight: 600, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6 }}><Plus size={16} /> Přidat cvik</button>}
    </div>
  )

  // Mobile: pinned one-tap exercise switcher (not in the design, but required
  // so switching never means scrolling back up).
  const exerciseStrip = items.length > 0 && (
    // top/paddingTop offset covers <main>'s own padding so rows don't peek above the strip
    <div style={{ position: 'sticky', top: -16, zIndex: 20, background: 'var(--bg)', paddingTop: 16, paddingBottom: 8, marginBottom: 6 }}>
      <div style={{ display: 'flex', gap: 6, overflowX: 'auto', paddingBottom: 2 }}>
        {items.map((it, i) => {
          const isActive = i === activeIdx
          const done = it.sets.filter(s => s.confirmed && !s.is_warmup).length
          const total = it.sets.filter(s => !s.is_warmup).length
          return (
            <button key={it.exercise.id} onClick={() => { setActiveIdx(i); setSelectedKey(null) }} style={{
              flexShrink: 0, minHeight: 44, display: 'flex', alignItems: 'center', gap: 7, padding: '0 12px', borderRadius: 999, cursor: 'pointer', touchAction: 'manipulation',
              border: `1px solid ${isActive ? '#E8192C' : 'var(--border)'}`,
              background: isActive ? 'rgba(232,25,44,0.12)' : 'var(--card)',
            }}>
              <span style={{ width: 22, height: 22, borderRadius: 7, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 12, fontWeight: 800, background: isActive ? '#E8192C' : 'var(--input-bg)', color: isActive ? '#fff' : 'var(--muted)' }}>{i + 1}</span>
              <span style={{ fontSize: 13, fontWeight: 600, color: isActive ? '#E8192C' : 'var(--text)', maxWidth: 110, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{it.exercise.name}</span>
              <span style={{ fontSize: 11, color: 'var(--muted)' }}>{done}/{total}</span>
            </button>
          )
        })}
      </div>
    </div>
  )

  const iconBtn: React.CSSProperties = { minWidth: 44, minHeight: 44, display: 'flex', alignItems: 'center', justifyContent: 'center', borderRadius: 10, border: '1px solid var(--border)', background: 'var(--input-bg)', color: 'var(--text)', cursor: 'pointer', touchAction: 'manipulation', flexShrink: 0 }

  const activeColumn = active && (
    <div>
      {/* Exercise title + actions */}
      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 8, marginBottom: 12, flexWrap: 'wrap' }}>
        <div style={{ minWidth: 0, flex: 1 }}>
          <div style={{ fontSize: 20, fontWeight: 800, color: 'var(--text)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{active.exercise.name}</div>
          {active.previous.length > 0 && <div style={{ fontSize: 12, color: 'var(--muted)', marginTop: 2 }}>minule: {formatPrevious(active.previous)}</div>}
        </div>
        <div style={{ display: 'flex', gap: 8, flexShrink: 0 }}>
          <button onClick={() => router.push(`/trenink/cvik/${active.exercise.id}`)} aria-label="Graf pokroku" style={iconBtn}><BarChart3 size={17} /></button>
          {!finished && <>
            <button onClick={() => moveExercise(activeIdx, -1)} aria-label="Nahoru" style={iconBtn}><ArrowUp size={16} /></button>
            <button onClick={() => moveExercise(activeIdx, 1)} aria-label="Dolů" style={iconBtn}><ArrowDown size={16} /></button>
            <button onClick={() => removeExercise(activeIdx)} aria-label="Odebrat cvik" style={{ ...iconBtn, background: 'rgba(232,25,44,0.12)', color: '#E8192C', borderColor: 'rgba(232,25,44,0.4)' }}><Trash2 size={16} /></button>
          </>}
        </div>
      </div>

      {/* Set rows */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
        {(() => {
          let workingNo = 0
          return active.sets.map((s, setIdx) => {
            if (!s.is_warmup) workingNo++
            // Warm-up rows are marked with the same flame as the panel toggle, not a "W".
            const idxLabel = s.is_warmup ? <Flame size={15} /> : String(workingNo)
            const badge = s.confirmed && !s.is_warmup ? setBadge(s.weight, s.reps, active.previous, workingNo - 1) : null
            const badgeColor = badge?.kind === 'pr' ? '#E8192C' : badge?.kind === 'up' ? '#10b981' : 'var(--muted)'
            const isPanel = setIdx === panelIdx
            const grey = !s.confirmed && s.prefilled
            return (
              <div key={s.key} style={{
                display: 'flex', alignItems: 'center', gap: 10, padding: '8px 10px', borderRadius: 12, minHeight: 54,
                // Green = "counts towards stats" — every working set, confirmed or not.
                // Warm-ups never count, so they stay neutral (no frame). Red is reserved
                // for primary/destructive actions and has no place on a set row.
                border: `1px solid ${s.is_warmup ? 'transparent' : isPanel ? 'rgba(16,185,129,0.6)' : 'rgba(16,185,129,0.32)'}`,
                background: s.is_warmup ? 'var(--input-bg)' : s.confirmed ? 'rgba(16,185,129,0.07)' : 'transparent',
              }}>
                <span style={{ width: 22, fontSize: 13, fontWeight: 700, color: s.is_warmup ? '#d97706' : 'var(--muted)', flexShrink: 0, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>{idxLabel}</span>
                <button onClick={() => !finished && setSelectedKey(s.key)} disabled={finished} style={{ flex: 1, minWidth: 0, minHeight: 40, background: 'transparent', border: 'none', cursor: 'pointer', textAlign: 'left', color: grey ? 'var(--muted)' : 'var(--text)', fontSize: 18, fontWeight: 700, touchAction: 'manipulation', display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                  <span>{fmtWeight(s.weight)} kg <span style={{ color: 'var(--muted)', fontWeight: 500 }}>×</span> {s.reps}</span>
                  {s.is_warmup && <span style={{ fontSize: 11, color: '#d97706', fontWeight: 600 }}>warm-up · nepočítá se</span>}
                  {badge && <span style={{ fontSize: 11, color: badgeColor, fontWeight: 700 }}>{badge.text}</span>}
                </button>
                <button onClick={() => confirmSet(activeIdx, setIdx)} disabled={finished} aria-label="Potvrdit sérii" style={{
                  minWidth: 44, minHeight: 44, display: 'flex', alignItems: 'center', justifyContent: 'center', borderRadius: 10,
                  // Working sets confirm green (they count); warm-ups stay neutral grey.
                  border: s.is_warmup ? '1px solid var(--border)' : 'none',
                  background: s.is_warmup ? 'var(--card)' : '#10b981',
                  color: s.is_warmup ? 'var(--muted)' : '#fff',
                  cursor: 'pointer', touchAction: 'manipulation', flexShrink: 0,
                }}><Check size={20} /></button>
              </div>
            )
          })
        })()}
      </div>

      {!finished && <button onClick={() => addSet(activeIdx)} style={{ marginTop: 10, minHeight: 44, width: '100%', background: 'transparent', border: '1px dashed var(--border)', borderRadius: 10, color: 'var(--muted)', fontSize: 14, fontWeight: 600, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6, touchAction: 'manipulation' }}><Plus size={16} /> Série</button>}

      {/* Rest row (mobile) — tap to start, never automatic */}
      {isMobile && !finished && (
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginTop: 12, padding: '10px 12px', borderRadius: 12, border: `1px solid ${rest === 0 ? '#10b981' : 'var(--border)'}`, background: 'var(--card)' }}>
          <Timer size={18} color={rest == null ? 'var(--muted)' : rest === 0 ? '#10b981' : '#E8192C'} />
          <span style={{ fontSize: 13, color: 'var(--muted)', fontWeight: 600 }}>Pauza</span>
          <span style={{ flex: 1, fontSize: 22, fontWeight: 800, color: rest === 0 ? '#10b981' : 'var(--text)', textAlign: 'center' }}>{rest == null ? '—' : rest === 0 ? 'Hotovo' : mmss(rest)}</span>
          {rest == null ? (
            <button onClick={() => setRest(REST_DEFAULT)} style={{ minHeight: 44, padding: '0 14px', background: 'var(--input-bg)', border: '1px solid var(--border)', borderRadius: 10, color: 'var(--text)', fontSize: 13, fontWeight: 600, cursor: 'pointer' }}>Spustit</button>
          ) : (
            <>
              <button onClick={() => setRest(r => (r == null ? 30 : r + 30))} style={{ minHeight: 44, padding: '0 12px', background: 'var(--input-bg)', border: '1px solid var(--border)', borderRadius: 10, color: 'var(--text)', fontSize: 13, fontWeight: 600, cursor: 'pointer' }}>+30 s</button>
              <button onClick={() => setRest(null)} style={{ minHeight: 44, padding: '0 12px', background: 'transparent', border: '1px solid var(--border)', borderRadius: 10, color: 'var(--muted)', fontSize: 13, cursor: 'pointer' }}>Přeskočit</button>
            </>
          )}
        </div>
      )}
    </div>
  )

  const stepBtn: React.CSSProperties = { width: isMobile ? 60 : 52, height: isMobile ? 60 : 52, flexShrink: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', borderRadius: 14, border: '1px solid var(--border)', background: 'var(--input-bg)', color: 'var(--text)', cursor: 'pointer', touchAction: 'manipulation' }

  const stepperRow = (label: string, value: string, dec: () => void, inc: () => void) => (
    <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
      <button onClick={dec} aria-label={`${label} míň`} style={stepBtn}><Minus size={20} /></button>
      <div style={{ flex: 1, minWidth: 0, textAlign: 'center' }}>
        <div style={{ fontSize: 10, letterSpacing: 0.6, color: 'var(--muted)', fontWeight: 700, textTransform: 'uppercase' }}>{label}</div>
        <div style={{ fontSize: 26, fontWeight: 800, color: 'var(--text)', lineHeight: 1.15 }}>{value}</div>
      </div>
      <button onClick={inc} aria-label={`${label} víc`} style={stepBtn}><Plus size={20} /></button>
    </div>
  )

  const stepperPanel = active && panelSet && !finished && (
    <div style={{ background: 'var(--card)', border: '1px solid var(--border)', borderRadius: isMobile ? 22 : 16, padding: isMobile ? '14px 16px 16px' : 16, boxShadow: isMobile ? '0 -6px 24px rgba(0,0,0,0.18)' : 'var(--shadow)' }}>
      <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', gap: 10, marginBottom: 10 }}>
        <span style={{ fontSize: 12, fontWeight: 800, color: '#E8192C', letterSpacing: 0.4 }}>SÉRIE {panelSetNo}</span>
        <span style={{ fontSize: 12, color: 'var(--muted)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
          {panelPrev ? `minule: ${panelPrev.weight_kg == null ? 'vlastní' : fmtWeight(Number(panelPrev.weight_kg))} × ${panelPrev.reps ?? '?'}` : 'nová série'}{panelSet.prefilled ? ' · předvyplněno' : ''}
        </span>
      </div>
      <div style={{ display: isMobile ? 'flex' : 'grid', flexDirection: 'column', gridTemplateColumns: isMobile ? undefined : '1fr 1fr', gap: 12, marginBottom: 12 }}>
        {stepperRow('Váha', `${fmtWeight(panelSet.weight)} kg`,
          () => patchSet(activeIdx, panelIdx, { weight: Math.max(0, Math.round((panelSet.weight - WEIGHT_STEP) * 100) / 100) }),
          () => patchSet(activeIdx, panelIdx, { weight: Math.round((panelSet.weight + WEIGHT_STEP) * 100) / 100 }))}
        {stepperRow('Opakování', String(panelSet.reps),
          () => patchSet(activeIdx, panelIdx, { reps: Math.max(0, panelSet.reps - REP_STEP) }),
          () => patchSet(activeIdx, panelIdx, { reps: panelSet.reps + REP_STEP }))}
      </div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
        <button onClick={() => toggleWarmup(activeIdx, panelIdx)} aria-label="Rozehřívací série" title="Warm-up (nepočítá se)" style={{ width: isMobile ? 64 : 52, height: isMobile ? 64 : 52, flexShrink: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', borderRadius: 14, border: `1px solid ${panelSet.is_warmup ? '#d97706' : 'var(--border)'}`, background: panelSet.is_warmup ? '#fef3c7' : 'var(--input-bg)', color: panelSet.is_warmup ? '#d97706' : 'var(--muted)', cursor: 'pointer', touchAction: 'manipulation' }}><Flame size={22} /></button>
        <button onClick={() => confirmSet(activeIdx, panelIdx)} style={{ flex: 1, minHeight: isMobile ? 64 : 52, background: '#E8192C', border: 'none', borderRadius: 14, color: '#fff', fontSize: 17, fontWeight: 700, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8, boxShadow: '0 4px 14px rgba(232, 25, 44,0.35)', touchAction: 'manipulation' }}>
          <Check size={22} /> Potvrdit sérii
        </button>
      </div>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginTop: 8 }}>
        <button onClick={() => deleteSet(activeIdx, panelIdx)} style={{ minHeight: 36, padding: '0 8px', background: 'transparent', border: 'none', color: 'var(--muted)', fontSize: 12, cursor: 'pointer' }}>Smazat sérii</button>
        {!isMobile && <span style={{ fontSize: 11, color: 'var(--muted)' }}>nebo klávesa <b style={{ color: 'var(--text)' }}>Enter</b></span>}
      </div>
    </div>
  )

  const sidePanel = active && (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
      {/* Rest — tap to start, never automatic */}
      {!finished && <div style={{ background: 'var(--card)', border: `1px solid ${rest === 0 ? '#10b981' : 'var(--border)'}`, borderRadius: 16, padding: 14, boxShadow: 'var(--shadow)', textAlign: 'center' }}>
        <div style={{ fontSize: 11, letterSpacing: 0.6, color: 'var(--muted)', fontWeight: 700 }}>PAUZA</div>
        <div style={{ fontSize: 34, fontWeight: 800, color: rest === 0 ? '#10b981' : 'var(--text)', lineHeight: 1.2, margin: '2px 0 8px' }}>{rest == null ? '—' : rest === 0 ? 'Hotovo' : mmss(rest)}</div>
        <div style={{ height: 5, borderRadius: 999, background: 'var(--input-bg)', overflow: 'hidden', marginBottom: 10 }}>
          <div style={{ width: `${rest == null ? 0 : (rest / REST_DEFAULT) * 100}%`, height: '100%', background: rest === 0 ? '#10b981' : '#E8192C', transition: 'width 1s linear' }} />
        </div>
        {rest == null ? (
          <button onClick={() => setRest(REST_DEFAULT)} style={{ width: '100%', minHeight: 44, background: 'var(--input-bg)', border: '1px solid var(--border)', borderRadius: 10, color: 'var(--text)', fontSize: 14, fontWeight: 600, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6 }}><Timer size={16} /> Spustit pauzu</button>
        ) : (
          <div style={{ display: 'flex', gap: 8 }}>
            <button onClick={() => setRest(r => (r == null ? 30 : r + 30))} style={{ flex: 1, minHeight: 44, background: 'var(--input-bg)', border: '1px solid var(--border)', borderRadius: 10, color: 'var(--text)', fontSize: 14, fontWeight: 600, cursor: 'pointer' }}>+30 s</button>
            <button onClick={() => setRest(null)} style={{ flex: 1, minHeight: 44, background: 'transparent', border: '1px solid var(--border)', borderRadius: 10, color: 'var(--muted)', fontSize: 14, cursor: 'pointer' }}>Přeskočit</button>
          </div>
        )}
      </div>}

      {/* Progress */}
      <div style={{ background: 'var(--card)', border: '1px solid var(--border)', borderRadius: 16, padding: 14, boxShadow: 'var(--shadow)' }}>
        <div style={{ fontSize: 11, letterSpacing: 0.6, color: 'var(--muted)', fontWeight: 700, marginBottom: 8, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{active.exercise.name.toUpperCase()} · POKROK</div>
        <ExerciseSparkline exerciseId={active.exercise.id} />
        <div style={{ marginTop: 10, display: 'flex', flexDirection: 'column', gap: 6 }}>
          {[
            { k: '1RM est.', v: exStats?.oneRM ? `${exStats.oneRM} kg` : '—', accent: false },
            { k: 'Objem dnes', v: exStats?.todayVol ? fmtTonnage(exStats.todayVol) : '—', accent: false },
            { k: 'Vs. minule', v: exStats?.delta == null ? '—' : `${exStats.delta >= 0 ? '+' : ''}${fmtWeight(exStats.delta)} %`, accent: (exStats?.delta ?? 0) > 0 },
          ].map(r => (
            <div key={r.k} style={{ display: 'flex', justifyContent: 'space-between', fontSize: 13 }}>
              <span style={{ color: 'var(--muted)' }}>{r.k}</span>
              <span style={{ fontWeight: 700, color: r.accent ? '#10b981' : 'var(--text)' }}>{r.v}</span>
            </div>
          ))}
        </div>
      </div>

      {/* Previous session for this exercise */}
      {active.previous.length > 0 && (
        <div style={{ background: 'var(--card)', border: '1px solid var(--border)', borderRadius: 16, padding: 14, boxShadow: 'var(--shadow)' }}>
          <div style={{ fontSize: 11, letterSpacing: 0.6, color: 'var(--muted)', fontWeight: 700, marginBottom: 8 }}>
            MINULÝ {String(split || '').toUpperCase()}{tmpl.date ? ` · ${shortDate(tmpl.date)}` : ''}
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            {active.previous.map((p, i) => (
              <div key={i} style={{ display: 'flex', justifyContent: 'space-between', fontSize: 13 }}>
                <span style={{ color: 'var(--muted)' }}>Série {i + 1}</span>
                <span style={{ fontWeight: 600, color: 'var(--text)' }}>{p.weight_kg == null ? 'vlastní' : `${fmtWeight(Number(p.weight_kg))} kg`} × {p.reps ?? '?'}</span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  )

  const emptyState = (
    <div style={{ maxWidth: 520, margin: '0 auto' }}>
      <div style={{ background: 'var(--card)', border: '1px solid var(--border)', borderRadius: 16, padding: '28px 20px', textAlign: 'center', boxShadow: 'var(--shadow)' }}>
        <div style={{ width: 64, height: 64, borderRadius: '50%', background: 'var(--input-bg)', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 14px' }}>
          <Dumbbell size={28} color="var(--muted)" />
        </div>
        <div style={{ fontSize: 17, fontWeight: 700, color: 'var(--text)', marginBottom: 6 }}>Zatím žádný cvik</div>
        <div style={{ fontSize: 13, color: 'var(--muted)', lineHeight: 1.5 }}>
          {tmpl.groups.length
            ? `Načti minulý ${split || 'trénink'}${tmpl.date ? ` (${shortDate(tmpl.date)})` : ''} se všemi váhami, nebo si vyber cvik ručně.`
            : 'Přidej si první cvik — příště se ti předvyplní i s váhami.'}
        </div>
      </div>

      {tmpl.groups.length > 0 && (
        <div style={{ background: 'var(--card)', border: '1px solid var(--border)', borderRadius: 16, padding: 14, marginTop: 12, boxShadow: 'var(--shadow)' }}>
          <div style={{ fontSize: 11, letterSpacing: 0.5, color: 'var(--muted)', fontWeight: 700, marginBottom: 10 }}>
            MINULÝ {String(split || '').toUpperCase()}{tmpl.date ? ` · ${shortDate(tmpl.date)}` : ''}
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 7 }}>
            {tmpl.groups.slice(0, 3).map(g => (
              <div key={g.exercise.id} style={{ display: 'flex', justifyContent: 'space-between', gap: 10, fontSize: 13 }}>
                <span style={{ color: 'var(--text)', fontWeight: 500, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{g.exercise.name}</span>
                <span style={{ color: 'var(--muted)', flexShrink: 0 }}>{formatPrevious(g.sets.filter(s => !s.is_warmup).slice(0, 2).map(s => ({ weight_kg: s.weight_kg, reps: s.reps })))}</span>
              </div>
            ))}
            {tmpl.groups.length > 3 && <div style={{ fontSize: 12, color: 'var(--muted)' }}>+ {tmpl.groups.length - 3} další cviky</div>}
          </div>
        </div>
      )}

      <div style={{ display: 'flex', flexDirection: 'column', gap: 10, marginTop: 12 }}>
        {!finished && tmpl.groups.length > 0 && (
          <button onClick={loadTemplate} style={{ width: '100%', minHeight: 56, background: '#E8192C', border: 'none', borderRadius: 14, color: '#fff', fontSize: 16, fontWeight: 700, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8, boxShadow: '0 4px 14px rgba(232, 25, 44,0.35)', touchAction: 'manipulation' }}>
            <RotateCcw size={18} /> Načíst minulý trénink
          </button>
        )}
        {!finished && (
          <button onClick={() => setPickerOpen(true)} style={{ width: '100%', minHeight: 52, background: 'transparent', border: '1px dashed var(--border)', borderRadius: 14, color: 'var(--text)', fontSize: 15, fontWeight: 600, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8, touchAction: 'manipulation' }}>
            <Plus size={18} /> Přidat cvik
          </button>
        )}
      </div>
    </div>
  )

  return (
    <div style={{ maxWidth: 1440, margin: '0 auto', paddingBottom: isMobile && items.length && !finished ? MOBILE_PANEL_SPACE : 24 }}>
      {header}

      {finished && (
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 14, padding: '10px 14px', borderRadius: 12, background: 'var(--input-bg)', border: '1px solid var(--border)', color: 'var(--muted)', fontSize: 13 }}>
          <Check size={16} color="#10b981" />
          Trénink je ukončený — série si můžeš prohlížet, pro zápis klikni na „Pokračovat{isMobile ? '' : ' v tréninku'}".
        </div>
      )}

      {items.length === 0 ? emptyState : isMobile ? (
        <>
          {exerciseStrip}
          {activeColumn}
          {!finished && <button onClick={() => setPickerOpen(true)} style={{ marginTop: 14, width: '100%', minHeight: 48, background: 'transparent', border: '1px dashed var(--border)', borderRadius: 12, color: 'var(--text)', fontSize: 14, fontWeight: 600, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8, touchAction: 'manipulation' }}><Plus size={16} /> Přidat cvik</button>}
          {/* Stepper panel pinned in the thumb zone */}
          <div style={{ position: 'fixed', left: 0, right: 0, bottom: 'var(--gym-panel-bottom, 62px)', zIndex: 60, padding: '0 12px' }}>
            {stepperPanel}
          </div>
        </>
      ) : (
        <div style={{ display: 'grid', gridTemplateColumns: '300px minmax(0,1fr) 340px', gap: 18, alignItems: 'start' }}>
          {exerciseListCol}
          <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
            {activeColumn}
            {stepperPanel}
          </div>
          {sidePanel}
        </div>
      )}

      <Modal isOpen={pickerOpen} onClose={() => setPickerOpen(false)} title="Přidat cvik">
        <ExercisePicker exercises={catalog} onPick={addExercise} onAddCustom={addCustomExercise} />
      </Modal>
      {confirmDialog}
      {toast && <Toast message={toast.message} type={toast.type} onClose={hideToast} />}
    </div>
  )
}
