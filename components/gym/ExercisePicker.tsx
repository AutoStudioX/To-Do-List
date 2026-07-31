'use client'
import { useState } from 'react'
import { Search, Plus } from 'lucide-react'
import type { Exercise } from '@/lib/types'

// Modal body: search the catalog, tap to pick, or add a custom exercise.
export default function ExercisePicker({
  exercises, onPick, onAddCustom,
}: {
  exercises: Exercise[]
  onPick: (e: Exercise) => void
  onAddCustom: (name: string) => void
}) {
  const [q, setQ] = useState('')
  const query = q.trim().toLowerCase()
  const filtered = exercises
    .filter(e => !query || e.name.toLowerCase().includes(query) || (e.muscle_group || '').toLowerCase().includes(query))
    .slice(0, 60)
  const exactExists = exercises.some(e => e.name.toLowerCase() === query)

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
      <div style={{ position: 'relative' }}>
        <Search size={16} style={{ position: 'absolute', left: 12, top: '50%', transform: 'translateY(-50%)', color: 'var(--muted)' }} />
        <input
          autoFocus
          value={q}
          onChange={e => setQ(e.target.value)}
          placeholder="Hledat cvik…"
          style={{ width: '100%', minHeight: 44, background: 'var(--input-bg)', border: '1px solid var(--border)', borderRadius: 10, padding: '0 12px 0 38px', color: 'var(--text)', fontSize: 15, outline: 'none' }}
        />
      </div>

      {query && !exactExists && (
        <button
          type="button"
          onClick={() => onAddCustom(q.trim())}
          style={{ display: 'flex', alignItems: 'center', gap: 8, minHeight: 44, background: '#e53e3e', border: 'none', borderRadius: 10, padding: '0 14px', color: '#fff', fontSize: 15, fontWeight: 600, cursor: 'pointer', touchAction: 'manipulation' }}
        >
          <Plus size={16} /> Přidat „{q.trim()}"
        </button>
      )}

      <div style={{ display: 'flex', flexDirection: 'column', gap: 6, maxHeight: '50vh', overflowY: 'auto' }}>
        {filtered.map(e => (
          <button
            key={e.id}
            type="button"
            onClick={() => onPick(e)}
            style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', minHeight: 44, background: 'var(--input-bg)', border: '1px solid var(--border)', borderRadius: 10, padding: '0 14px', color: 'var(--text)', fontSize: 15, cursor: 'pointer', textAlign: 'left', touchAction: 'manipulation' }}
          >
            <span style={{ fontWeight: 500 }}>{e.name}</span>
            {e.muscle_group && <span style={{ fontSize: 12, color: 'var(--muted)' }}>{e.muscle_group}</span>}
          </button>
        ))}
        {filtered.length === 0 && !query && (
          <div style={{ fontSize: 13, color: 'var(--muted)', padding: 8 }}>Začni psát pro hledání cviku.</div>
        )}
      </div>
    </div>
  )
}
