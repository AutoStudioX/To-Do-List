'use client'
import { useEffect, useRef, useState, useCallback } from 'react'

const DAYS = ['Po', 'Út', 'St', 'Čt', 'Pá', 'So', 'Ne']
const MONTHS = ['Leden', 'Únor', 'Březen', 'Duben', 'Květen', 'Červen', 'Červenec', 'Srpen', 'Září', 'Říjen', 'Listopad', 'Prosinec']

function parseValue(v: string): Date | null {
  if (!v) return null
  const d = new Date(v + 'T00:00:00')
  return isNaN(d.getTime()) ? null : d
}

function toISO(d: Date) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

function startOfMonth(year: number, month: number) {
  return new Date(year, month, 1)
}

function daysInMonth(year: number, month: number) {
  return new Date(year, month + 1, 0).getDate()
}

// Monday-first offset (0=Mon…6=Sun)
function firstDayOffset(year: number, month: number) {
  const d = new Date(year, month, 1).getDay()
  return (d + 6) % 7
}

interface Props {
  value: string
  onChange: (iso: string) => void
  style?: React.CSSProperties
  placeholder?: string
}

export default function DatePicker({ value, onChange, style, placeholder = 'Vyberte datum' }: Props) {
  const parsed = parseValue(value)
  const today = new Date()

  const [open, setOpen] = useState(false)
  const [dropStyle, setDropStyle] = useState<React.CSSProperties>({})
  const [viewYear, setViewYear] = useState((parsed || today).getFullYear())
  const [viewMonth, setViewMonth] = useState((parsed || today).getMonth())
  const [mode, setMode] = useState<'days' | 'months' | 'years'>('days')
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => {
    function handler(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [])

  useEffect(() => {
    if (open) setMode('days')
  }, [open])

  function toggleOpen() {
    if (!open && ref.current) {
      const rect = ref.current.getBoundingClientRect()
      const calHeight = 310
      const spaceBelow = window.innerHeight - rect.bottom - 8
      const spaceAbove = rect.top - 8
      const openUp = spaceBelow < calHeight && spaceAbove > spaceBelow
      setDropStyle({
        position: 'fixed',
        left: rect.left,
        width: Math.max(rect.width, 268),
        zIndex: 9999,
        ...(openUp
          ? { bottom: window.innerHeight - rect.top + 4 }
          : { top: rect.bottom + 4 }),
      })
    }
    setOpen(o => !o)
  }

  function selectDay(day: number) {
    onChange(toISO(new Date(viewYear, viewMonth, day)))
    setOpen(false)
  }

  function prevMonth() {
    if (viewMonth === 0) { setViewMonth(11); setViewYear(y => y - 1) }
    else setViewMonth(m => m - 1)
  }

  function nextMonth() {
    if (viewMonth === 11) { setViewMonth(0); setViewYear(y => y + 1) }
    else setViewMonth(m => m + 1)
  }

  const offset = firstDayOffset(viewYear, viewMonth)
  const totalDays = daysInMonth(viewYear, viewMonth)
  const cells: (number | null)[] = [...Array(offset).fill(null), ...Array.from({ length: totalDays }, (_, i) => i + 1)]
  while (cells.length % 7 !== 0) cells.push(null)

  const displayLabel = parsed
    ? `${parsed.getDate()}. ${MONTHS[parsed.getMonth()].toLowerCase()} ${parsed.getFullYear()}`
    : ''

  const yearRange = Array.from({ length: 20 }, (_, i) => today.getFullYear() - 5 + i)

  const inputStyle: React.CSSProperties = {
    width: '100%',
    background: 'var(--input-bg)',
    border: '1px solid var(--border)',
    borderRadius: 8,
    padding: '10px 14px',
    color: displayLabel ? 'var(--text)' : 'var(--muted)',
    fontSize: 14,
    cursor: 'pointer',
    textAlign: 'left',
    ...style,
  }

  return (
    <div ref={ref} style={{ position: 'relative', width: '100%' }}>
      <button type="button" onClick={toggleOpen} style={inputStyle}>
        {displayLabel || <span style={{ color: 'var(--muted)' }}>{placeholder}</span>}
      </button>

      {open && (
        <div style={{
          ...dropStyle,
          background: 'var(--card)', border: '1px solid var(--border)', borderRadius: 10,
          boxShadow: '0 8px 32px rgba(0,0,0,0.35)', padding: 12,
          animation: 'fadeUp 0.12s ease',
        }}>

          {/* Header */}
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 }}>
            {mode === 'days' && (
              <button type="button" onClick={prevMonth} style={navBtn}>‹</button>
            )}
            {mode !== 'days' && <span style={{ width: 28 }} />}

            <div style={{ display: 'flex', gap: 4 }}>
              <button type="button" onClick={() => setMode(m => m === 'months' ? 'days' : 'months')} style={headerBtn}>
                {MONTHS[viewMonth]}
              </button>
              <button type="button" onClick={() => setMode(m => m === 'years' ? 'days' : 'years')} style={headerBtn}>
                {viewYear}
              </button>
            </div>

            {mode === 'days' && (
              <button type="button" onClick={nextMonth} style={navBtn}>›</button>
            )}
            {mode !== 'days' && <span style={{ width: 28 }} />}
          </div>

          {/* Day view */}
          {mode === 'days' && (
            <>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', gap: 2, marginBottom: 4 }}>
                {DAYS.map(d => (
                  <div key={d} style={{ textAlign: 'center', fontSize: 11, color: 'var(--muted)', fontWeight: 600, padding: '2px 0' }}>{d}</div>
                ))}
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', gap: 2 }}>
                {cells.map((day, i) => {
                  if (!day) return <span key={i} />
                  const isSelected = parsed && parsed.getFullYear() === viewYear && parsed.getMonth() === viewMonth && parsed.getDate() === day
                  const isToday = today.getFullYear() === viewYear && today.getMonth() === viewMonth && today.getDate() === day
                  return (
                    <button key={i} type="button" onClick={() => selectDay(day)} style={{
                      borderRadius: 6, border: 'none', padding: '6px 2px', fontSize: 13, cursor: 'pointer',
                      background: isSelected ? '#e53e3e' : 'transparent',
                      color: isSelected ? 'white' : isToday ? '#e53e3e' : 'var(--text)',
                      fontWeight: isSelected || isToday ? 700 : 400,
                      outline: isToday && !isSelected ? '1px solid #e53e3e44' : 'none',
                    }}>
                      {day}
                    </button>
                  )
                })}
              </div>
            </>
          )}

          {/* Month picker */}
          {mode === 'months' && (
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 4 }}>
              {MONTHS.map((m, i) => (
                <button key={m} type="button" onClick={() => { setViewMonth(i); setMode('days') }} style={{
                  borderRadius: 6, border: 'none', padding: '8px 4px', fontSize: 12, cursor: 'pointer',
                  background: i === viewMonth ? '#e53e3e' : 'transparent',
                  color: i === viewMonth ? 'white' : 'var(--text)', fontWeight: i === viewMonth ? 700 : 400,
                }}>
                  {m.slice(0, 3)}
                </button>
              ))}
            </div>
          )}

          {/* Year picker */}
          {mode === 'years' && (
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 4 }}>
              {yearRange.map(y => (
                <button key={y} type="button" onClick={() => { setViewYear(y); setMode('days') }} style={{
                  borderRadius: 6, border: 'none', padding: '8px 4px', fontSize: 12, cursor: 'pointer',
                  background: y === viewYear ? '#e53e3e' : 'transparent',
                  color: y === viewYear ? 'white' : 'var(--text)', fontWeight: y === viewYear ? 700 : 400,
                }}>
                  {y}
                </button>
              ))}
            </div>
          )}

          {/* Clear */}
          {value && (
            <button type="button" onClick={() => { onChange(''); setOpen(false) }} style={{
              marginTop: 8, width: '100%', background: 'transparent', border: '1px solid var(--border)',
              borderRadius: 6, padding: '6px', fontSize: 12, color: 'var(--muted)', cursor: 'pointer',
            }}>
              Vymazat datum
            </button>
          )}
        </div>
      )}

      <style>{`@keyframes fadeUp { from { opacity: 0; transform: translateY(4px) } to { opacity: 1; transform: translateY(0) } }`}</style>
    </div>
  )
}

const navBtn: React.CSSProperties = {
  background: 'transparent', border: 'none', color: 'var(--text)', fontSize: 18,
  cursor: 'pointer', width: 28, height: 28, borderRadius: 6, display: 'flex',
  alignItems: 'center', justifyContent: 'center', padding: 0,
}

const headerBtn: React.CSSProperties = {
  background: 'transparent', border: 'none', color: 'var(--text)', fontSize: 14,
  fontWeight: 600, cursor: 'pointer', borderRadius: 6, padding: '2px 6px',
}
