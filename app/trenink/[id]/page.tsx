'use client'
import { Fragment, useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useParams, useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import type { Workout, WorkoutSet, Exercise, ExerciseTarget } from '@/lib/types'
import Modal from '@/components/Modal'
import ExercisePicker from '@/components/gym/ExercisePicker'
import StepperField from '@/components/gym/StepperField'
import { useConfirm } from '@/components/ConfirmDialog'
import { Toast, useToast } from '@/components/Toast'
import ExerciseSparkline from '@/components/gym/ExerciseSparkline'
import { WEIGHT_STEP, REP_STEP, formatPrevious, fmtWeight, fmtDuration, splitColor, epley1RM, fmtTonnage, buildAdvice, stepForWeight, setBadge, maxPrevWeight, exerciseOrder, type Target, type Advice, type ExSession } from '@/lib/gym'
import { autoFinishStale, IDLE_LIMIT_MIN, TAIL_MIN } from '@/lib/autoFinish'
import { ChevronLeft, Plus, Check, Trash2, ArrowUp, ArrowDown, BarChart3, Flame, Zap, Timer, Minus, RotateCcw, Dumbbell, X, MapPin, Target as TargetIcon, Lightbulb, TrendingUp } from 'lucide-react'

type ActiveSet = { key: string; id: string | null; weight: number; reps: number; is_warmup: boolean; to_failure: boolean; confirmed: boolean; prefilled: boolean }
type ActiveExercise = { exercise: Exercise; previous: { weight_kg: number | null; reps: number | null }[]; prevDate: string | null; sets: ActiveSet[] }
type Template = { date: string | null; groups: { exercise: Exercise; sets: WorkoutSet[] }[] }

let keySeq = 0
const newKey = () => `s${++keySeq}`

const REST_DEFAULT = 90 // seconds; the rest timer NEVER auto-starts — user taps "Pauza".
const MOBILE_PANEL_SPACE = 380 // room reserved under the content for the pinned stepper panel
const mmss = (s: number) => `${Math.floor(s / 60)}:${String(Math.max(0, s % 60)).padStart(2, '0')}`

// Advice is informational: green nudges forward, amber flags a plateau.
const adviceColor = (k: 'increase' | 'hold' | 'stagnation') =>
  k === 'increase' ? '#10b981' : k === 'stagnation' ? '#d97706' : 'var(--muted)'

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
  const [panelOpen, setPanelOpen] = useState(false)
  const panelRef = useRef<HTMLDivElement>(null)
  const [pickerOpen, setPickerOpen] = useState(false)
  const [targets, setTargets] = useState<Record<string, Target>>({})
  const [targetEdit, setTargetEdit] = useState<Target | null>(null)
  const [advice, setAdvice] = useState<Advice | null>(null)
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

    // Úklid běží PŘED načtením, aby se zapomenutý trénink otevřel rovnou jako
    // ukončený a hodiny se znovu nerozeběhly.
    const swept = await autoFinishStale(supabase)
    if (swept.error) showToast(`Automatické ukončení selhalo: ${swept.error}`, 'error')
    else if (swept.closed.includes(id)) showToast(`Trénink byl ukončen automaticky — ${IDLE_LIMIT_MIN} min bez série`)

    const { data: w } = await supabase.from('workouts').select('*').eq('id', id).eq('user_id', user.id).single()
    if (!w) { setLoading(false); return }
    setWorkout(w as Workout)

    const { data: cat } = await supabase.from('exercises').select('*').or(`user_id.is.null,user_id.eq.${user.id}`).order('name')
    const catalog = (cat || []) as Exercise[]
    setCatalog(catalog)

    // Per-exercise targets (optional; missing row simply means "no advice").
    const { data: tg } = await supabase.from('exercise_targets').select('*').eq('user_id', user.id)
    const tMap: Record<string, Target> = {}
    for (const t of (tg || []) as ExerciseTarget[]) tMap[t.exercise_id] = { sets: t.target_sets, reps: t.target_reps }
    setTargets(tMap)
    const exMap = new Map(catalog.map(e => [e.id, e]))

    // Confirmed sets of THIS workout.
    const { data: mine } = await supabase.from('workout_sets').select('*').eq('workout_id', id).order('order_index').order('created_at')
    const confirmed = (mine || []) as WorkoutSet[]

    // Template = the most recent OTHER workout of the same split.
    let template: WorkoutSet[] = []
    let templateDate: string | null = null
    if (w.split_type) {
      const { data: prevW } = await supabase.from('workouts').select('id, date').eq('user_id', user.id).eq('split_type', w.split_type).eq('other_gym', false).neq('id', id).order('date', { ascending: false }).order('created_at', { ascending: false }).limit(1)
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
    // A new workout starts EMPTY even when a previous one exists — only
    // exercises that already have logged sets show up. The previous workout is
    // offered explicitly via "Načíst minulý trénink" in the empty state.
    //
    // Seznam cviků ale NEMŮŽE stát jen na `workout_sets`: předvyplněný cvik bez
    // jediné potvrzené série tam nemá nic a po obnovení stránky by zmizel.
    // Drží ho `workout_exercises` (migrace 0019).
    //
    // U dokončeného tréninku se plán ignoruje — historie ukazuje, co se
    // odcvičilo, ne co se zamýšlelo. Po „Pokračovat v tréninku" (duration_min
    // zpět na NULL) se plánované cviky zase objeví.
    const finishedW = (w as Workout).duration_min != null
    let planned: string[] = []
    if (!finishedW) {
      const { data: pl, error: plErr } = await supabase
        .from('workout_exercises').select('exercise_id, order_index')
        .eq('workout_id', id).order('order_index')
      // Nepuštěná migrace nesmí shodit rozdělaný trénink — bez plánu se seznam
      // poskládá po staru, tedy z potvrzených sérií.
      if (plErr) console.warn('[trenink] plán cviků se nenačetl:', plErr)
      planned = ((pl || []) as { exercise_id: string }[]).map(r => r.exercise_id)
    }
    const order = exerciseOrder(planned, confirmed)

    // Keep the template around so the empty state can offer "Načíst minulý trénink".
    const tmplOrder: string[] = []
    for (const s of template) if (!tmplOrder.includes(s.exercise_id)) tmplOrder.push(s.exercise_id)
    setTmpl({
      date: templateDate,
      groups: tmplOrder.map(exId => ({ exercise: exMap.get(exId)!, sets: tmplG.get(exId) || [] })).filter(g => g.exercise),
    })

    // „MINULE" = poslední trénink, ve kterém byl TENHLE CVIK — bez ohledu na split.
    //
    // Dřív se to bralo ze šablony, tedy z minulého tréninku STEJNÉHO SPLITU.
    // Když žádný takový nebyl (první Push v historii), bylo `previous` prázdné
    // pro všechny cviky naráz — a s ním zmizely porovnávací odznaky, řádek
    // „minule: …" i karta „Vs. minule", i když data v databázi byla. Cviky se
    // navíc opakují napříč splity (Tlaky na ramena jsou v Push i v Legs), takže
    // vázat porovnání na split je i věcně špatně.
    const prevByEx = new Map<string, { sets: { weight_kg: number | null; reps: number | null }[]; date: string | null }>()
    // V jiné posilovně se neporovnává vůbec nic — prázdné `previous` shodí
    // odznaky, řádek „minule:“ i kartu porovnání naráz.
    if (order.length && !w.other_gym) {
      // Krok 1: ze kterého tréninku je pro každý cvik to „minule".
      const { data: stamps } = await supabase
        .from('workout_sets')
        // Trénink z jiné posilovny se jako referenční NEPOUŽIJE — jiné stroje,
        // jiné váhy. Bere se poslední trénink bez toho příznaku.
        .select('exercise_id, workout_id, created_at, workouts!inner(other_gym)')
        .eq('workouts.other_gym', false)
        .in('exercise_id', order)
        .neq('workout_id', id)
        .order('created_at', { ascending: false })
      const lastWid = new Map<string, string>()
      for (const r of (stamps || []) as { exercise_id: string; workout_id: string }[]) {
        if (!lastWid.has(r.exercise_id)) lastWid.set(r.exercise_id, r.workout_id)
      }
      const wids = [...new Set(lastWid.values())]
      if (wids.length) {
        // Krok 2: jejich série ve skutečném pořadí cvičení + datum na popisek.
        const [{ data: prevSets }, { data: prevWs }] = await Promise.all([
          supabase.from('workout_sets').select('exercise_id, workout_id, weight_kg, reps, is_warmup')
            .in('workout_id', wids).in('exercise_id', order).order('order_index').order('created_at'),
          supabase.from('workouts').select('id, date').in('id', wids),
        ])
        const dateOf = new Map(((prevWs || []) as { id: string; date: string }[]).map(x => [x.id, x.date]))
        const rows = (prevSets || []) as { exercise_id: string; workout_id: string; weight_kg: number | null; reps: number | null; is_warmup: boolean }[]
        for (const [exId, wid] of lastWid) {
          prevByEx.set(exId, {
            sets: rows.filter(r => r.exercise_id === exId && r.workout_id === wid && !r.is_warmup)
              .map(r => ({ weight_kg: r.weight_kg, reps: r.reps })),
            date: dateOf.get(wid) ?? null,
          })
        }
      }
    }

    const built: ActiveExercise[] = []
    for (const exId of order) {
      const ex = exMap.get(exId)
      if (!ex) continue
      const conf = confG.get(exId) || []
      const p = prevByEx.get(exId)
      // Potvrzené série jsou jediná pravda; žádná náhradní prázdná se k nim
      // nedoplňuje. Prázdné `conf` znamená plánovaný cvik — jeho předvyplněné
      // řádky se dopočítají z „minule" (stejný zdroj, ze kterého je vyrobilo
      // „Načíst minulý trénink"). Když není z čeho, zbude jedna prázdná série,
      // přesně jak vypadá ručně přidaný cvik.
      const sets: ActiveSet[] = conf.length
        ? conf.map(s => ({ key: newKey(), id: s.id, weight: Number(s.weight_kg ?? 0), reps: s.reps ?? 0, is_warmup: s.is_warmup, to_failure: !!s.to_failure, confirmed: true, prefilled: false }))
        : (p?.sets.length
          ? p.sets.map(r => ({ key: newKey(), id: null, weight: Number(r.weight_kg ?? 0), reps: r.reps ?? 0, is_warmup: false, to_failure: false, confirmed: false, prefilled: true }))
          : [{ key: newKey(), id: null, weight: 20, reps: 8, is_warmup: false, to_failure: false, confirmed: false, prefilled: false }])
      built.push({ exercise: ex, previous: p?.sets ?? [], prevDate: p?.date ?? null, sets })
    }
    setItems(built)
    setLoading(false)
    // showToast se schválně nesleduje — mění identitu při každém renderu a
    // load() visí na useEffect, takže by se načítání zacyklilo.
    // eslint-disable-next-line react-hooks/exhaustive-deps
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

  // ŽÁDNÉ AUTOMATICKÉ DOLEPOVÁNÍ SÉRIÍ. Tady dřív visel efekt, který po každém
  // potvrzení přidal na konec aktivního cviku prázdnou nepotvrzenou sérii.
  // Nešla smazat (efekt ji hned vrátil) a lezla do počítadla — 3 hotové série
  // se ukazovaly jako 3/4. Novou sérii přidává výhradně uživatel přes „+ Série".

  const supabase = useMemo(() => createClient(), [])

  const patchSet = (ex: number, set: number, patch: Partial<ActiveSet>) =>
    setItems(prev => prev.map((it, i) => i !== ex ? it : { ...it, sets: it.sets.map((s, j) => j !== set ? s : { ...s, ...patch }) }))

  async function confirmSet(ex: number, set: number) {
    const it = items[ex]; const s = it?.sets[set]
    if (!it || !s) return
    const payload = { workout_id: id, exercise_id: it.exercise.id, order_index: ex, weight_kg: s.weight, reps: s.reps, is_warmup: s.is_warmup, to_failure: s.to_failure }
    if (s.confirmed && s.id) {
      const { error } = await supabase.from('workout_sets').update(payload).eq('id', s.id)
      if (error) { showToast(`Série se neuložila: ${error.message}`, 'error'); return }
      patchSet(ex, set, { prefilled: false })
    } else {
      const { data, error } = await supabase.from('workout_sets').insert(payload).select().single()
      // Bez kontroly zůstala série „potvrzená" jen na obrazovce a po obnovení
      // stránky zmizela — počítadlo i objem pak lhaly.
      if (error) { showToast(`Série se neuložila: ${error.message}`, 'error'); return }
      patchSet(ex, set, { confirmed: true, prefilled: false, id: data?.id ?? null })
    }
    setSelectedKey(null)
    setPanelOpen(false)
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
    setPanelOpen(false)
  }

  // Nová série se předvyplní ODPOVÍDAJÍCÍ sérií z minulého tréninku, ne
  // předchozím řádkem. Kopírování řádku nad sebou zplošťovalo rampu: z minulých
  // 25/35/35 vzniklo 25/25/25, protože série 2 opsala 25 a série 3 opsala 25.
  // `previous` je v pořadí, v jakém se minule cvičilo, takže se indexuje pořadím
  // pracovní série (warm-upy se nepočítají).
  // Když minulý trénink tolik sérií neměl, zůstává původní chování — opsat
  // poslední řádek.
  function addSet(ex: number) {
    const key = newKey()
    setItems(prev => prev.map((it, i) => {
      if (i !== ex) return it
      const last = it.sets[it.sets.length - 1]
      const workingCount = it.sets.filter(s => !s.is_warmup).length
      const match = it.previous[workingCount]
      const fromPrev = match && match.weight_kg != null
      return {
        ...it,
        sets: [...it.sets, {
          key, id: null,
          weight: fromPrev ? Number(match.weight_kg) : (last?.weight ?? 20),
          reps: fromPrev ? (match.reps ?? last?.reps ?? 8) : (last?.reps ?? 8),
          is_warmup: false, to_failure: false, confirmed: false, prefilled: !!fromPrev,
        }],
      }
    }))
    setSelectedKey(key)
    setPanelOpen(true)
  }

  async function toggleWarmup(ex: number, set: number) {
    const s = items[ex]?.sets[set]
    if (!s) return
    const nv = !s.is_warmup
    patchSet(ex, set, { is_warmup: nv })
    if (s.confirmed && s.id) {
      const { error } = await supabase.from('workout_sets').update({ is_warmup: nv }).eq('id', s.id)
      if (error) { patchSet(ex, set, { is_warmup: !nv }); showToast(`Změna se neuložila: ${error.message}`, 'error') }
    }
  }

  // „Do selhání" je zatím JEN ZÁZNAM — nesahá na objem, na statistiky ani na
  // odznaky. Až se nasbírají data, rozhodne se, co s ním.
  async function toggleFailure(ex: number, set: number) {
    const s = items[ex]?.sets[set]
    if (!s) return
    const nv = !s.to_failure
    patchSet(ex, set, { to_failure: nv })
    if (s.confirmed && s.id) {
      const { error } = await supabase.from('workout_sets').update({ to_failure: nv }).eq('id', s.id)
      if (error) { patchSet(ex, set, { to_failure: !nv }); showToast(`Změna se neuložila: ${error.message}`, 'error') }
    }
  }

  async function addExercise(ex: Exercise) {
    setPickerOpen(false)
    const existing = items.findIndex(it => it.exercise.id === ex.id)
    if (existing >= 0) { setActiveIdx(existing); return }
    // Předvyplnění z MINULÉHO TRÉNINKU tohoto cviku, v pořadí, v jakém se
    // série opravdu cvičily.
    //
    // Dřív to byl jeden dotaz `order(created_at, desc).limit(12)`, což mělo dvě
    // chyby: „nejnovější" série je poslední série rampy, tedy ta NEJTĚŽŠÍ, a ta
    // se lepila do série 1 (u Bench pressu 70 kg místo 50). A `previous` bylo
    // pozpátku, takže se série 1 porovnávala s vrcholem minula. Limit navíc
    // míchal série z různých tréninků.
    //
    // Dva dotazy: nejdřív ZE KTERÉHO tréninku, pak všechny jeho série vzestupně.
    const { data: { session } } = await supabase.auth.getSession()
    let previous: { weight_kg: number | null; reps: number | null }[] = []
    let prevDate: string | null = null
    let seed = { weight: 20, reps: 8 }
    if (session?.user && !workout?.other_gym) {
      const { data: lastRow } = await supabase
        .from('workout_sets')
        .select('workout_id, workouts!inner(user_id, date, other_gym)')
        .eq('workouts.other_gym', false)
        .eq('exercise_id', ex.id)
        .neq('workout_id', id)
        .order('created_at', { ascending: false })
        .limit(1)
      const lastWorkoutId = (lastRow || [])[0]?.workout_id as string | undefined
      prevDate = ((lastRow || [])[0]?.workouts as { date?: string } | undefined)?.date ?? null
      if (lastWorkoutId) {
        const { data: prevSets } = await supabase
          .from('workout_sets')
          .select('weight_kg, reps, is_warmup')
          .eq('exercise_id', ex.id)
          .eq('workout_id', lastWorkoutId)
          .order('order_index')
          .order('created_at')
        const working = ((prevSets || []) as { weight_kg: number | null; reps: number | null; is_warmup: boolean }[])
          .filter(r => !r.is_warmup)
        if (working.length) {
          // Série 1 začíná tam, kde minule začala rampa — ne na jejím vrcholu.
          seed = { weight: Number(working[0].weight_kg ?? 20), reps: working[0].reps ?? 8 }
          previous = working.map(r => ({ weight_kg: r.weight_kg, reps: r.reps }))
        }
      }
    }
    setItems(prev => {
      const next = [...prev, { exercise: ex, previous, prevDate, sets: [{ key: newKey(), id: null, weight: seed.weight, reps: seed.reps, is_warmup: false, to_failure: false, confirmed: false, prefilled: !!previous.length }] }]
      setActiveIdx(next.length - 1)
      return next
    })
    // Do plánu, ať cvik přežije obnovení i bez potvrzené série.
    await planExercises([ex.id], items.length)
  }

  /**
   * Zápis cviků do `workout_exercises`. Bez toho by cvik bez potvrzené série
   * po obnovení stránky zmizel — v `workout_sets` po něm nic není.
   *
   * Selhání se hlásí, ale seznam na obrazovce se nevrací zpět: cvičit se dá
   * dál, jen po obnovení bude seznam kratší. Tiché spolknutí by uživatele
   * nechalo v přesvědčení, že je uloženo.
   */
  async function planExercises(exerciseIds: string[], from = 0) {
    if (!exerciseIds.length) return
    const rows = exerciseIds.map((exercise_id, i) => ({ workout_id: id, exercise_id, order_index: from + i }))
    const { error } = await supabase.from('workout_exercises').upsert(rows, { onConflict: 'workout_id,exercise_id' })
    if (error) showToast(`Cvik se neuložil do plánu: ${error.message}`, 'error')
  }

  async function addCustomExercise(name: string) {
    const { data: { session } } = await supabase.auth.getSession()
    if (!session?.user) return
    const { data, error } = await supabase.from('exercises').insert({ user_id: session.user.id, name, is_custom: true }).select().single()
    if (error) { showToast(`Cvik se nepodařilo přidat: ${error.message}`, 'error'); return }
    if (data) { setCatalog(c => [...c, data as Exercise]); addExercise(data as Exercise) }
  }

  // Rebuild the exercise list from the previous same-split workout (empty state).
  async function loadTemplate() {
    if (!tmpl.groups.length) return
    setItems(tmpl.groups.map(g => ({
      exercise: g.exercise,
      previous: g.sets.filter(s => !s.is_warmup).map(s => ({ weight_kg: s.weight_kg, reps: s.reps })),
      prevDate: tmpl.date,
      sets: g.sets.map(s => ({ key: newKey(), id: null, weight: Number(s.weight_kg ?? 0), reps: s.reps ?? 0, is_warmup: s.is_warmup, to_failure: !!s.to_failure, confirmed: false, prefilled: true })),
    })))
    setActiveIdx(0)
    // Načtené cviky musí přežít obnovení stránky — v `workout_sets` po nich
    // do prvního potvrzení nic není.
    await planExercises(tmpl.groups.map(g => g.exercise.id))
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
    // Z plánu taky, jinak by se cvik po obnovení stránky vrátil.
    const { error: pErr } = await supabase.from('workout_exercises')
      .delete().eq('workout_id', id).eq('exercise_id', it.exercise.id)
    if (pErr) { showToast(`Odebrání selhalo: ${pErr.message}`, 'error'); return }
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
      if (!ids.length) continue
      const { error } = await supabase.from('workout_sets').update({ order_index: i }).in('id', ids)
      if (error) { showToast(`Pořadí cviků se neuložilo: ${error.message}`, 'error'); break }
    }
    // Pořadí drží i plán — po obnovení se cviky mají seřadit stejně.
    await planExercises(arr.map(a => a.exercise.id))
  }

  // duration_min NULL = running, set = finished (see migration 0007).
  async function finish() {
    const origin = clockOrigin(workout)
    const mins = Math.max(1, Math.round((Date.now() - origin) / 60000))
    // Ukončeno ručně → délka je naměřená, značka „auto" musí pryč.
    const { error } = await supabase.from('workouts').update({ duration_min: mins, auto_finished: false }).eq('id', id)
    if (error) { showToast(`Uložení selhalo: ${error.message}`, 'error'); return }
    setWorkout(w => w ? { ...w, duration_min: mins, auto_finished: false } : w)
    router.push('/trenink')
  }

  // Resume: move the clock origin back by the saved length so the timer
  // continues instead of restarting, and clear the finished flag.
  async function resume() {
    if (!workout) return
    const newStart = new Date(Date.now() - (workout.duration_min || 0) * 60000).toISOString()
    // resumed_at je poslední aktivita: bez něj by automatické ukončení po
    // návratu bez zapsané série spočítalo délku od posunutého startu k staré
    // sérii a odpracované minuty zahodilo (viz migrace 0010).
    const resumedAt = new Date().toISOString()
    const { error } = await supabase.from('workouts').update({ duration_min: null, started_at: newStart, resumed_at: resumedAt, auto_finished: false }).eq('id', id)
    if (error) { showToast(`Nepodařilo se pokračovat: ${error.message}`, 'error'); return }
    setWorkout(w => w ? { ...w, duration_min: null, started_at: newStart, resumed_at: resumedAt, auto_finished: false } : w)
    setNowMs(Date.now())
    showToast('Trénink pokračuje')
  }

  // ---------- derived ----------
  const active = items[activeIdx]
  const activeTarget = active ? targets[active.exercise.id] ?? null : null

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

  // Nejvyšší váha tohoto cviku v minulém tréninku — proti ní se poměřuje PR.
  const prevMax = useMemo(() => active ? maxPrevWeight(active.previous) : 0, [active])

  // Index nejtěžší pracovní série — k té se váže rada. Při shodné váze vyhrává
  // pozdější řádek, aby rada seděla na tom, který právě děláš.
  const topRowIdx = useMemo(() => {
    if (!active) return -1
    let idx = -1, best = -Infinity
    active.sets.forEach((s, i) => {
      if (s.is_warmup) return
      if (s.weight >= best) { best = s.weight; idx = i }
    })
    return idx
  }, [active])

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
    // „Vs. minule" srovnává OBJEM CELÉHO CVIKU, takže rozdělaný cvik je vždycky
    // v mínusu — po první sérii ze tří to hlásilo −60 %, i když šlo všechno
    // dobře. Procento se ukáže, až je sérií aspoň tolik jako minule; do té doby
    // „po dokončení".
    const comparable = prevVol > 0 && todaySets.length >= active.previous.length
    const delta = comparable && todayVol > 0
      ? Math.round(((todayVol - prevVol) / prevVol) * 1000) / 10
      : null
    return { todayVol, oneRM, delta, pendingCompare: prevVol > 0 && !comparable }
  }, [active])

  // Finished workouts show their saved length; the clock only runs while active.
  const finished = workout?.duration_min != null
  const elapsedSec = finished
    ? (workout!.duration_min as number) * 60
    : workout ? Math.max(0, Math.floor((nowMs - clockOrigin(workout)) / 1000)) : 0
  // Běžící trénink = živé stopky (mm:ss). Ukončený = délka, ne hodiny — "545:00"
  // se čte mizerně a vteřiny na uloženém tréninku stejně nic neznamenají.
  const clockLabel = finished ? fmtDuration(workout!.duration_min) : mmss(elapsedSec)

  // Advice for the ACTIVE exercise: its own history, newest last, excluding the
  // workout being logged. Read-only — nothing here ever writes.
  useEffect(() => {
    const ex = items[activeIdx]?.exercise
    // Rada porovnává s historií a navrhuje váhy — na cizích strojích nesedí.
    if (!ex || workout?.other_gym) { setAdvice(null); return }
    let alive = true
    ;(async () => {
      const { data } = await supabase
        .from('workout_sets')
        .select('weight_kg, reps, is_warmup, workouts!inner(date, other_gym)')
        .eq('workouts.other_gym', false)
        .eq('exercise_id', ex.id)
        .neq('workout_id', id)
      if (!alive) return
      const byDate = new Map<string, { weight_kg: number | null; reps: number | null; is_warmup: boolean }[]>()
      for (const r of (data || []) as { weight_kg: number | null; reps: number | null; is_warmup: boolean; workouts: { date: string } | null }[]) {
        const d = r.workouts?.date
        if (!d) continue
        const g = byDate.get(d) || []; g.push({ weight_kg: r.weight_kg, reps: r.reps, is_warmup: r.is_warmup }); byDate.set(d, g)
      }
      const sessions: ExSession[] = [...byDate.entries()].sort((a, b) => a[0].localeCompare(b[0])).map(([date, sets]) => ({ date, sets }))
      setAdvice(buildAdvice(sessions, targets[ex.id] ?? null, ex.name))
    })()
    return () => { alive = false }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeIdx, items[activeIdx]?.exercise.id, targets, id, workout?.other_gym])

  async function saveTarget(next: Target | null) {
    const ex = items[activeIdx]?.exercise
    if (!ex) return
    // step_kg is no longer a user setting — it's a snapshot of the computed
    // increment for the weight currently being used.
    const it = items[activeIdx]
    const seen = [...it.sets.filter(x => !x.is_warmup).map(x => x.weight), ...it.previous.map(p => Number(p.weight_kg) || 0)]
    const refWeight = seen.length ? Math.max(...seen) : 0
    const { data: { session } } = await supabase.auth.getSession()
    if (!session?.user) return
    if (next) {
      const { error } = await supabase.from('exercise_targets')
        .upsert({ user_id: session.user.id, exercise_id: ex.id, target_sets: next.sets, target_reps: next.reps, step_kg: stepForWeight(refWeight, ex.name) })
      if (error) { showToast(`Uložení cíle selhalo: ${error.message}`, 'error'); return }
      setTargets(t => ({ ...t, [ex.id]: next }))
      showToast(`Cíl ${next.sets}×${next.reps} uložen`)
    } else {
      const { error } = await supabase.from('exercise_targets').delete().eq('user_id', session.user.id).eq('exercise_id', ex.id)
      if (error) { showToast(`Smazání cíle selhalo: ${error.message}`, 'error'); return }
      setTargets(t => { const c = { ...t }; delete c[ex.id]; return c })
      showToast('Cíl zrušen')
    }
    setTargetEdit(null)
  }

  // Tap/click anywhere outside the panel closes it (desktop included).
  // Registered only while open, so the opening tap itself can't close it.
  useEffect(() => {
    if (!panelOpen) return
    const onDown = (e: PointerEvent) => {
      const t = e.target as Node | null
      if (t && panelRef.current?.contains(t)) return
      setPanelOpen(false)
    }
    document.addEventListener('pointerdown', onDown)
    return () => document.removeEventListener('pointerdown', onDown)
  }, [panelOpen])

  // Enter confirms the panel set (design: "nebo klávesa Enter").
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'Enter' || e.repeat) return
      const t = e.target as HTMLElement | null
      if (t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.isContentEditable)) return
      if (pickerOpen || !panelOpen) return
      if (panelIdx >= 0) { e.preventDefault(); confirmSet(activeIdx, panelIdx) }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeIdx, panelIdx, items, pickerOpen, panelOpen])

  if (loading) return <div style={{ color: 'var(--muted)', padding: 24 }}>Načítání…</div>
  if (!workout) return <div style={{ color: 'var(--muted)', padding: 24 }}>Trénink nenalezen.</div>

  const split = workout.split_type
  const accent = splitColor(split)

  // ---------- blocks ----------
  // Confirmed / total working sets across the whole workout (warm-ups excluded).
  const setProgress = totalSets ? doneSets / totalSets : 0

  const header = (
    <div style={{ marginBottom: 14 }}>
    <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
      <button onClick={() => router.push('/trenink')} aria-label="Zpět" style={{ minWidth: 44, minHeight: 44, display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'var(--card)', border: '1px solid var(--border)', borderRadius: 12, color: 'var(--text)', cursor: 'pointer', flexShrink: 0 }}><ChevronLeft size={22} /></button>
      {split && <span style={{ fontSize: 12, fontWeight: 800, letterSpacing: 0.4, color: '#fff', background: accent, borderRadius: 8, padding: '5px 10px', textTransform: 'uppercase', flexShrink: 0 }}>{split}</span>}
      {isMobile ? (
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontSize: 15, fontWeight: 700, color: 'var(--text)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
            {active ? active.exercise.name : 'Dnes'}
          </div>
          <div style={{ fontSize: 12, color: 'var(--muted)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
            {clockLabel} · {doneSets} z {totalSets} sérií
          </div>
        </div>
      ) : (
        // Design: date, counter and bar sit together on the left; the empty
        // space is between the bar and the finish button, not before the bar.
        <>
          <span style={{ fontSize: 15, fontWeight: 700, color: 'var(--text)', flexShrink: 0 }}>Dnes</span>
          <span style={{ fontSize: 13, color: 'var(--muted)', flexShrink: 0 }}>
            {clockLabel} · {doneSets} z {totalSets} sérií
          </span>
          <div style={{ width: 340, height: 6, borderRadius: 999, background: 'var(--input-bg)', overflow: 'hidden', flexShrink: 0, marginLeft: 6 }}>
            <div style={{ width: `${setProgress * 100}%`, height: '100%', background: '#E8192C', borderRadius: 999, transition: 'width .3s' }} />
          </div>
          <div style={{ flex: 1 }} />
        </>
      )}
      {finished ? (
        <button onClick={resume} style={{ minHeight: 44, padding: '0 16px', background: '#E8192C', border: 'none', borderRadius: 12, color: '#fff', fontSize: 14, fontWeight: 700, cursor: 'pointer', flexShrink: 0, display: 'flex', alignItems: 'center', gap: 7 }}>
          <RotateCcw size={16} /> {isMobile ? 'Pokračovat' : 'Pokračovat v tréninku'}
        </button>
      ) : (
        <button onClick={finish} style={{ minHeight: 44, padding: '0 16px', background: '#10b981', border: 'none', borderRadius: 12, color: '#fff', fontSize: 14, fontWeight: 700, cursor: 'pointer', flexShrink: 0 }}>{isMobile ? 'Hotovo' : 'Ukončit trénink'}</button>
      )}
    </div>
    {/* Mobile: the bar doesn't fit the row, so it sits full-width underneath. */}
    {isMobile && (
      <div style={{ height: 4, borderRadius: 999, background: 'var(--input-bg)', overflow: 'hidden', marginTop: 10 }}>
        <div style={{ width: `${setProgress * 100}%`, height: '100%', background: '#E8192C', borderRadius: 999, transition: 'width .3s' }} />
      </div>
    )}
    </div>
  )

  const exerciseRow = (it: ActiveExercise, i: number) => {
    const isActive = i === activeIdx
    const done = it.sets.filter(s => s.confirmed && !s.is_warmup).length
    const total = it.sets.filter(s => !s.is_warmup).length
    const prev = it.previous[0]
    return (
      <button key={it.exercise.id} onClick={() => { setActiveIdx(i); setSelectedKey(null); setPanelOpen(false) }} style={{
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
      <div className="hide-scrollbar" style={{ display: 'flex', gap: 6, overflowX: 'auto', paddingBottom: 2 }}>
        {items.map((it, i) => {
          const isActive = i === activeIdx
          const done = it.sets.filter(s => s.confirmed && !s.is_warmup).length
          const total = it.sets.filter(s => !s.is_warmup).length
          return (
            <button key={it.exercise.id} onClick={() => { setActiveIdx(i); setSelectedKey(null); setPanelOpen(false) }} style={{
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
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
            <span style={{ fontSize: 20, fontWeight: 800, color: 'var(--text)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{active.exercise.name}</span>
            {/* Target is optional: without it the app just doesn't advise. */}
            <button
              onClick={() => setTargetEdit(activeTarget ?? { sets: 3, reps: 10 })}
              disabled={finished}
              style={{
                display: 'flex', alignItems: 'center', gap: 5, minHeight: 28, padding: '0 9px', borderRadius: 999,
                border: `1px solid ${activeTarget ? 'var(--border)' : 'transparent'}`,
                background: activeTarget ? 'var(--input-bg)' : 'transparent',
                color: 'var(--muted)', fontSize: 12, fontWeight: 600, cursor: finished ? 'default' : 'pointer', flexShrink: 0,
              }}>
              <TargetIcon size={13} />
              {activeTarget ? `cíl ${activeTarget.sets}×${activeTarget.reps}` : 'nastavit cíl'}
            </button>
          </div>
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
            const badge = s.confirmed && !s.is_warmup ? setBadge(s.weight, s.reps, active.previous, workingNo - 1, prevMax) : null
            // Zhoršení i „= minule" tlumeně — je to fakt, ne chyba. Červená
            // zůstává PR, zelená zlepšení.
            const badgeColor = badge?.kind === 'pr' ? '#E8192C' : badge?.kind === 'up' ? '#10b981' : 'var(--muted)'
            const isPanel = setIdx === panelIdx
            const grey = !s.confirmed && s.prefilled
            // Rada patří TOP SÉRII. Série 1–2 jsou u rampy náběh a appka je neřeší,
            // takže pod nimi nemá co vysvítit.
            const showAdvice = advice && setIdx === topRowIdx
            return (
              <Fragment key={s.key}>
              <div style={{
                display: 'flex', alignItems: 'center', gap: 10, padding: '8px 10px', borderRadius: 12, minHeight: 54,
                // Green = "counts towards stats" — every working set, confirmed or not.
                // Warm-ups never count, so they stay neutral (no frame). Red is reserved
                // for primary/destructive actions and has no place on a set row.
                border: `1px solid ${s.is_warmup ? 'transparent' : isPanel ? 'rgba(16,185,129,0.6)' : 'rgba(16,185,129,0.32)'}`,
                background: s.is_warmup ? 'var(--input-bg)' : s.confirmed ? 'rgba(16,185,129,0.07)' : 'transparent',
              }}>
                <span style={{ width: 22, fontSize: 13, fontWeight: 700, color: s.is_warmup ? '#d97706' : 'var(--muted)', flexShrink: 0, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>{idxLabel}</span>
                <button onClick={() => { if (finished) return; setSelectedKey(s.key); setPanelOpen(true) }} disabled={finished} style={{ flex: 1, minWidth: 0, minHeight: 40, background: 'transparent', border: 'none', cursor: 'pointer', textAlign: 'left', color: grey ? 'var(--muted)' : 'var(--text)', fontSize: 18, fontWeight: 700, touchAction: 'manipulation', display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                  <span>{fmtWeight(s.weight)} kg <span style={{ color: 'var(--muted)', fontWeight: 500 }}>×</span> {s.reps}</span>
                  {s.is_warmup && <span style={{ fontSize: 11, color: '#d97706', fontWeight: 600 }}>warm-up · nepočítá se</span>}
                  {s.to_failure && <span style={{ display: 'inline-flex', alignItems: 'center', gap: 3, fontSize: 11, color: '#7c3aed', fontWeight: 600 }}><Zap size={12} /> do selhání</span>}
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
              {showAdvice && (
                <div style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '0 10px', marginTop: -2, fontSize: 12, color: adviceColor(advice.kind), minWidth: 0 }}>
                  {advice.kind === 'stagnation' ? <Lightbulb size={13} style={{ flexShrink: 0 }} /> : <TrendingUp size={13} style={{ flexShrink: 0 }} />}
                  <span style={{ overflow: 'hidden', textOverflow: 'ellipsis' }}>{advice.short}</span>
                </div>
              )}
              </Fragment>
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

  const stepperPanel = active && panelSet && !finished && panelOpen && (
    <div ref={panelRef} style={{ background: 'var(--card)', border: '1px solid var(--border)', borderRadius: isMobile ? 22 : 16, padding: isMobile ? '14px 16px 16px' : 16, boxShadow: isMobile ? '0 -6px 24px rgba(0,0,0,0.18)' : 'var(--shadow)' }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10, marginBottom: 10 }}>
        <span style={{ fontSize: 12, fontWeight: 800, color: '#E8192C', letterSpacing: 0.4, flexShrink: 0 }}>SÉRIE {panelSetNo}</span>
        <span style={{ flex: 1, textAlign: 'right', fontSize: 12, color: 'var(--muted)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
          {panelPrev ? `minule: ${panelPrev.weight_kg == null ? 'vlastní' : fmtWeight(Number(panelPrev.weight_kg))} × ${panelPrev.reps ?? '?'}` : 'nová série'}{panelSet.prefilled ? ' · předvyplněno' : ''}
        </span>
        <button onClick={() => setPanelOpen(false)} aria-label="Zavřít panel" style={{ minWidth: 36, minHeight: 36, marginRight: -6, display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'transparent', border: 'none', borderRadius: 8, color: 'var(--muted)', cursor: 'pointer', flexShrink: 0, touchAction: 'manipulation' }}><X size={18} /></button>
      </div>
      <div style={{ display: isMobile ? 'flex' : 'grid', flexDirection: 'column', gridTemplateColumns: isMobile ? undefined : '1fr 1fr', gap: 12, marginBottom: 12 }}>
        <StepperField label="Váha" unit="kg" value={panelSet.weight} step={stepForWeight(panelSet.weight, active.exercise.name)} decimal
          onChange={v => patchSet(activeIdx, panelIdx, { weight: v })} />
        <StepperField label="Opakování" value={panelSet.reps} step={REP_STEP}
          onChange={v => patchSet(activeIdx, panelIdx, { reps: v })} />
      </div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
        <button onClick={() => toggleWarmup(activeIdx, panelIdx)} aria-label="Rozehřívací série" title="Warm-up (nepočítá se)" style={{ width: isMobile ? 64 : 52, height: isMobile ? 64 : 52, flexShrink: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', borderRadius: 14, border: `1px solid ${panelSet.is_warmup ? '#d97706' : 'var(--border)'}`, background: panelSet.is_warmup ? '#fef3c7' : 'var(--input-bg)', color: panelSet.is_warmup ? '#d97706' : 'var(--muted)', cursor: 'pointer', touchAction: 'manipulation' }}><Flame size={22} /></button>
        <button onClick={() => confirmSet(activeIdx, panelIdx)} style={{ flex: 1, minHeight: isMobile ? 64 : 52, background: '#E8192C', border: 'none', borderRadius: 14, color: '#fff', fontSize: 17, fontWeight: 700, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8, boxShadow: '0 4px 14px rgba(232, 25, 44,0.35)', touchAction: 'manipulation' }}>
          <Check size={22} /> Potvrdit sérii
        </button>
        {/* „Do selhání" napravo od potvrzení — panel je pak symetrický:
            plamínek | Potvrdit sérii | blesk. Fialová schválně jiná než
            oranžová u warm-upu, ať se ty dva stavy nepletou. */}
        <button onClick={() => toggleFailure(activeIdx, panelIdx)} aria-label="Série do selhání" title="Do selhání (zatím jen záznam)" style={{ width: isMobile ? 64 : 52, height: isMobile ? 64 : 52, flexShrink: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', borderRadius: 14, border: `1px solid ${panelSet.to_failure ? '#7c3aed' : 'var(--border)'}`, background: panelSet.to_failure ? 'rgba(124,58,237,0.14)' : 'var(--input-bg)', color: panelSet.to_failure ? '#7c3aed' : 'var(--muted)', cursor: 'pointer', touchAction: 'manipulation' }}><Zap size={22} /></button>
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
            { k: '1RM est.', v: exStats?.oneRM ? `${exStats.oneRM} kg` : '—', accent: false, muted: false },
            { k: 'Objem dnes', v: exStats?.todayVol ? fmtTonnage(exStats.todayVol) : '—', accent: false, muted: false },
            // V jiné posilovně se neporovnává — karta ukazuje jen dnešní čísla.
            ...(workout.other_gym ? [] : [{
              k: 'Vs. minule',
              // Rozdělaný cvik se neporovnává — číslo by bylo záporné z principu.
              v: exStats?.pendingCompare ? 'po dokončení'
                : exStats?.delta == null ? '—'
                : `${exStats.delta >= 0 ? '+' : ''}${fmtWeight(exStats.delta)} %`,
              accent: (exStats?.delta ?? 0) > 0,
              muted: !!exStats?.pendingCompare,
            }]),
          ].map(r => (
            <div key={r.k} style={{ display: 'flex', justifyContent: 'space-between', gap: 8, fontSize: 13 }}>
              <span style={{ color: 'var(--muted)', flexShrink: 0 }}>{r.k}</span>
              <span style={{ fontWeight: r.muted ? 400 : 700, color: r.accent ? '#10b981' : r.muted ? 'var(--muted)' : 'var(--text)', textAlign: 'right' }}>{r.v}</span>
            </div>
          ))}
        </div>
        {workout.other_gym && (
          <div style={{ display: 'flex', alignItems: 'center', gap: 5, marginTop: 8, fontSize: 11, color: 'var(--muted)' }}>
            <MapPin size={12} style={{ flexShrink: 0 }} /> Jiná posilovna — bez porovnání s minulem.
          </div>
        )}
      </div>

      {/* Previous session for this exercise */}
      {active.previous.length > 0 && (
        <div style={{ background: 'var(--card)', border: '1px solid var(--border)', borderRadius: 16, padding: 14, boxShadow: 'var(--shadow)' }}>
          {/* Zdrojem je poslední trénink S TÍMHLE CVIKEM, ne nutně stejný split
              — popisek proto split netvrdí. */}
          <div style={{ fontSize: 11, letterSpacing: 0.6, color: 'var(--muted)', fontWeight: 700, marginBottom: 8 }}>
            MINULE{active.prevDate ? ` · ${shortDate(active.prevDate)}` : ''}
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
    // Mobile: the actionable block is pushed to the thumb zone (design screen 2);
    // the "Zatím žádný cvik" card stays at the top. Desktop keeps normal flow.
    <div style={{
      maxWidth: 520, margin: '0 auto', width: '100%',
      flex: isMobile ? 1 : undefined,
      display: isMobile ? 'flex' : undefined,
      flexDirection: isMobile ? 'column' : undefined,
      minHeight: isMobile ? 0 : undefined,
    }}>
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

      <div style={{ marginTop: isMobile ? 'auto' : 12, paddingTop: isMobile ? 16 : 0, display: 'flex', flexDirection: 'column', gap: 12 }}>
      {tmpl.groups.length > 0 && (
        <div style={{ background: 'var(--card)', border: '1px solid var(--border)', borderRadius: 16, padding: 14, boxShadow: 'var(--shadow)' }}>
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

      <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
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
    </div>
  )

  return (
    <div style={{
      maxWidth: 1440, margin: '0 auto',
      paddingBottom: isMobile && items.length && !finished && panelOpen ? MOBILE_PANEL_SPACE : 24,
      minHeight: isMobile && items.length === 0 ? '100%' : undefined,
      display: isMobile && items.length === 0 ? 'flex' : undefined,
      flexDirection: isMobile && items.length === 0 ? 'column' : undefined,
    }}>
      {header}

      {finished && (
        workout.auto_finished ? (
          <div style={{ display: 'flex', alignItems: 'flex-start', gap: 8, marginBottom: 14, padding: '10px 14px', borderRadius: 12, background: 'rgba(217,119,6,0.08)', border: '1px solid rgba(217,119,6,0.4)', color: 'var(--muted)', fontSize: 13, lineHeight: 1.45 }}>
            <Timer size={16} color="#d97706" style={{ flexShrink: 0, marginTop: 1 }} />
            <span>
              <b style={{ color: '#d97706' }}>Ukončeno automaticky</b> — {IDLE_LIMIT_MIN} min se nepotvrdila žádná série.
              Délka {fmtDuration(workout.duration_min)} je počítaná do poslední série + {TAIL_MIN} min na dokončení.
              Pro zápis klikni na „Pokračovat{isMobile ? '' : ' v tréninku'}".
            </span>
          </div>
        ) : (
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 14, padding: '10px 14px', borderRadius: 12, background: 'var(--input-bg)', border: '1px solid var(--border)', color: 'var(--muted)', fontSize: 13 }}>
            <Check size={16} color="#10b981" />
            Trénink je ukončený — série si můžeš prohlížet, pro zápis klikni na „Pokračovat{isMobile ? '' : ' v tréninku'}".
          </div>
        )
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

      <Modal isOpen={!!targetEdit} onClose={() => setTargetEdit(null)} title={`Cíl — ${active?.exercise.name ?? 'cvik'}`}>
        {targetEdit && (
          <div>
            <div style={{ fontSize: 13, color: 'var(--muted)', marginBottom: 16 }}>
              Kolik sérií a opakování chceš zvládnout, než přidáš váhu. Nastavuje se jednou a platí i pro další tréninky. O kolik přidat spočítá appka podle aktuální váhy.
            </div>
            <div style={{ display: 'flex', gap: 12, marginBottom: 16 }}>
              <StepperField label="Série" value={targetEdit.sets} step={1} min={1}
                onChange={v => setTargetEdit(t => t && { ...t, sets: Math.min(20, Math.max(1, v)) })} />
              <StepperField label="Opakování" value={targetEdit.reps} step={1} min={1}
                onChange={v => setTargetEdit(t => t && { ...t, reps: Math.min(100, Math.max(1, v)) })} />
            </div>
            <button onClick={() => saveTarget(targetEdit)} style={{ width: '100%', minHeight: 52, background: '#E8192C', border: 'none', borderRadius: 12, color: '#fff', fontSize: 16, fontWeight: 700, cursor: 'pointer' }}>
              Uložit cíl {targetEdit.sets}×{targetEdit.reps}
            </button>
            {activeTarget && (
              <button onClick={() => saveTarget(null)} style={{ width: '100%', minHeight: 44, marginTop: 10, background: 'transparent', border: 'none', color: 'var(--muted)', fontSize: 13, cursor: 'pointer' }}>
                Zrušit cíl
              </button>
            )}
          </div>
        )}
      </Modal>
      <Modal isOpen={pickerOpen} onClose={() => setPickerOpen(false)} title="Přidat cvik" bodyFill>
        <ExercisePicker exercises={catalog} onPick={addExercise} onAddCustom={addCustomExercise} />
      </Modal>
      {confirmDialog}
      {toast && <Toast message={toast.message} type={toast.type} onClose={hideToast} />}
    </div>
  )
}
