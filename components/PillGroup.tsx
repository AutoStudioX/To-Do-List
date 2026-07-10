'use client'

// Inline pill button group — replaces dropdowns for fields with 2-4 options.
// Selected state reuses the app's existing badge colors: pass `color`
// ({ bg, text, border }) per option — the same triples used by the status /
// priority / transaction-type badges elsewhere. Options without a `color` fall
// back to solid red (#e53e3e). Unselected = neutral input background.
// Buttons sit side by side and wrap to a second row on narrow screens.
export type PillColor = { bg: string; text: string; border: string }
export type PillOption<T extends string> = { value: T; label: string; icon?: React.ReactNode; color?: PillColor }

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
        const activeBg = opt.color ? opt.color.bg : '#e53e3e'
        const activeText = opt.color ? opt.color.text : '#ffffff'
        const activeBorder = opt.color ? opt.color.border : '#e53e3e'
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
              border: `1px solid ${active ? activeBorder : 'var(--border)'}`,
              background: active ? activeBg : 'var(--input-bg)',
              color: active ? activeText : 'var(--text)',
              fontSize: 14,
              fontWeight: 600,
              cursor: 'pointer',
              whiteSpace: 'nowrap',
              transition: 'background 0.12s, border-color 0.12s, color 0.12s',
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
