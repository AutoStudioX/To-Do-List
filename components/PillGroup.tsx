'use client'

// Inline pill button group — replaces dropdowns for fields with 2-4 options.
// Selected = red (#e53e3e) bg / white text; unselected = light gray / dark text.
// Buttons sit side by side and wrap to a second row on narrow screens.
export type PillOption<T extends string> = { value: T; label: string; icon?: React.ReactNode }

export default function PillGroup<T extends string>({
  value, onChange, options,
}: {
  value: T
  onChange: (val: T) => void
  options: PillOption<T>[]
}) {
  return (
    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
      {options.map(opt => {
        const active = value === opt.value
        return (
          <button
            key={opt.value}
            type="button"
            onClick={() => onChange(opt.value)}
            style={{
              flex: '1 1 auto',
              minWidth: 'fit-content',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              gap: 6,
              padding: '10px 14px',
              borderRadius: 8,
              border: active ? '1px solid #e53e3e' : '1px solid var(--border)',
              background: active ? '#e53e3e' : 'var(--input-bg)',
              color: active ? '#ffffff' : 'var(--text)',
              fontSize: 14,
              fontWeight: 600,
              cursor: 'pointer',
              whiteSpace: 'nowrap',
              transition: 'background 0.12s, border-color 0.12s',
            }}
          >
            {opt.icon}
            {opt.label}
          </button>
        )
      })}
    </div>
  )
}
