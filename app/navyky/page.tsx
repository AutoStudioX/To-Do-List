'use client'
import { useCallback, useEffect, useMemo, useState } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { Toast, useToast } from '@/components/Toast'
import Modal from '@/components/Modal'
import HabitIcon from '@/components/habits/HabitIcon'
import HabitForm from '@/components/habits/HabitForm'
import {
  metOn, ratio, streaks, dayCounts, dayWord, habitWord, lastDays, dayKey,
  trainingValues, isReadOnly, DAY_DONE_THRESHOLD, type Habit,
} from '@/lib/habits'
import { Plus, Check, BarChart3, Flame, Link2 } from 'lucide-react'

// Rozměry, rozestupy a radiusy jsou přesně z designu. Barvy jdou přes
// proměnné appky, aby sekce držela s motivem a přepínala se do světlého.
const C = {
  card: 'var(--card)',
  border: 'var(--border)',
  nested: 'var(--hover-bg)',      // #1E1F24 — vnořený chip, sekundární tlačítko
  sunken: 'var(--input-bg)',      // #1A1B1F / #101114 — prázdné tlačítko, hint
  track: 'var(--progress-track)', // #1C1D21 / #232429
  accent: 'var(--accent)',        // #E5484D
  accentDim: 'rgba(232,25,44,0.45)', // #8A2A2E — výplň baru u nesplněného cíle
  text: 'var(--text)',
  muted: 'var(--muted)',
}

const WINDOW_DAYS = 365

type Values = Record<string, number>

