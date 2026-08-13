'use client'
import { useCallback, useEffect, useMemo, useState } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import type { Workout, SplitType } from '@/lib/types'
import { useLiveData } from '@/lib/useLiveData'
import { useToday } from '@/lib/useToday'
import { useConfirm } from '@/components/ConfirmDialog'
import { Toast, useToast } from '@/components/Toast'
import { SPLITS, nextSplit, splitColor, volume, fmtTonnage, pctDelta, topSet, fmtSet, fmtWeight, startOfWeek, fmtDuration } from '@/lib/gym'
import { autoFinishStale, IDLE_LIMIT_MIN, TAIL_MIN } from '@/lib/autoFinish'
import ExportButton from '@/components/gym/ExportButton'
import { Plus, Dumbbell, ChevronRight, Trash2, TrendingUp, MapPin } from 'lucide-react'

type SetRow = { workout_id: string; exercise_id: string; weight_kg: number | null; reps: number | null; is_warmup: boolean; order_index: number }
type Derived = { count: number; vol: number; summary: { name: string; set: string }[]; top: string; pr: boolean }

const DAYS = ['Po', 'Út', 'St', 'Čt', 'Pá', 'So', 'Ne']

// "dnes" / "včera" / "29. 7."
//
// Dnešek přichází zvenčí (`useToday`), ne z `new Date()` uvnitř: appka nechaná
// otevřená přes půlnoc se nemá proč překreslit a včerejší trénink by se dál
// tvářil jako dnešní.
function relDate(iso: string, todayKey: string): string {
  const d = new Date(iso)
  const [ty, tm, td] = todayKey.split('-').map(Number)
  const today = new Date(ty, tm - 1, td)
  const day = new Date(d.getFullYear(), d.getMonth(), d.getDate())
  const diff = Math.round((today.getTime() - day.getTime()) / 86400000)
  if (diff === 0) return 'Dnes'
  if (diff === 1) return 'Včera'
  return d.toLocaleDateString('cs-CZ', { day: 'numeric', month: 'numeric' })
}

