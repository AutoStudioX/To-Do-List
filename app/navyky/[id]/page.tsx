'use client'
import { useCallback, useEffect, useMemo, useState } from 'react'
import { useParams, useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { Toast, useToast } from '@/components/Toast'
import Modal from '@/components/Modal'
import HabitIcon from '@/components/habits/HabitIcon'
import HabitForm from '@/components/habits/HabitForm'
import YearGrid, { Legend } from '@/components/habits/YearGrid'
import { loadWindow, type HabitWindow } from '@/lib/habitsData'
import {
  metOn, ratio, level, habitStreaks, dayWord, successRate, yearGridOffset,
  weekdayIndex, DAY_LABELS, isReadOnly,
} from '@/lib/habits'
import { ChevronLeft, Flame, Settings, Link2 } from 'lucide-react'

const CHART_DAYS = 14

export default function HabitDetailPage() {
  const router = useRouter()
  const { id } = useParams<{ id: string }>()
  const supabase = useMemo(() => createClient(), [])
  const [win, setWin] = useState<HabitWindow | null>(null)
  const [loading, setLoading] = useState(true)
  const [isMobile, setIsMobile] = useState(false)
  const [editOpen, setEditOpen] = useState(false)
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
    try { setWin(await loadWindow(supabase, user.id)) }
    catch (e) { showToast(`Načtení selhalo: ${e instanceof Error ? e.message : String(e)}`, 'error') }
    setLoading(false)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [supabase])

  useEffect(() => { load() }, [load])

  const view = useMemo(() => {
    if (!win) return null
    const habit = win.habits.find(h => h.id === id)
    if (!habit) return null
    const vals = win.byHabit[habit.id]
    const st = habitStreaks(habit, vals)
    const last30 = vals.slice(-30)
    const rate = Math.round(successRate(habit, last30) * 100)
    const todayVal = vals[vals.length - 1] ?? 0

    const winVals = vals.slice(-CHART_DAYS)
    const winDays = win.days.slice(-CHART_DAYS)
    // Výška se škáluje k MAXIMU V OKNĚ, ne k cíli — vysoký den tak nepřeteče.
    const maxInWindow = habit.typ === 'cil'
      ? Math.max(Number(habit.cil ?? 1), ...winVals)
      : 1
    const bars = winVals.map((v, i) => {
      const ok = metOn(habit, v)
      // U ano/ne mají nesplněné sloupce 28 %, aby z grafu nezmizely.
      const r = habit.typ === 'cil' ? (maxInWindow ? v / maxInWindow : 0) : (ok ? 1 : 0.28)
      return {
        h: `${Math.max(3, Math.round(r * 100))}%`,
        ok,
        label: habit.typ === 'cil' ? String(v) : '',
        day: DAY_LABELS[weekdayIndex(winDays[i])],
      }
    })

    return {
      habit, vals, st, rate, todayVal, bars,
      yearLevels: vals.map(v => level(ratio(habit, v))),
      axisNote: habit.typ === 'cil'
        ? `Cíl ${habit.cil} ${habit.jednotka} · maximum ${maxInWindow} ${habit.jednotka}`
        : 'Splněno / nesplněno',
      tiles: [
        { label: 'Aktuální série', value: `${st.cur} ${dayWord(st.cur)}`, accent: true },
        { label: 'Nejdelší série', value: `${st.longest} ${dayWord(st.longest)}`, accent: false },
        { label: 'Úspěšnost 30 dní', value: `${rate} %`, accent: false },
        {
          label: habit.typ === 'cil' ? 'Dnes' : 'Stav dnes',
          value: habit.typ === 'cil' ? `${todayVal} ${habit.jednotka}` : (metOn(habit, todayVal) ? 'Splněno' : 'Nesplněno'),
          accent: metOn(habit, todayVal),
        },
      ],
    }
  }, [win, id])

  if (loading) return <div style={{ color: 'var(--muted)', padding: 24 }}>Načítání…</div>
  if (!view) return <div style={{ color: 'var(--muted)', padding: 24 }}>Návyk nenalezen.</div>

  const { habit } = view
  const ro = isReadOnly(habit)
  const card: React.CSSProperties = {
    background: 'var(--card)', border: '1px solid var(--border)', borderRadius: 16,
    padding: isMobile ? 16 : '26px 30px', display: 'flex', flexDirection: 'column',
    gap: isMobile ? 12 : 18,
  }

  return (
    <div style={{ maxWidth: 1120, margin: '0 auto', paddingBottom: 24, display: 'flex', flexDirection: 'column', gap: isMobile ? 14 : 20 }}>
      {/* hlavička */}
      <div style={{ display: 'flex', alignItems: 'center', gap: isMobile ? 12 : 18 }}>
        <button onClick={() => router.push('/navyky')} aria-label="Zpět" style={{
          width: 44, height: 44, flexShrink: 0, borderRadius: 12, border: '1px solid var(--border)',
          background: 'var(--card)', display: 'flex', alignItems: 'center', justifyContent: 'center',
          color: 'var(--muted)', cursor: 'pointer',
        }}><ChevronLeft size={22} /></button>
        <div style={{
          width: isMobile ? 44 : 52, height: isMobile ? 44 : 52, flexShrink: 0,
          borderRadius: isMobile ? 12 : 14, background: 'rgba(232,25,44,0.13)',
          display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--accent)',
        }}><HabitIcon name={habit.ikona} size={isMobile ? 20 : 24} /></div>
        <div style={{ minWidth: 0 }}>
          <h1 className="habits-h1" style={{
            ...({ '--habits-h1': '20px' } as React.CSSProperties),
            margin: 0, fontSize: isMobile ? 20 : 30, fontWeight: 600, color: 'var(--text)',
            letterSpacing: '-.02em', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
          }}>{habit.nazev}</h1>
          <div style={{ fontSize: isMobile ? 12 : 14, color: 'var(--muted)', marginTop: isMobile ? 0 : 4, display: 'flex', alignItems: 'center', gap: 5 }}>
            {ro && <Link2 size={12} style={{ flexShrink: 0 }} />}{habit.podtitul}
          </div>
        </div>
        {!isMobile && (
          <div style={{ marginLeft: 'auto', display: 'flex', gap: 12 }}>
            <div style={{
              display: 'flex', alignItems: 'center', gap: 10, height: 44, padding: '0 18px',
              borderRadius: 11, background: 'rgba(232,25,44,0.11)', color: 'var(--accent)',
              fontSize: 15, fontWeight: 500,
            }}><Flame size={16} />{view.st.cur} {dayWord(view.st.cur)} v řadě</div>
            <button onClick={() => setEditOpen(true)} aria-label="Upravit návyk" style={{
              width: 44, height: 44, borderRadius: 11, border: '1px solid var(--border)', background: 'var(--card)',
              display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--muted)', cursor: 'pointer',
            }}><Settings size={20} /></button>
          </div>
        )}
        {isMobile && (
          <button onClick={() => setEditOpen(true)} aria-label="Upravit návyk" style={{
            marginLeft: 'auto', width: 44, height: 44, flexShrink: 0, borderRadius: 12,
            border: '1px solid var(--border)', background: 'var(--card)',
            display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--muted)', cursor: 'pointer',
          }}><Settings size={20} /></button>
        )}
      </div>

      {/* přepínač návyků — design ho má v sidebaru, který nepřebíráme */}
      <div style={{ display: 'flex', gap: 6, overflowX: 'auto', paddingBottom: 2 }}>
        {win!.habits.map(h => {
          const on = h.id === habit.id
          return (
            <button key={h.id} onClick={() => router.push(`/navyky/${h.id}`)} style={{
              flexShrink: 0, minHeight: 44, display: 'flex', alignItems: 'center', gap: 8, padding: '0 14px',
              borderRadius: 999, cursor: 'pointer', touchAction: 'manipulation',
              border: `1px solid ${on ? 'var(--accent)' : 'var(--border)'}`,
              background: on ? 'rgba(232,25,44,0.13)' : 'var(--card)',
              color: on ? 'var(--accent)' : 'var(--muted)',
            }}>
              <HabitIcon name={h.ikona} size={16} />
              <span style={{ fontSize: 13, fontWeight: on ? 600 : 500, color: on ? 'var(--accent)' : 'var(--text)' }}>{h.nazev}</span>
            </button>
          )
        })}
      </div>

      {/* dlaždice */}
      <div style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr 1fr' : 'repeat(4, 1fr)', gap: isMobile ? 10 : 14 }}>
        {view.tiles.map(t => (
          <div key={t.label} style={{
            background: 'var(--card)', border: '1px solid var(--border)', borderRadius: 14,
            padding: isMobile ? '14px 16px' : '18px 20px',
          }}>
            <div style={{ fontSize: isMobile ? 11 : 12, color: 'var(--muted)' }}>{t.label}</div>
            <div style={{
              fontSize: isMobile ? 20 : 26, fontWeight: 600, marginTop: isMobile ? 6 : 10,
              color: t.accent ? 'var(--accent)' : 'var(--text)',
            }}>{t.value}</div>
          </div>
        ))}
      </div>

      {/* rok po dnech */}
      <div style={card}>
        <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap' }}>
          <div style={{ fontSize: isMobile ? 14 : 17, fontWeight: 600, color: 'var(--text)' }}>Rok po dnech</div>
          {!isMobile && <Legend min="0 %" max="100 %" />}
        </div>
        <YearGrid
          levels={view.yearLevels}
          offset={yearGridOffset(win!.days[0])}
          cell={isMobile ? 5 : 13}
          gap={isMobile ? 1 : 4}
          radius={isMobile ? 1 : 3}
          labels={!isMobile}
        />
      </div>

      {/* posledních 14 dní */}
      <div style={{ ...card, minHeight: isMobile ? 200 : 260 }}>
        <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap' }}>
          <div style={{ fontSize: isMobile ? 14 : 17, fontWeight: 600, color: 'var(--text)' }}>
            {isMobile ? '14 dní' : 'Posledních 14 dní'}
          </div>
          <div style={{ fontSize: isMobile ? 11 : 13, color: 'var(--muted)' }}>{view.axisNote}</div>
        </div>
        {/* `align-items: stretch` (výchozí) je tu podstatné: sloupce musí mít
            definitivní výšku, jinak se procentní výška baru nemá oč opřít
            a spadne na nulu. S `flex-end` na řádku byl graf prázdný. */}
        <div style={{ flex: 1, display: 'flex', gap: isMobile ? 5 : 10, minHeight: 0, borderBottom: isMobile ? undefined : '1px solid var(--border)' }}>
          {view.bars.map((b, i) => (
            <div key={i} style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'flex-end', gap: 6 }}>
              {!isMobile && <div style={{ fontSize: 11, color: 'var(--muted)' }}>{b.label}</div>}
              <div style={{
                width: '100%', height: b.h,
                borderRadius: isMobile ? '4px 4px 1px 1px' : '6px 6px 2px 2px',
                background: b.ok ? 'var(--accent)' : 'rgba(232,25,44,0.22)',
              }} />
            </div>
          ))}
        </div>
        {!isMobile && (
          <div style={{ display: 'flex', gap: 10 }}>
            {view.bars.map((b, i) => (
              <div key={i} style={{ flex: 1, textAlign: 'center', fontSize: 11, color: 'var(--muted)' }}>{b.day}</div>
            ))}
          </div>
        )}
      </div>

      <Modal isOpen={editOpen} onClose={() => setEditOpen(false)} title={`Upravit — ${habit.nazev}`}>
        <HabitForm
          habit={habit}
          poradi={habit.poradi}
          onDone={(msg) => { setEditOpen(false); showToast(msg); load() }}
          onError={(msg) => showToast(msg, 'error')}
          onArchived={(msg) => { setEditOpen(false); showToast(msg); router.push('/navyky') }}
        />
      </Modal>

      {toast && <Toast message={toast.message} type={toast.type} onClose={hideToast} />}
    </div>
  )
}
