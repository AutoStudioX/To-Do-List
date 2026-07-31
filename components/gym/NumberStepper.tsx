'use client'
import { Minus, Plus } from 'lucide-react'

// Big +/- stepper with a direct-entry input in the middle. Mobile-friendly
// (44px tap targets) — easier to hit than a keyboard between sets.
export default function NumberStepper({
  value, onChange, step, min = 0, label, allowDecimal = false,
}: {
  value: number
  onChange: (v: number) => void
  step: number
  min?: number
  label?: string
  allowDecimal?: boolean
}) {
  const round = (v: number) => {
    const r = Math.max(min, Math.round(v / step) * step)
    return allowDecimal ? Math.round(r * 100) / 100 : Math.round(r)
  }
  const btn: React.CSSProperties = {
    minWidth: 44, minHeight: 44, borderRadius: 10, border: '1px solid var(--border)',
    background: 'var(--input-bg)', color: 'var(--text)', cursor: 'pointer',
    display: 'flex', alignItems: 'center', justifyContent: 'center', touchAction: 'manipulation', flexShrink: 0,
  }
  return (
    <div>
      {label && <div style={{ fontSize: 12, color: 'var(--muted)', marginBottom: 4, fontWeight: 500 }}>{label}</div>}
      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
        <button type="button" aria-label="Míň" style={btn} onClick={() => onChange(round(value - step))}><Minus size={18} /></button>
        <input
          type="text"
          inputMode="decimal"
          value={String(value).replace('.', ',')}
          onChange={e => {
            const n = parseFloat(e.target.value.replace(',', '.'))
            if (!Number.isNaN(n)) onChange(allowDecimal ? n : Math.round(n))
          }}
          style={{
            width: 64, minHeight: 44, textAlign: 'center', fontSize: 18, fontWeight: 700,
            background: 'var(--input-bg)', border: '1px solid var(--border)', borderRadius: 10,
            color: 'var(--text)', outline: 'none',
          }}
        />
        <button type="button" aria-label="Víc" style={btn} onClick={() => onChange(round(value + step))}><Plus size={18} /></button>
      </div>
    </div>
  )
}
