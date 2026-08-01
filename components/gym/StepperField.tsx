'use client'
import { useEffect, useRef, useState } from 'react'
import { Minus, Plus } from 'lucide-react'

const LONG_PRESS_MS = 450   // hold this long and the big jumps kick in
const REPEAT_MS = 220
const BIG_MULTIPLIER = 5    // a held button moves 5× the base step

/**
 * −/+ field with direct entry. Machines come in irregular weights (23, 27, 34),
 * so the number itself is always typeable; the buttons are the fast path.
 */
export default function StepperField({
  label, value, unit, step, min = 0, decimal = false, disabled = false, onChange,
}: {
  label: string
  value: number
  unit?: string
  step: number
  min?: number
  decimal?: boolean
  disabled?: boolean
  onChange: (v: number) => void
}) {
  const [draft, setDraft] = useState<string | null>(null) // non-null while typing
  const inputRef = useRef<HTMLInputElement>(null)
  // The repeat interval outlives the render that created it, so it must read
  // the CURRENT value — a captured prop would make every tick recompute the
  // same result and the hold would jump only once.
  const latest = useRef(value)
  latest.current = value
  const timers = useRef<{ start?: ReturnType<typeof setTimeout>; repeat?: ReturnType<typeof setInterval>; long: boolean }>({ long: false })

  // If the value changes from outside while we're not typing (buttons, switching
  // sets), drop any leftover draft — otherwise the field would keep showing a
  // number that is no longer the real one.
  useEffect(() => {
    if (draft !== null && document.activeElement !== inputRef.current) setDraft(null)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [value])

  useEffect(() => () => { // never leave a timer running behind us
    if (timers.current.start) clearTimeout(timers.current.start)
    if (timers.current.repeat) clearInterval(timers.current.repeat)
  }, [])

  const round = (v: number) => {
    const r = Math.max(min, Math.round(v * 100) / 100)
    return decimal ? r : Math.round(r)
  }
  const bump = (dir: 1 | -1, mult = 1) => onChange(round(latest.current + dir * step * mult))

  function press(dir: 1 | -1) {
    if (disabled) return
    timers.current.long = false
    timers.current.start = setTimeout(() => {
      timers.current.long = true
      bump(dir, BIG_MULTIPLIER)
      timers.current.repeat = setInterval(() => bump(dir, BIG_MULTIPLIER), REPEAT_MS)
    }, LONG_PRESS_MS)
  }

  function release(dir: 1 | -1) {
    if (disabled) return
    if (timers.current.start) { clearTimeout(timers.current.start); timers.current.start = undefined }
    if (timers.current.repeat) { clearInterval(timers.current.repeat); timers.current.repeat = undefined }
    if (!timers.current.long) bump(dir) // a plain tap moves one step
    timers.current.long = false
  }

  function cancel() {
    if (timers.current.start) { clearTimeout(timers.current.start); timers.current.start = undefined }
    if (timers.current.repeat) { clearInterval(timers.current.repeat); timers.current.repeat = undefined }
    timers.current.long = false
  }

  function commit() {
    if (draft === null) return
    const n = parseFloat(draft.replace(',', '.'))
    if (!Number.isNaN(n)) onChange(round(n))
    setDraft(null)
  }

  const btn: React.CSSProperties = {
    width: 56, height: 56, flexShrink: 0, display: 'flex', alignItems: 'center', justifyContent: 'center',
    borderRadius: 14, border: '1px solid var(--border)', background: 'var(--input-bg)',
    color: disabled ? 'var(--muted)' : 'var(--text)', cursor: disabled ? 'default' : 'pointer',
    touchAction: 'manipulation', userSelect: 'none',
  }

  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
      <button
        type="button" aria-label={`${label} míň`} style={btn} disabled={disabled}
        onPointerDown={() => press(-1)} onPointerUp={() => release(-1)}
        onPointerLeave={cancel} onPointerCancel={cancel} onContextMenu={e => e.preventDefault()}
      ><Minus size={20} /></button>

      <div style={{ flex: 1, minWidth: 0, textAlign: 'center' }}>
        <div style={{ fontSize: 10, letterSpacing: 0.6, color: 'var(--muted)', fontWeight: 700, textTransform: 'uppercase' }}>{label}</div>
        <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'center', gap: 3 }}>
          <input
            ref={inputRef}
            className="stepper-input"
            value={draft ?? String(value).replace('.', ',')}
            disabled={disabled}
            onChange={e => setDraft(e.target.value)}
            onFocus={e => { setDraft(String(value).replace('.', ',')); e.currentTarget.select() }}
            onBlur={commit}
            onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); (e.currentTarget as HTMLInputElement).blur() } }}
            type="text"
            inputMode={decimal ? 'decimal' : 'numeric'}
            style={{
              width: `${Math.max(2, (draft ?? String(value)).length)}ch`,
              // ≥16px on mobile, otherwise iOS zooms the page on focus
              fontSize: 26, fontWeight: 800, lineHeight: 1.15, textAlign: 'center',
              background: 'transparent', border: 'none', outline: 'none', padding: 0,
              color: 'var(--text)', minWidth: 0,
            }}
          />
          {unit && <span style={{ fontSize: 14, fontWeight: 700, color: 'var(--muted)' }}>{unit}</span>}
        </div>
      </div>

      <button
        type="button" aria-label={`${label} víc`} style={btn} disabled={disabled}
        onPointerDown={() => press(1)} onPointerUp={() => release(1)}
        onPointerLeave={cancel} onPointerCancel={cancel} onContextMenu={e => e.preventDefault()}
      ><Plus size={20} /></button>
    </div>
  )
}
