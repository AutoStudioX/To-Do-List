'use client'
import { useState } from 'react'
import StepperField from '@/components/gym/StepperField'

// Volitelný čas 'HH:MM' nebo '' (bez času).
//
// ŽÁDNÝ `input type="time"`. Nativní výběr času vypadá jako cizí prvek —
// světlý panel se systémovým chrome, který ignoruje tmavý motiv a na každé
// platformě vypadá jinak. Rychlé volby jsou pilulky, vlastní čas dva steppery.
const QUICK = [
  { value: '06:30', label: '6:30' },
  { value: '08:00', label: '8:00' },
  { value: '12:00', label: '12:00' },
  { value: '18:00', label: '18:00' },
]

const pad = (n: number) => String(n).padStart(2, '0')
const clamp = (v: number, max: number) => Math.min(max, Math.max(0, Math.round(v)))

export default function TimePicker({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  const norm = (value || '').slice(0, 5)
  const isQuick = QUICK.some(q => q.value === norm)
  const [custom, setCustom] = useState(norm !== '' && !isQuick)

  const [h, m] = norm ? norm.split(':').map(Number) : [8, 0]

  const set = (hh: number, mm: number) => onChange(`${pad(clamp(hh, 23))}:${pad(clamp(mm, 59))}`)

  const pill = (key: string, label: string, active: boolean, onClick: () => void) => (
    <button
      key={key} type="button" onClick={onClick}
      style={{
        minHeight: 44, padding: '0 14px', borderRadius: 10,
        border: `1px solid ${active ? 'var(--accent)' : 'var(--border)'}`,
        background: active ? 'var(--accent)' : 'var(--input-bg)',
        color: active ? '#fff' : 'var(--text)',
        fontSize: 14, fontWeight: 600, cursor: 'pointer', whiteSpace: 'nowrap',
        touchAction: 'manipulation',
      }}
    >{label}</button>
  )

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
        {pill('none', 'Bez času', norm === '' && !custom, () => { setCustom(false); onChange('') })}
        {QUICK.map(q => pill(q.value, q.label, !custom && norm === q.value, () => { setCustom(false); onChange(q.value) }))}
        {pill('custom', 'Vlastní', custom, () => { setCustom(true); if (!norm) set(8, 0) })}
      </div>

      {custom && (
        // Dva steppery vedle sebe potřebují ~380 px. V užším místě — třeba
        // v rozbaleném dni v editoru návyku na 390px — se do řádku nevešly
        // a tlačítko „+" u minut zůstalo useknuté za okrajem. Základ 200 px
        // je proto zalomí pod sebe dřív, než by se musely mačkat.
        <div style={{
          display: 'flex', flexWrap: 'wrap', gap: 12, padding: 12, borderRadius: 12,
          border: '1px solid var(--border)', background: 'var(--input-bg)',
        }}>
          <div style={{ flex: '1 1 200px', minWidth: 0 }}>
            <StepperField label="Hodina" value={h} step={1} min={0}
              onChange={v => set(v > 23 ? 0 : v, m)} />
          </div>
          <div style={{ flex: '1 1 200px', minWidth: 0 }}>
            <StepperField label="Minuta" value={m} step={5} min={0}
              onChange={v => set(h, v > 59 ? 0 : v)} />
          </div>
        </div>
      )}
    </div>
  )
}
