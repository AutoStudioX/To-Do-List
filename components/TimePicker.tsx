'use client'
import { useState } from 'react'

// Optional time-of-day picker for a task deadline. Value is 'HH:MM' or '' (no time).
// Pill quick-choices + a "Vlastní čas" toggle revealing a native time input.
const QUICK = [
  { value: '08:00', label: 'Ráno 8:00' },
  { value: '12:00', label: 'Poledne 12:00' },
  { value: '15:00', label: 'Odpoledne 15:00' },
  { value: '18:00', label: 'Večer 18:00' },
]

export default function TimePicker({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  const norm = (value || '').slice(0, 5)
  const isQuick = QUICK.some(q => q.value === norm)
  const [custom, setCustom] = useState(norm !== '' && !isQuick)

  const pill = (key: string, label: string, active: boolean, onClick: () => void): React.ReactNode => (
    <button
      key={key}
      type="button"
      onClick={onClick}
      style={{
        padding: '8px 12px',
        borderRadius: 8,
        border: `1px solid ${active ? '#E8192C' : 'var(--border)'}`,
        background: active ? '#E8192C' : 'var(--input-bg)',
        color: active ? '#fff' : 'var(--text)',
        fontSize: 13,
        fontWeight: 600,
        cursor: 'pointer',
        whiteSpace: 'nowrap',
        touchAction: 'manipulation',
      }}
    >
      {label}
    </button>
  )

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
        {pill('none', 'Bez času', norm === '' && !custom, () => { setCustom(false); onChange('') })}
        {QUICK.map(q => pill(q.value, q.label, !custom && norm === q.value, () => { setCustom(false); onChange(q.value) }))}
        {pill('custom', 'Vlastní čas', custom, () => setCustom(true))}
      </div>
      {custom && (
        <input
          type="time"
          value={norm}
          onChange={e => onChange(e.target.value)}
          style={{
            width: 'fit-content', background: 'var(--input-bg)', border: '1px solid var(--border)',
            borderRadius: 8, padding: '8px 12px', color: 'var(--text)', fontSize: 14, outline: 'none',
          }}
        />
      )}
    </div>
  )
}