export default function TreninkPage() {
  const router = useRouter()
  const [workouts, setWorkouts] = useState<Workout[]>([])
  const [derived, setDerived] = useState<Record<string, Derived>>({})
  const [loading, setLoading] = useState(true)
  const [split, setSplit] = useState<SplitType>('Push')
  const [customMode, setCustomMode] = useState(false)
  const [customName, setCustomName] = useState('')
  const [otherGym, setOtherGym] = useState(false)
  const [starting, setStarting] = useState(false)
  const [deleting, setDeleting] = useState<string | null>(null)
  const [filter, setFilter] = useState<'Vše' | SplitType>('Vše')
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
    // Úklid zapomenutých tréninků. Běží při každém načtení seznamu, takže se
    // uklidí i tréninky, které uživatel od té doby vůbec neotevřel.
    const swept = await autoFinishStale(supabase)
    if (swept.error) showToast(`Automatické ukončení selhalo: ${swept.error}`, 'error')
    else if (swept.closed.length) showToast(swept.closed.length === 1
      ? `Zapomenutý trénink byl automaticky ukončen (${IDLE_LIMIT_MIN} min bez série)`
      : `${swept.closed.length} zapomenuté tréninky byly automaticky ukončeny`)
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
      // Per-split max volume → mark a workout as PR when it's the best session of its split.
      const partial: Record<string, { count: number; vol: number; summary: { name: string; set: string }[]; top: string }> = {}
      const splitMax = new Map<string, number>()
      for (const w of list) {
        const rows = byWorkout.get(w.id) || []
        const working = rows.filter(r => !r.is_warmup)
        const perEx = new Map<string, SetRow[]>()
        for (const r of rows) { const g = perEx.get(r.exercise_id) || []; g.push(r); perEx.set(r.exercise_id, g) }
        const exOrder = [...perEx.entries()].sort((a, b) => (a[1][0]?.order_index ?? 0) - (b[1][0]?.order_index ?? 0))
        const summary = exOrder.slice(0, 3).map(([exId, exSets]) => ({ name: names.get(exId) || 'Cvik', set: fmtSet(topSet(exSets)) })).filter(s => s.set)
        // Single heaviest working set of the whole session → "top: Bench press 85 kg × 6"
        const best = working.reduce<SetRow | null>((b, r) => (!b || (Number(r.weight_kg) || 0) > (Number(b.weight_kg) || 0) ? r : b), null)
        const top = best ? `${names.get(best.exercise_id) || 'Cvik'} ${best.weight_kg == null ? 'vlastní' : `${fmtWeight(Number(best.weight_kg))} kg`} × ${best.reps ?? '?'}` : ''
        const vol = volume(rows)
        partial[w.id] = { count: working.length, vol, summary, top }
        const k = w.split_type || ''
        splitMax.set(k, Math.max(splitMax.get(k) || 0, vol))
      }
      const d: Record<string, Derived> = {}
      for (const w of list) {
        const p = partial[w.id]
        d[w.id] = { ...p, pr: p.vol > 0 && p.vol === splitMax.get(w.split_type || '') }
      }
      setDerived(d)
    } else {
      setDerived({})
    }
    setLoading(false)
    // showToast se schválně nesleduje — mění identitu při každém renderu a
    // load() visí na useEffect + useLiveData, takže by se načítání zacyklilo.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  useEffect(() => { load() }, [load])
  useLiveData(['workouts', 'workout_sets'], load)
  // Půlnoc: štítky „Dnes/Včera" i hranice týdne se počítají z data, které se
  // jinak při otevřené appce nezmění. Poll v `useLiveData` běží jen ve
  // viditelné záložce, takže se na něj v tomhle spolehnout nedá.
  const today = useToday()

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
    // `today` v závislostech: přes půlnoc z neděle na pondělí se musí přepočítat
    // i hranice týdne, jinak by statistika zůstala viset na minulém týdnu.
  }, [workouts, derived, today])

  // Per-day bars for the current week, colored by that day's split.
  const weekBars = useMemo(() => {
    const mon = startOfWeek(new Date()).getTime()
    const days = DAYS.map(label => ({ label, vol: 0, split: null as string | null }))
    for (const w of workouts) {
      const t = new Date(w.date).getTime()
      if (t < mon || t >= mon + 7 * 86400000) continue
      const idx = (new Date(w.date).getDay() + 6) % 7
      days[idx].vol += derived[w.id]?.vol || 0
      days[idx].split = w.split_type
    }
    const max = Math.max(1, ...days.map(d => d.vol))
    return days.map(d => ({ ...d, h: d.vol ? Math.max(0.16, d.vol / max) : 0 }))
    // Stejně jako u týdenní statistiky: přes půlnoc se musí přepočítat i sloupce.
  }, [workouts, derived, today])

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
    const { data, error } = await supabase.from('workouts').insert({ user_id: user.id, split_type, other_gym: otherGym }).select().single()
    setStarting(false)
    if (error || !data) return
    router.push(`/trenink/${data.id}`)
  }

  async function deleteWorkout(id: string) {
    const w = workouts.find(x => x.id === id)
    const what = w?.split_type ? `trénink ${w.split_type} (${relDate(w.date, today).toLowerCase()})` : 'tento trénink'
    if (!await confirm(`Smazat ${what} i se všemi sériemi? Nejde to vrátit.`)) return
    setDeleting(id)
    const supabase = createClient()
    const { error } = await supabase.from('workouts').delete().eq('id', id)
    setDeleting(null)
    if (error) { showToast(`Smazání selhalo: ${error.message}`, 'error'); return }
    setWorkouts(prev => prev.filter(x => x.id !== id))
    showToast('Trénink smazán')
  }

  const shown = filter === 'Vše' ? workouts : workouts.filter(w => w.split_type === filter)

  // ---------- reusable blocks ----------
  const newPanel = (
    <div style={{ background: 'var(--card)', border: '1px solid var(--border)', borderRadius: 16, padding: 16, boxShadow: 'var(--shadow)' }}>
      <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', marginBottom: 12 }}>
        <div style={{ fontSize: 11, letterSpacing: 0.6, color: 'var(--muted)', fontWeight: 700 }}>{isMobile ? 'TYP TRÉNINKU' : 'NOVÝ TRÉNINK'}</div>
        {!customMode && <div style={{ fontSize: 12, color: 'var(--muted)' }}>na řadě je <span style={{ color: '#E8192C', fontWeight: 700 }}>{split}</span></div>}
      </div>
      {/* Mobile: one row of 4 (per design); desktop: 2×2 */}
      <div style={{ display: 'grid', gridTemplateColumns: isMobile ? 'repeat(4, minmax(0,1fr))' : '1fr 1fr', gap: 8, marginBottom: 12 }}>
        {SPLITS.map(s => {
          const active = !customMode && split === s
          return (
            <button key={s} type="button" onClick={() => { setCustomMode(false); setSplit(s) }} style={{
              minHeight: 52, borderRadius: 12, fontSize: 15, fontWeight: 700, cursor: 'pointer', touchAction: 'manipulation',
              border: `1px solid ${active ? splitColor(s) : 'var(--border)'}`,
              background: active ? splitColor(s) : 'var(--input-bg)', color: active ? '#fff' : 'var(--text)',
            }}>{s}</button>
          )
        })}
        <button type="button" onClick={() => setCustomMode(true)} style={{
          minHeight: 52, borderRadius: 12, fontSize: 15, fontWeight: 700, cursor: 'pointer', touchAction: 'manipulation',
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
          style={{ width: '100%', minHeight: 48, marginBottom: 12, padding: '0 14px', borderRadius: 12, border: '1px solid var(--border)', background: 'var(--input-bg)', color: 'var(--text)', fontSize: 15, boxSizing: 'border-box' }}
        />
      )}
      {!isMobile && lastOfSplit && lastOfSplit.summary.length > 0 && (
        <div style={{ background: 'var(--input-bg)', border: '1px solid var(--border)', borderRadius: 12, padding: 12, marginBottom: 12 }}>
          <div style={{ fontSize: 10, letterSpacing: 0.5, color: 'var(--muted)', fontWeight: 700, marginBottom: 8 }}>
            MINULÝ {String(lastOfSplit.workout.split_type || '').toUpperCase()} · {relDate(lastOfSplit.workout.date, today)}
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
      {/* Jiná posilovna = jiné stroje a jiné váhy. Vypne porovnávání a takový
          trénink se pak nepoužije jako referenční pro další. */}
      <button
        type="button"
        onClick={() => setOtherGym(v => !v)}
        aria-pressed={otherGym}
        style={{
          width: '100%', minHeight: 48, marginBottom: 12, padding: '0 12px', borderRadius: 12,
          display: 'flex', alignItems: 'center', gap: 9, cursor: 'pointer', touchAction: 'manipulation',
          border: `1px solid ${otherGym ? '#7c3aed' : 'var(--border)'}`,
          background: otherGym ? 'rgba(124,58,237,0.12)' : 'var(--input-bg)',
          color: otherGym ? '#7c3aed' : 'var(--muted)',
          fontSize: 14, fontWeight: 600, textAlign: 'left',
        }}>
        <MapPin size={17} style={{ flexShrink: 0 }} />
        <span style={{ flex: 1 }}>Jiná posilovna</span>
        <span style={{ fontSize: 11, fontWeight: 600, opacity: 0.85 }}>{otherGym ? 'bez porovnání' : 'vypnuto'}</span>
      </button>
      <button onClick={startWorkout} disabled={starting || (customMode && !customName.trim())} style={{ width: '100%', minHeight: isMobile ? 60 : 52, background: '#E8192C', border: 'none', borderRadius: 14, color: '#fff', fontSize: isMobile ? 17 : 16, fontWeight: 700, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8, boxShadow: '0 4px 14px rgba(232, 25, 44,0.35)', opacity: (starting || (customMode && !customName.trim())) ? 0.6 : 1 }}>
        <Plus size={20} /> {starting ? 'Zakládám…' : customMode ? 'Začít' : `Začít ${split}`}
      </button>
    </div>
  )

  // Mobile: three separate labelled tiles (design has no bar chart on mobile).
  const weekTiles = (
    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, minmax(0,1fr))', gap: 8 }}>
      {[
        { label: 'TÝDEN', value: String(week.count), unit: '', sub: 'tréninky', accent: false },
        { label: 'OBJEM', value: week.vol ? fmtTonnage(week.vol).replace(/\s*(t|kg)$/, '') : '0', unit: week.vol ? (week.vol >= 1000 ? 't' : 'kg') : '', sub: week.delta != null ? `${week.delta >= 0 ? '+' : ''}${week.delta} %` : 'objem', accent: week.delta != null && week.delta >= 0 },
        { label: 'SÉRIE', value: String(week.sets), unit: '', sub: 'bez warm-up', accent: false },
      ].map((t, i) => (
        <div key={i} style={{ background: 'var(--card)', border: '1px solid var(--border)', borderRadius: 14, padding: '12px 10px', boxShadow: 'var(--shadow)', minWidth: 0 }}>
          <div style={{ fontSize: 11, fontWeight: 600, letterSpacing: 0.66, color: 'var(--muted)' }}>{t.label}</div>
          <div style={{ fontSize: 24, fontWeight: 800, color: 'var(--text)', lineHeight: 1.1, marginTop: 4 }}>
            {t.value}{t.unit && <span style={{ fontSize: 13, fontWeight: 700, marginLeft: 2 }}>{t.unit}</span>}
          </div>
          <div style={{ fontSize: 11, color: t.accent ? '#10b981' : 'var(--muted)', marginTop: 3, display: 'flex', alignItems: 'center', gap: 3, overflow: 'hidden', whiteSpace: 'nowrap' }}>
            {t.accent && <TrendingUp size={12} />}{t.sub}
          </div>
        </div>
      ))}
    </div>
  )

  const weekCard = (
    <div style={{ background: 'var(--card)', border: '1px solid var(--border)', borderRadius: 16, padding: 16, boxShadow: 'var(--shadow)' }}>
      <div style={{ fontSize: 11, letterSpacing: 0.6, color: 'var(--muted)', fontWeight: 700, marginBottom: 12 }}>TENTO TÝDEN</div>
      <div style={{ display: 'flex', gap: 16, marginBottom: 16 }}>
        {[
          { big: String(week.count), small: 'tréninky', accent: false },
          { big: week.vol ? fmtTonnage(week.vol) : '0', small: week.delta != null ? `${week.delta >= 0 ? '+' : ''}${week.delta} % objem` : 'objem', accent: week.delta != null && week.delta >= 0 },
          { big: String(week.sets), small: 'sérií', accent: false },
        ].map((s, i) => (
          <div key={i} style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontSize: 26, fontWeight: 800, color: 'var(--text)', lineHeight: 1 }}>{s.big}</div>
            <div style={{ fontSize: 11, color: s.accent ? '#10b981' : 'var(--muted)', marginTop: 5 }}>{s.small}</div>
          </div>
        ))}
      </div>
      <div style={{ display: 'flex', alignItems: 'flex-end', gap: 6, height: 64 }}>
        {weekBars.map((d, i) => (
          <div key={i} style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 5 }}>
            <div style={{ width: '100%', height: 48, display: 'flex', alignItems: 'flex-end' }}>
              <div style={{ width: '100%', height: `${Math.max(6, d.h * 100)}%`, borderRadius: 5, background: d.split ? splitColor(d.split) : 'var(--border)', opacity: d.split ? 1 : 0.6 }} />
            </div>
            <div style={{ fontSize: 10, color: 'var(--muted)' }}>{d.label}</div>
          </div>
        ))}
      </div>
    </div>
  )

  const historyBlock = (
    <div>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12, flexWrap: 'wrap', gap: 8 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <span style={{ fontSize: 11, letterSpacing: 0.6, color: 'var(--muted)', fontWeight: 700 }}>HISTORIE</span>
          <ExportButton compact={isMobile} />
        </div>
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
            // Délka je dopočítaná do poslední série, ne naměřená — ať je to na
            // řádku vidět, jinak číslo vypadá jako změřený čas.
            const gymBadge = w.other_gym ? (
              <span title="Jiná posilovna — nepoužívá se jako referenční trénink" style={{ display: 'inline-flex', alignItems: 'center', gap: 3, fontSize: 10, fontWeight: 700, color: '#7c3aed', border: '1px solid rgba(124,58,237,0.45)', borderRadius: 6, padding: '2px 5px', flexShrink: 0 }}><MapPin size={10} /> jiná</span>
            ) : null
            const autoBadge = w.auto_finished ? (
              <span title={`Ukončeno automaticky po ${IDLE_LIMIT_MIN} min bez série — délka je do poslední série + ${TAIL_MIN} min na dokončení`} style={{ fontSize: 10, fontWeight: 800, letterSpacing: 0.3, color: '#d97706', border: '1px solid rgba(217,119,6,0.45)', borderRadius: 6, padding: '2px 5px', flexShrink: 0, textTransform: 'uppercase' }}>auto</span>
            ) : null
            return (
              <div key={w.id} style={{ display: 'flex', alignItems: 'stretch', background: 'var(--card)', border: '1px solid var(--border)', borderRadius: 14, boxShadow: 'var(--shadow)', overflow: 'hidden' }}>
                <div style={{ width: 4, background: splitColor(w.split_type), flexShrink: 0 }} />
                <button onClick={() => router.push(`/trenink/${w.id}`)} style={{ flex: 1, minWidth: 0, display: 'flex', alignItems: 'center', gap: 12, background: 'transparent', border: 'none', padding: '12px 4px 12px 12px', cursor: 'pointer', textAlign: 'left', touchAction: 'manipulation' }}>
                  {isMobile ? (
                    // Design: badge + date + "· 52 min" on line 1, "N sérií · top: …" on line 2
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 8, minWidth: 0 }}>
                        {w.split_type && <span style={{ fontSize: 11, fontWeight: 800, letterSpacing: 0.4, color: '#fff', background: splitColor(w.split_type), borderRadius: 8, padding: '4px 8px', flexShrink: 0, textTransform: 'uppercase' }}>{w.split_type}</span>}
                        <span style={{ fontSize: 15, fontWeight: 700, color: 'var(--text)' }}>{relDate(w.date, today)}</span>
                        {w.duration_min && <span style={{ fontSize: 12, color: 'var(--muted)' }}>· {fmtDuration(w.duration_min)}</span>}
                        {autoBadge}
                        {gymBadge}
                      </div>
                      <div style={{ fontSize: 12, color: 'var(--muted)', marginTop: 4, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                        {d?.count ?? 0} sérií{d?.top ? ` · top: ${d.top}` : ''}
                      </div>
                    </div>
                  ) : (
                    <>
                      {w.split_type && <span style={{ fontSize: 11, fontWeight: 800, letterSpacing: 0.4, color: '#fff', background: splitColor(w.split_type), borderRadius: 8, padding: '5px 9px', flexShrink: 0, textTransform: 'uppercase' }}>{w.split_type}</span>}
                      <div style={{ minWidth: 92, flexShrink: 0, display: 'flex', alignItems: 'center', gap: 6 }}>
                        <div style={{ fontSize: 15, fontWeight: 700, color: 'var(--text)' }}>{relDate(w.date, today)} <span style={{ fontSize: 12, fontWeight: 400, color: 'var(--muted)' }}>{d?.count ?? 0} sérií{w.duration_min ? ` · ${fmtDuration(w.duration_min)}` : ''}</span></div>
                        {autoBadge}
                        {gymBadge}
                      </div>
                      {d && d.summary.length > 0 && (
                        <div style={{ flex: 1, minWidth: 0, fontSize: 13, color: 'var(--muted)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                          {d.summary.map(s => `${s.name} ${s.set}`).join(' · ')}
                        </div>
                      )}
                    </>
                  )}
                  {d?.pr && <span style={{ fontSize: 10, fontWeight: 800, color: '#E8192C', border: '1px solid rgba(232,25,44,0.4)', borderRadius: 6, padding: '2px 6px', flexShrink: 0 }}>PR</span>}
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

  if (loading) return <div style={{ color: 'var(--muted)', padding: 24 }}>Načítání…</div>

  return (
    <div style={{ maxWidth: 1120, margin: '0 auto', paddingBottom: isMobile ? 0 : 24, minHeight: isMobile ? '100%' : undefined, display: isMobile ? 'flex' : 'block', flexDirection: 'column' }}>
      {/* Header — mobile per design: inline red icon, no subtitle */}
      {isMobile ? (
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 14 }}>
          <Dumbbell size={22} color="#E8192C" />
          <h1 style={{ fontSize: 26, fontWeight: 800, color: 'var(--text)', margin: 0, lineHeight: 1.1 }}>Trénink</h1>
        </div>
      ) : (
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 18 }}>
          <div style={{ width: 40, height: 40, borderRadius: 12, background: '#E8192C', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
            <Dumbbell size={22} color="#fff" />
          </div>
          <div>
            <h1 style={{ fontSize: 24, fontWeight: 800, color: 'var(--text)', margin: 0, lineHeight: 1.1 }}>Trénink</h1>
            {last && <div style={{ fontSize: 13, color: 'var(--muted)', marginTop: 2 }}>Poslední: {last.split_type || '—'} · {relDate(last.date, today).toLowerCase()}</div>}
          </div>
        </div>
      )}

      {isMobile ? (
        // Design order: week tiles → history → split panel pinned to the thumb zone.
        <div style={{ display: 'flex', flexDirection: 'column', gap: 16, flex: 1, minHeight: 0 }}>
          {weekTiles}
          {historyBlock}
          <div style={{ marginTop: 'auto', paddingTop: 8 }}>{newPanel}</div>
        </div>
      ) : (
        <div style={{ display: 'grid', gridTemplateColumns: 'minmax(320px, 400px) 1fr', gap: 20, alignItems: 'start' }}>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
            {newPanel}
            {weekCard}
          </div>
          {historyBlock}
        </div>
      )}

      {confirmDialog}
      {toast && <Toast message={toast.message} type={toast.type} onClose={hideToast} />}
    </div>
  )
}
