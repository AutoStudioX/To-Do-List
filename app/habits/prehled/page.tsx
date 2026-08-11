'use client'
import { useCallback, useEffect, useMemo, useState } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { Toast, useToast } from '@/components/Toast'
import HabitIcon from '@/components/habits/HabitIcon'
import YearGrid, { Legend, LEVEL_BG } from '@/components/habits/YearGrid'
import { loadWindow, slice, type HabitWindow } from '@/lib/habitsData'
import {
  metOn, ratio, level, dayLevel, streaks, dayWord, scoreTone, weekdayIndex,
  yearGridOffset, longestStreakSpan, fmtMonthSpan, DAY_LABELS,
  dayStats, appliesOn, existsOn, tracksOn, successRateOn, sortHabits, fmtTimeRange, windowStart,
} from '@/lib/habits'
import { ChevronLeft, Flame, Trophy, CalendarCheck, TrendingDown } from 'lucide-react'

type Range = 7 | 30 | 365
const RANGES: { v: Range; t: string }[] = [
  { v: 7, t: '7 dní' }, { v: 30, t: '30 dní' }, { v: 365, t: 'Rok' },
]

export default function PrehledPage() {
  const router = useRouter()
  const supabase = useMemo(() => createClient(), [])
  const [win, setWin] = useState<HabitWindow | null>(null)
  const [range, setRange] = useState<Range>(30)
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
    try { setWin(await loadWindow(supabase, user.id)) }
    catch (e) { showToast(`Načtení selhalo: ${e instanceof Error ? e.message : String(e)}`, 'error') }
    setLoading(false)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [supabase])

  useEffect(() => { load() }, [load])

  const view = useMemo(() => {
    if (!win) return null
    const habits = sortHabits(win.habits)
    const { days: allDays, byHabit: allBy } = win
    const raw = slice(win, range)
    // Okno nikdy nesahá před vznik nejstaršího návyku — jinak by řádek
    // u návyku založeného dnes měl 30 buněk a skóre 0/30 místo 0/1.
    const from = windowStart(habits, raw.days)
    const cut = {
      days: raw.days.slice(from),
      byHabit: Object.fromEntries(Object.keys(raw.byHabit).map(id => [id, raw.byHabit[id].slice(from)])),
    }
    const R = cut.days.length

    // Den, kdy návyk neplatil, se do jeho statistiky nezapočítá.
    const statsAll = dayStats(habits, allDays, allBy)
    const countsAll = statsAll.map(x => x.met)
    const statsCut = statsAll.slice(statsAll.length - R)
    const countsCut = countsAll.slice(countsAll.length - R)
    const prvniDen = cut.days[0]

    const st = streaks(countsAll)
    const span = longestStreakSpan(countsAll, allDays)
    const active = countsAll.filter(c => c > 0).length

    // Nejslabší návyk se posuzuje z posledních 30 dnů, jen přes platné dny.
    const last30 = slice(win, 30)
    let weak: { name: string; rate: number } | null = null
    for (const h of habits) {
      const { hit, total } = successRateOn(h, last30.days, last30.byHabit[h.id])
      if (!total) continue
      const r = hit / total
      if (!weak || r < weak.rate) weak = { name: h.nazev, rate: r }
    }

    const rows = habits.map(h => {
      const vals = cut.byHabit[h.id]
      const { hit, total } = successRateOn(h, cut.days, vals)
      return {
        habit: h,
        // `null` = návyk ten den neplatil; vykreslí se jako prázdné místo,
        // ne jako nesplněný den.
        // `undefined` = den mimo existenci návyku (nekreslí se vůbec),
        // `null` = existoval, ale ten den neplatil (čárkovaně).
        cells: cut.days.map((d, i) =>
          !existsOn(h, d) ? undefined : appliesOn(h, d) ? level(ratio(h, vals[i] ?? 0)) : null),
        score: `${hit}/${total}`,
        tone: scoreTone(hit, total),
      }
    })

    const avg = R ? (countsCut.reduce((a, b) => a + b, 0) / R).toFixed(1).replace('.', ',') : '0'
    // „Kompletní den" = splněno všechno, co ten den platilo.
    const full = statsCut.filter(x => x.applicable > 0 && x.met === x.applicable).length

    return {
      habits, R, rows, cut, countsCut, countsAll, allDays, prvniDen,
      dayLevels: statsCut.map(x => x.applicable === 0 ? undefined : dayLevel(x.met, x.applicable)),
      // `applicable === 0` = ten den ještě neexistoval žádný návyk (nebo žádný
      // neplatil) → prázdná buňka, ne šedá nula.
      yearLevels: statsAll.map(x => x.applicable === 0 ? undefined : dayLevel(x.met, x.applicable)),
      rangeScore: `${countsCut.filter(c => c >= 4).length}/${R}`,
      summary: `Průměrně ${avg} návyků denně · ${full}× kompletní den`,
      tiles: [
        { label: 'Aktuální série', value: `${st.cur} ${dayWord(st.cur)}`, note: 'min. 4 návyky denně', Icon: Flame, accent: true },
        { label: 'Nejdelší série', value: `${st.longest} ${dayWord(st.longest)}`, note: span ? fmtMonthSpan(span.from, span.to) : '—', Icon: Trophy, accent: false },
        { label: 'Aktivní dny', value: String(active), note: `z ${allDays.length} dní`, Icon: CalendarCheck, accent: false },
        { label: 'Nejslabší návyk', value: weak ? `${Math.round(weak.rate * 100)} %` : '—', note: weak?.name ?? '—', Icon: TrendingDown, accent: false },
      ],
    }
  }, [win, range])

  if (loading) return <div style={{ color: 'var(--muted)', padding: 24 }}>Načítání…</div>
  if (!view || !view.habits.length) {
    return <div style={{ color: 'var(--muted)', padding: 24 }}>Zatím žádné návyky.</div>
  }

  const isYear = range === 365
  // Rozměry buněk z designu. Buňka je čtverec a `minmax(0, N)` ji nenechá
  // narůst nad návrhovou velikost — když se matice do sloupce nevejde,
  // zmenší se, ale nikdy se nenatáhne do obdélníku.
  const CELL = isMobile
    ? (range === 7 ? 38 : range === 30 ? 7 : 5)
    : (range === 7 ? 44 : range === 30 ? 19 : 13)
  const GAP = isMobile
    ? (range === 7 ? 6 : 1)
    : (range === 7 ? 8 : range === 30 ? 6 : 4)
  const card: React.CSSProperties = {
    background: 'var(--card)', border: '1px solid var(--border)', borderRadius: 16,
    padding: isMobile ? 18 : '28px 30px', display: 'flex', flexDirection: 'column',
    gap: isMobile ? 14 : 20,
  }
  const COL = isMobile ? '26px 1fr 38px' : '230px 1fr 64px'
  const COL_GAP = isMobile ? 10 : 16
  const cellRadius = isMobile ? (range === 7 ? 6 : 1) : 5
  // Svislá mezera mezi řádky matice = vodorovná mezera mezi čtverečky.
  const rowGap = GAP
  const toneColor = (t: 'accent' | 'text' | 'muted') =>
    t === 'accent' ? 'var(--accent)' : t === 'text' ? 'var(--text)' : 'var(--muted)'

  // Pevná velikost buňky a pevná mezera, zarovnáno doleva — řádek klidně
  // skončí v půlce šířky. Sloupců je vždy tolik, kolik má okno dnů, aby si
  // řádky odpovídaly datem; buňky mimo existenci návyku se jen nevykreslí.
  // 7 dní: obdélníky přes celou šířku řádku — sedm sloupců se do šířky vejde,
  // roztahování tam nevadí. 30 dní a rok mají pevnou velikost i mezeru
  // a zarovnávají se doleva.
  const matrixCells = (cells: (number | null | undefined)[]) => (
    <div style={{
      display: 'grid',
      // Buňky rostou ZLEVA: první den historie vlevo, dnešek vpravo.
      // U 7 dní zůstává sedm stop, aby si buňka držela šířku i při kratší
      // historii — jeden den jinak natáhne lištu přes celou obrazovku.
      // U 30 dní a roku je stop tolik, kolik je dnů, takže řádek skončí tam,
      // kde končí historie.
      gridTemplateColumns: range === 7
        ? `repeat(7, minmax(0, 1fr))`
        : `repeat(${view.R}, ${CELL}px)`,
      gap: GAP,
      justifyContent: range === 7 ? undefined : 'start',
    }}>
      {cells.map((l, i) => (
        <div key={i} style={{
          width: range === 7 ? undefined : CELL,
          height: range === 7 ? CELL : CELL,
          borderRadius: cellRadius,
          background: l == null ? 'transparent' : LEVEL_BG[l],
          // `undefined` (návyk ještě neexistoval) nekreslíme vůbec,
          // `null` (neplatil) čárkovaně.
          border: l === null ? '1px dashed var(--border)' : undefined,
        }} />
      ))}
    </div>
  )

  return (
    <div style={{ maxWidth: 1120, margin: '0 auto', paddingBottom: 24 }}>
      {/* hlavička */}
      {isMobile ? (
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 16 }}>
          <button onClick={() => router.push('/habits')} aria-label="Zpět" style={{
            width: 44, height: 44, flexShrink: 0, borderRadius: 12, border: '1px solid var(--border)',
            background: 'var(--card)', display: 'flex', alignItems: 'center', justifyContent: 'center',
            color: 'var(--muted)', cursor: 'pointer',
          }}><ChevronLeft size={22} /></button>
          <h1 className="habits-h1" style={{ margin: 0, fontSize: 26, fontWeight: 600, color: 'var(--text)', letterSpacing: '-.02em' }}>Přehled</h1>
        </div>
      ) : (
        <div style={{ display: 'flex', alignItems: 'flex-end', justifyContent: 'space-between', marginBottom: 26 }}>
          <div style={{ display: 'flex', alignItems: 'flex-end', gap: 14 }}>
            <button onClick={() => router.push('/habits')} aria-label="Zpět" style={{
              width: 44, height: 44, borderRadius: 12, border: '1px solid var(--border)', background: 'var(--card)',
              display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--muted)', cursor: 'pointer',
            }}><ChevronLeft size={22} /></button>
            <div>
              <div style={{ fontSize: 13, letterSpacing: '.1em', textTransform: 'uppercase', color: 'var(--muted)', marginBottom: 6 }}>
                {fmtSpan(view.allDays[0], view.allDays[view.allDays.length - 1])}
              </div>
              <h1 style={{ margin: 0, fontSize: 34, fontWeight: 600, color: 'var(--text)', letterSpacing: '-.02em' }}>Přehled Habits</h1>
            </div>
          </div>
          {rangeSwitch()}
        </div>
      )}
      {isMobile && <div style={{ marginBottom: 16 }}>{rangeSwitch()}</div>}

      {/* karta mřížky */}
      <div style={card}>
        <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap' }}>
          <div>
            <div style={{ fontSize: isMobile ? 15 : 19, fontWeight: 600, color: 'var(--text)' }}>
              {isYear ? 'Posledních 12 měsíců'
                : view.R >= range ? `Posledních ${range} dní`
                : view.R === 1 ? 'Dnes' : `Posledních ${view.R} ${dayWord(view.R)}`}
            </div>
            {!isMobile && (
              <div style={{ fontSize: 13, color: 'var(--muted)', marginTop: 4 }}>
                {isYear
                  ? 'Sytost čtverce odpovídá počtu splněných návyků za den'
                  : 'Řádek je jeden návyk, sloupec jeden den. Sytost odpovídá plnění.'}
              </div>
            )}
          </div>
          {!isMobile && <Legend min={isYear ? '0' : '0 %'} max={isYear ? String(view.habits.length) : '100 %'} />}
        </div>

        {isYear ? (
          <YearGrid
            levels={view.yearLevels}
            offset={yearGridOffset(view.allDays[0])}
            cell={isMobile ? 5 : 13}
            gap={isMobile ? 1 : 4}
            radius={isMobile ? 1 : 3}
            labels={!isMobile}
          />
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: rowGap }}>
            {/* popisky dnů */}
            <div style={{ display: 'grid', gridTemplateColumns: COL, gap: COL_GAP, alignItems: 'center' }}>
              <span />
              {range === 7 ? (
                <div style={{ display: 'grid', gridTemplateColumns: `repeat(7, minmax(0, 1fr))`, gap: GAP }}>
                  {view.cut.days.map(d => (
                    <div key={d} style={{ textAlign: 'center', fontSize: 11, color: 'var(--muted)' }}>{DAY_LABELS[weekdayIndex(d)]}</div>
                  ))}
                </div>
              ) : (
                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 11, color: 'var(--muted)' }}>
                  <span>{view.R >= range ? `před ${range} dny` : fmtDen(view.prvniDen)}</span>
                  {view.R > 1 && <span>dnes</span>}
                </div>
              )}
              <div style={{ textAlign: 'right', fontSize: 11, color: 'var(--muted)' }}>Splněno</div>
            </div>

            {view.rows.map(r => (
              <div key={r.habit.id} style={{ display: 'grid', gridTemplateColumns: COL, gap: COL_GAP, alignItems: 'center' }}>
                <button
                  onClick={() => router.push(`/habits/${r.habit.id}`)}
                  title={r.habit.nazev}
                  style={{
                    display: 'flex', alignItems: 'center', gap: isMobile ? 0 : 10, minWidth: 0, minHeight: 44,
                    background: 'transparent', border: 'none', padding: 0, cursor: 'pointer',
                    color: 'var(--muted)', textAlign: 'left',
                  }}>
                  <HabitIcon name={r.habit.ikona} size={isMobile ? (range === 7 ? 16 : 10) : 18} />
                  {!isMobile && (
                    <span style={{ fontSize: 14, color: 'var(--text)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                      {r.habit.nazev}
                      {r.habit.cas && <span style={{ marginLeft: 8, fontSize: 12, color: 'var(--muted)' }}>{fmtTimeRange(r.habit.cas, r.habit.cas_do)}</span>}
                    </span>
                  )}
                </button>
                {matrixCells(r.cells)}
                <div style={{ textAlign: 'right', fontSize: isMobile ? (range === 7 ? 12 : 9) : 14, fontWeight: 600, color: toneColor(r.tone) }}>
                  {r.score}
                </div>
              </div>
            ))}

            {/* souhrn dne */}
            <div style={{
              display: 'grid', gridTemplateColumns: COL, gap: COL_GAP, alignItems: 'center',
              marginTop: 6, paddingTop: 14, borderTop: '1px solid var(--border)',
            }}>
              <div style={{ fontSize: isMobile ? 11 : 13, color: 'var(--muted)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                {isMobile ? 'Den' : 'Souhrn dne'}
              </div>
              {matrixCells(view.dayLevels)}
              <div style={{ textAlign: 'right', fontSize: isMobile ? (range === 7 ? 12 : 9) : 14, fontWeight: 600, color: 'var(--text)' }}>
                {view.rangeScore}
              </div>
            </div>
          </div>
        )}

        <div style={{ fontSize: 13, color: 'var(--muted)' }}>{view.summary}</div>
      </div>

      {/* dlaždice */}
      <div style={{
        display: 'grid', gridTemplateColumns: isMobile ? '1fr 1fr' : 'repeat(4, 1fr)',
        gap: 14, marginTop: 14,
      }}>
        {view.tiles.map(t => (
          <div key={t.label} style={{
            background: 'var(--card)', border: '1px solid var(--border)', borderRadius: 16,
            padding: isMobile ? '18px 20px' : '22px 24px', display: 'flex', flexDirection: 'column',
            gap: 14, minHeight: isMobile ? 118 : 150,
          }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, color: t.accent ? 'var(--accent)' : 'var(--muted)' }}>
              <t.Icon size={20} />
              <span style={{ fontSize: 13, color: 'var(--muted)', fontWeight: 500 }}>{t.label}</span>
            </div>
            <div style={{ marginTop: 'auto' }}>
              <div style={{
                fontSize: isMobile ? 24 : 34, fontWeight: 600, letterSpacing: '-.02em', lineHeight: 1,
                color: t.accent ? 'var(--accent)' : 'var(--text)',
              }}>{t.value}</div>
              <div style={{ fontSize: 13, color: 'var(--muted)', marginTop: 8, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{t.note}</div>
            </div>
          </div>
        ))}
      </div>

      {toast && <Toast message={toast.message} type={toast.type} onClose={hideToast} />}
    </div>
  )

  function rangeSwitch() {
    return (
      <div style={{
        display: 'flex', gap: 6, padding: 5, background: 'var(--card)',
        border: '1px solid var(--border)', borderRadius: 12,
      }}>
        {RANGES.map(r => {
          const on = range === r.v
          return (
            <button key={r.v} onClick={() => setRange(r.v)} style={{
              flex: isMobile ? 1 : undefined, height: 44, padding: isMobile ? 0 : '0 22px',
              border: 0, borderRadius: 9, cursor: 'pointer', touchAction: 'manipulation',
              fontSize: isMobile ? 14 : 15, fontWeight: 500,
              background: on ? 'var(--accent)' : 'transparent',
              color: on ? '#fff' : 'var(--muted)',
            }}>{r.t}</button>
          )
        })}
      </div>
    )
  }
}

const MONTHS_SHORT = ['leden', 'únor', 'březen', 'duben', 'květen', 'červen',
  'červenec', 'srpen', 'září', 'říjen', 'listopad', 'prosinec']

/** „11. 8." */
function fmtDen(k: string): string {
  if (!k) return ''
  return `${Number(k.slice(8, 10))}. ${Number(k.slice(5, 7))}.`
}

/** „Srpen 2025 — srpen 2026" */
function fmtSpan(from: string, to: string): string {
  const m = (k: string) => `${MONTHS_SHORT[Number(k.slice(5, 7)) - 1]} ${k.slice(0, 4)}`
  const a = m(from)
  return `${a.charAt(0).toUpperCase()}${a.slice(1)} — ${m(to)}`
}