export default function NavykyPage() {
  const router = useRouter()
  const supabase = useMemo(() => createClient(), [])
  const [habits, setHabits] = useState<Habit[]>([])
  const [values, setValues] = useState<Values>({})
  const [counts, setCounts] = useState<number[]>([])
  const [loading, setLoading] = useState(true)
  const [isMobile, setIsMobile] = useState(false)
  const [formOpen, setFormOpen] = useState(false)
  const { toast, showToast, hideToast } = useToast()

  useEffect(() => {
    const check = () => setIsMobile(window.innerWidth <= 768)
    check()
    window.addEventListener('resize', check)
    return () => window.removeEventListener('resize', check)
  }, [])

  const today = dayKey(new Date())

  const load = useCallback(async () => {
    const { data: { session } } = await supabase.auth.getSession()
    const user = session?.user
    if (!user) { setLoading(false); return }

    const days = lastDays(WINDOW_DAYS)
    const from = days[0]

    const [{ data: hs, error: hErr }, { data: es, error: eErr }, { data: ws }] = await Promise.all([
      supabase.from('habits').select('*').eq('user_id', user.id).eq('archivovany', false).order('poradi'),
      supabase.from('habit_entries').select('habit_id, datum, hodnota').eq('user_id', user.id).gte('datum', from),
      // Návyk „trénink" se ČTE odsud — do habit_entries se pro něj nikdy nezapisuje.
      supabase.from('workouts').select('date').eq('user_id', user.id).gte('date', from),
    ])
    if (hErr || eErr) { showToast(`Načtení selhalo: ${(hErr || eErr)!.message}`, 'error'); setLoading(false); return }

    const list = (hs || []) as Habit[]
    const byHabit: Record<string, Record<string, number>> = {}
    for (const e of (es || []) as { habit_id: string; datum: string; hodnota: number }[]) {
      ;(byHabit[e.habit_id] ||= {})[e.datum] = Number(e.hodnota)
    }
    const workoutDays = new Set(((ws || []) as { date: string }[]).map(w => w.date))
    for (const h of list) {
      if (h.zdroj === 'trenink') byHabit[h.id] = trainingValues(days, workoutDays)
    }

    const perDay = days.map(d => Object.fromEntries(list.map(h => [h.id, byHabit[h.id]?.[d] ?? 0])))
    setHabits(list)
    setCounts(dayCounts(list, perDay))
    setValues(Object.fromEntries(list.map(h => [h.id, byHabit[h.id]?.[today] ?? 0])))
    setLoading(false)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [supabase, today])

  useEffect(() => { load() }, [load])

  /** Zápis dnešní hodnoty. Návyk z tréninku sem nikdy nedojde. */
  async function write(h: Habit, hodnota: number, hlaska: string) {
    if (isReadOnly(h)) return
    const prev = values[h.id] ?? 0
    setValues(v => ({ ...v, [h.id]: hodnota }))
    const { data: { session } } = await supabase.auth.getSession()
    const user = session?.user
    if (!user) {
      setValues(v => ({ ...v, [h.id]: prev }))
      showToast('Uložení selhalo: nejsi přihlášený', 'error')
      return
    }
    const { error } = await supabase.from('habit_entries')
      .upsert({ user_id: user.id, habit_id: h.id, datum: today, hodnota }, { onConflict: 'habit_id,datum' })
    if (error) {
      setValues(v => ({ ...v, [h.id]: prev }))   // vrátit, ať UI neukazuje neuložený stav
      showToast(`Uložení selhalo: ${error.message}`, 'error')
      return
    }
    // Dnešek je poslední den okna — přepočítat, ať série i hint sedí hned.
    setCounts(c => {
      if (!c.length) return c
      const next = [...c]
      const vals = { ...values, [h.id]: hodnota }
      next[next.length - 1] = habits.reduce((n, x) => n + (metOn(x, vals[x.id] ?? 0) ? 1 : 0), 0)
      return next
    })
    showToast(hlaska)
  }

  const toggle = (h: Habit) => {
    const on = (values[h.id] ?? 0) >= 1
    write(h, on ? 0 : 1, on ? `${h.nazev} odškrtnuto zpět` : `${h.nazev} splněno`)
  }
  const addStep = (h: Habit) => {
    const next = (values[h.id] ?? 0) + Number(h.krok ?? 0)
    write(h, next, `${h.nazev}: ${fmtNum(next)} ${h.jednotka ?? ''}`.trim())
  }
  const complete = (h: Habit) =>
    write(h, h.typ === 'bool' ? 1 : Number(h.cil ?? 1), `${h.nazev} splněno`)

  // ---------- odvozené ----------
  const total = habits.length
  const doneCount = habits.filter(h => metOn(h, values[h.id] ?? 0)).length
  const donePct = total ? Math.round(doneCount / total * 100) : 0
  const streak = counts.length ? streaks(counts).cur : 0
  const remaining = Math.max(0, DAY_DONE_THRESHOLD - doneCount)

  const dateLine = new Date().toLocaleDateString('cs-CZ', {
    weekday: isMobile ? 'short' : 'long', day: 'numeric', month: 'long',
  })

  // ---------- kusy ----------
  const primaryBtn: React.CSSProperties = {
    height: 44, padding: '0 20px', display: 'flex', alignItems: 'center', gap: 8,
    border: 'none', borderRadius: 11, background: C.accent, color: '#fff',
    fontSize: 15, fontWeight: 600, cursor: 'pointer', touchAction: 'manipulation',
  }
  const secondaryBtn: React.CSSProperties = {
    height: 44, padding: '0 20px', display: 'flex', alignItems: 'center', gap: 8,
    border: `1px solid ${C.border}`, borderRadius: 11, background: C.card, color: C.text,
    fontSize: 15, fontWeight: 500, cursor: 'pointer', touchAction: 'manipulation',
  }

  const progressBar = (pct: number, w?: number) => (
    <div style={{ width: w ?? '100%', height: 8, borderRadius: 99, background: C.track, overflow: 'hidden', flexShrink: w ? 0 : 1 }}>
      <div style={{ width: `${pct}%`, height: '100%', borderRadius: 99, background: C.accent, transition: 'width .14s ease-out' }} />
    </div>
  )

  const counter = (size: number, label: string) => (
    <div style={{ textAlign: isMobile ? 'left' : 'right' }}>
      <div style={{ fontSize: size, fontWeight: 600, color: C.text, letterSpacing: '-.01em' }}>
        {doneCount} <span style={{ color: C.muted, fontWeight: 400 }}>z {total}</span>
      </div>
      {!isMobile && <div style={{ fontSize: 13, color: C.muted, marginTop: 2 }}>{label}</div>}
    </div>
  )

  function habitCard(h: Habit) {
    const v = values[h.id] ?? 0
    const done = metOn(h, v)
    const pct = Math.round(ratio(h, v) * 100)
    const ro = isReadOnly(h)
    const tint = done ? C.accent : C.muted

    const chip = (
      <div style={{
        width: 44, height: 44, flexShrink: 0, borderRadius: 12, background: C.nested,
        display: 'flex', alignItems: 'center', justifyContent: 'center', color: tint,
      }}><HabitIcon name={h.ikona} size={20} /></div>
    )

    // Trénink se neodškrtává — místo tlačítka je statický indikátor bez
    // borderu a bez hoveru, aby nevypadal jako něco, na co se dá ťuknout.
    const boolControl = ro ? (
      <div
        title="Doplňuje se z tréninkové sekce"
        style={{
          width: isMobile ? 56 : 88, height: isMobile ? 48 : 56, flexShrink: 0,
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          borderRadius: isMobile ? 13 : 14, background: 'transparent',
          color: done ? C.accent : C.muted, opacity: done ? 1 : 0.45,
        }}>
        <Check size={isMobile ? 20 : 24} />
      </div>
    ) : (
      <button
        onClick={() => toggle(h)}
        aria-label={done ? `${h.nazev} — zrušit splnění` : `${h.nazev} — splnit`}
        aria-pressed={done}
        style={{
          width: isMobile ? 56 : 88, height: isMobile ? 48 : 56, flexShrink: 0,
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          borderRadius: isMobile ? 13 : 14, cursor: 'pointer', touchAction: 'manipulation',
          border: `1px solid ${done ? C.accent : C.border}`,
          background: done ? C.accent : C.sunken,
          color: done ? '#fff' : C.muted,
          opacity: done ? 1 : 0.55,
          transition: 'background .14s ease-out, border-color .14s ease-out',
        }}>
        <Check size={isMobile ? 20 : 24} />
      </button>
    )

    const stepBtn = (
      <button onClick={() => addStep(h)} style={{
        height: 44, minWidth: isMobile ? undefined : 112, padding: isMobile ? '0 14px' : '0 18px',
        flexShrink: 0, display: 'flex', alignItems: 'center', justifyContent: 'center',
        gap: isMobile ? 6 : 7, border: `1px solid ${C.border}`, background: C.nested, color: C.text,
        borderRadius: isMobile ? 12 : 11, fontSize: isMobile ? 14 : 15, fontWeight: 500,
        cursor: 'pointer', touchAction: 'manipulation',
      }}><Plus size={16} />+{fmtNum(Number(h.krok))} {h.jednotka}</button>
    )
    const doneBtn = (
      <button onClick={() => complete(h)} aria-label={`${h.nazev} — nastavit na cíl`} style={{
        width: 44, height: 44, flexShrink: 0, display: 'flex', alignItems: 'center', justifyContent: 'center',
        border: `1px solid ${C.border}`, background: C.sunken, color: C.muted,
        borderRadius: isMobile ? 12 : 11, cursor: 'pointer', touchAction: 'manipulation',
      }}><Check size={20} /></button>
    )

    if (isMobile) {
      return (
        <div key={h.id} style={{
          padding: '14px 16px', background: C.card, border: `1px solid ${C.border}`,
          borderRadius: 14, display: 'flex', flexDirection: 'column', gap: 12,
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
            {chip}
            <button onClick={() => router.push(`/navyky/${h.id}`)} style={{ flex: 1, minWidth: 0, minHeight: 44, background: 'transparent', border: 'none', padding: 0, textAlign: 'left', cursor: 'pointer' }}>
              <div style={{ fontSize: 15, fontWeight: 500, color: C.text, letterSpacing: '-.01em' }}>{h.nazev}</div>
              <div style={{ fontSize: 12, color: C.muted, marginTop: 2, display: 'flex', alignItems: 'center', gap: 4 }}>
                {ro && <Link2 size={11} style={{ flexShrink: 0 }} />}
                {h.typ === 'cil' ? `${fmtNum(v)} z ${fmtNum(Number(h.cil))} ${h.jednotka}` : h.podtitul}
              </div>
            </button>
            {h.typ === 'bool' && boolControl}
          </div>
          {h.typ === 'cil' && (
            <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
              <div style={{ flex: 1, height: 8, borderRadius: 99, background: C.track, overflow: 'hidden' }}>
                <div style={{ width: `${pct}%`, height: '100%', borderRadius: 99, background: done ? C.accent : C.accentDim, transition: 'width .14s ease-out' }} />
              </div>
              {stepBtn}{doneBtn}
            </div>
          )}
        </div>
      )
    }

    return (
      <div key={h.id} className="habit-card" style={{
        display: 'flex', alignItems: 'center', gap: 20, padding: '18px 22px', minHeight: 88,
        background: C.card, border: `1px solid ${C.border}`, borderRadius: 14,
        transition: 'border-color .14s ease-out',
      }}>
        {chip}
        <button onClick={() => router.push(`/navyky/${h.id}`)} style={{ flex: 1, minWidth: 0, minHeight: 44, background: 'transparent', border: 'none', padding: 0, textAlign: 'left', cursor: 'pointer' }}>
          <div style={{ fontSize: 17, fontWeight: 500, color: C.text, letterSpacing: '-.01em' }}>{h.nazev}</div>
          <div style={{ fontSize: 13, color: C.muted, marginTop: 3, display: 'flex', alignItems: 'center', gap: 5 }}>
            {ro && <Link2 size={12} style={{ flexShrink: 0 }} />}{h.podtitul}
          </div>
        </button>
        {h.typ === 'cil' ? (
          <div style={{ display: 'flex', alignItems: 'center', gap: 24 }}>
            <div style={{ width: 260 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: 8 }}>
                <span style={{ fontSize: 18, fontWeight: 600, color: done ? C.accent : C.text }}>{fmtNum(v)} {h.jednotka}</span>
                <span style={{ fontSize: 13, color: C.muted }}>z {fmtNum(Number(h.cil))} {h.jednotka}</span>
              </div>
              <div style={{ height: 8, borderRadius: 99, background: C.track, overflow: 'hidden' }}>
                <div style={{ width: `${pct}%`, height: '100%', borderRadius: 99, background: done ? C.accent : C.accentDim, transition: 'width .14s ease-out' }} />
              </div>
            </div>
            {stepBtn}{doneBtn}
          </div>
        ) : boolControl}
      </div>
    )
  }

  if (loading) return <div style={{ color: C.muted, padding: 24 }}>Načítání…</div>

  const hint = (
    <div style={{
      display: 'flex', alignItems: 'center', gap: 14, padding: isMobile ? '14px 16px' : '16px 22px',
      background: C.sunken, border: `1px dashed ${C.border}`, borderRadius: 14,
      color: C.muted, fontSize: isMobile ? 13 : 14,
    }}>
      <Flame size={16} style={{ flexShrink: 0 }} />
      <span>
        Série {streak} {dayWord(streak)}.{' '}
        {remaining > 0
          ? `Splň ještě ${remaining} ${habitWord(remaining)} a den se ti zapíše.`
          : 'Dnešek se ti už zapsal.'}
      </span>
    </div>
  )

  return (
    <div style={{ maxWidth: 1120, margin: '0 auto', paddingBottom: 24 }}>
      <style>{`.habit-card:hover { border-color: var(--muted) !important; }`}</style>

      {isMobile ? (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10, marginBottom: 12 }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <div>
              <div style={{ fontSize: 12, letterSpacing: '.1em', textTransform: 'uppercase', color: C.muted }}>{dateLine}</div>
              <h1 className="habits-h1" style={{ margin: '2px 0 0', fontSize: 26, fontWeight: 600, color: C.text, letterSpacing: '-.02em' }}>Návyky</h1>
            </div>
            <button onClick={() => router.push('/navyky/prehled')} aria-label="Přehled" style={{
              width: 44, height: 44, borderRadius: 12, border: `1px solid ${C.border}`, background: C.card,
              display: 'flex', alignItems: 'center', justifyContent: 'center', color: C.muted, cursor: 'pointer',
            }}><BarChart3 size={20} /></button>
          </div>
          <div>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: 8 }}>
              <span style={{ fontSize: 20, fontWeight: 600, color: C.text }}>
                {doneCount} <span style={{ color: C.muted, fontWeight: 400 }}>z {total}</span>
              </span>
              <span style={{ fontSize: 13, color: C.muted }}>splněno</span>
            </div>
            {progressBar(donePct)}
          </div>
        </div>
      ) : (
        <div style={{ display: 'flex', alignItems: 'flex-end', justifyContent: 'space-between', marginBottom: 28 }}>
          <div>
            <div style={{ fontSize: 13, letterSpacing: '.1em', textTransform: 'uppercase', color: C.muted, marginBottom: 6 }}>{dateLine}</div>
            <h1 style={{ margin: 0, fontSize: 34, fontWeight: 600, color: C.text, letterSpacing: '-.02em' }}>Návyky</h1>
          </div>
          <div style={{ display: 'flex', gap: 10, marginLeft: 32, marginRight: 'auto' }}>
            <button onClick={() => setFormOpen(true)} style={primaryBtn}><Plus size={16} /> Přidat návyk</button>
            <button onClick={() => router.push('/navyky/prehled')} style={secondaryBtn}><BarChart3 size={16} /> Přehled</button>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 20 }}>
            {counter(26, 'splněno dnes')}
            {progressBar(donePct, 180)}
          </div>
        </div>
      )}

      <div style={{ display: 'flex', flexDirection: 'column', gap: isMobile ? 8 : 10 }}>
        {habits.map(habitCard)}
      </div>

      <div style={{ marginTop: isMobile ? 12 : 28 }}>{hint}</div>

      {isMobile && (
        <button onClick={() => setFormOpen(true)} style={{
          width: '100%', height: 46, marginTop: 12, display: 'flex', alignItems: 'center', justifyContent: 'center',
          gap: 8, border: 0, borderRadius: 12, background: C.accent, color: '#fff',
          fontSize: 15, fontWeight: 600, cursor: 'pointer', touchAction: 'manipulation',
        }}><Plus size={16} /> Přidat návyk</button>
      )}

      <Modal isOpen={formOpen} onClose={() => setFormOpen(false)} title="Nový návyk">
        <HabitForm
          poradi={habits.length}
          onDone={(msg) => { setFormOpen(false); showToast(msg); load() }}
          onError={(msg) => showToast(msg, 'error')}
        />
      </Modal>

      {toast && <Toast message={toast.message} type={toast.type} onClose={hideToast} />}
    </div>
  )
}

/** 2000 → „2000", 2.5 → „2,5" (celá čísla bez desetinné části). */
function fmtNum(n: number): string {
  if (!Number.isFinite(n)) return '0'
  return Number.isInteger(n) ? String(n) : String(Math.round(n * 100) / 100).replace('.', ',')
}
