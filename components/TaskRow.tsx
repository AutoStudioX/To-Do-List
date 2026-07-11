import React from 'react'
import { Pencil, Trash2, Calendar, Folder } from 'lucide-react'
import { Task } from '@/lib/types'

const priorityBorder: Record<string, string> = {
  High: '#e53e3e',
  Medium: '#f59e0b',
  Low: '#10b981',
}
const statusConfig: Record<string, { dot: string; label: string }> = {
  'Todo': { dot: '#9ca3af', label: 'Todo' },
  'In Progress': { dot: '#3b82f6', label: 'In Progress' },
  'Done': { dot: '#10b981', label: 'Done' },
}

interface Props {
  task: Task
  expanded: boolean
  showDivider: boolean
  onToggleDone: (task: Task) => void
  onToggleExpand: (id: string) => void
  onEdit: (task: Task) => void
  onDelete: (id: string) => void
  rowRef?: (el: HTMLDivElement | null) => void
}

function TaskRowImpl({ task: t, expanded, showDivider, onToggleDone, onToggleExpand, onEdit, onDelete, rowRef }: Props) {
  const isOverdue = t.status !== 'Done' && !!t.deadline && new Date(t.deadline) < new Date(new Date().toDateString())

  return (
    <div ref={rowRef}>
      {showDivider && <div style={{ borderTop: '1px solid var(--muted)', margin: '8px 0', opacity: 0.5 }} />}
      <div
        className="task-row"
        style={{
          background: isOverdue ? 'var(--overdue-bg)' : 'var(--card)',
          border: `1px solid ${isOverdue ? 'var(--overdue-border)' : 'var(--border)'}`,
          borderRadius: 12,
          display: 'flex',
          overflow: 'hidden',
          marginBottom: 10,
        }}
      >
        {/* Priority border */}
        <div style={{ width: 5, alignSelf: 'stretch', background: t.status === 'Done' ? '#4b5563' : priorityBorder[t.priorita], flexShrink: 0 }} />

        {/* Content + actions */}
        <div style={{ flex: 1, padding: '12px 14px', minWidth: 0, display: 'flex', flexDirection: 'column', gap: 8 }}>
          {/* Row 1: checkbox + title + action buttons */}
          <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 8 }}>
            <div style={{ display: 'flex', alignItems: 'flex-start', gap: 5, minWidth: 0, flex: 1 }}>
              <label
                onClick={e => e.stopPropagation()}
                style={{ minWidth: 44, minHeight: 44, marginLeft: -10, marginTop: -10, display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', flexShrink: 0, touchAction: 'manipulation' }}
              >
                <input
                  type="checkbox"
                  checked={t.status === 'Done'}
                  onChange={() => onToggleDone(t)}
                  style={{ width: 24, height: 24, accentColor: '#e53e3e', cursor: 'pointer', touchAction: 'manipulation' }}
                />
              </label>
              <div
                onClick={() => onToggleExpand(t.id)}
                style={{
                  fontSize: 15, fontWeight: 600, lineHeight: 1.3, cursor: 'pointer', touchAction: 'manipulation',
                  color: t.status === 'Done' ? 'var(--muted)' : 'var(--text)',
                  textDecoration: t.status === 'Done' ? 'line-through' : 'none',
                  whiteSpace: expanded ? 'normal' : 'nowrap',
                  overflow: expanded ? 'visible' : 'hidden',
                  textOverflow: 'ellipsis',
                }}
              >
                {t.nazev}
              </div>
            </div>
            <div style={{ display: 'flex', gap: 12, flexShrink: 0 }}>
              <button
                onClick={e => { e.stopPropagation(); onEdit(t) }}
                aria-label="Upravit"
                style={{ minWidth: 44, minHeight: 44, background: 'var(--border)', border: 'none', borderRadius: 8, color: 'var(--text)', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', touchAction: 'manipulation' }}
              >
                <Pencil size={16} />
              </button>
              <button
                onClick={e => { e.stopPropagation(); onDelete(t.id) }}
                aria-label="Smazat"
                style={{ minWidth: 44, minHeight: 44, background: '#fee2e2', border: 'none', borderRadius: 8, color: '#e53e3e', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', touchAction: 'manipulation' }}
              >
                <Trash2 size={16} />
              </button>
            </div>
          </div>
          {/* Row 2: meta */}
          <div style={{ display: 'flex', gap: 12, alignItems: 'center', flexWrap: 'wrap' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
              <span style={{ width: 7, height: 7, borderRadius: '50%', background: priorityBorder[t.priorita], flexShrink: 0, display: 'inline-block' }} />
              <span style={{ fontSize: 12, color: 'var(--muted)', fontWeight: 500 }}>{t.priorita}</span>
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
              <span style={{ width: 7, height: 7, borderRadius: '50%', background: statusConfig[t.status].dot, flexShrink: 0, display: 'inline-block' }} />
              <span style={{ fontSize: 12, color: 'var(--text)', fontWeight: 500 }}>{t.status}</span>
            </div>
            {t.deadline && (
              <span style={{ display: 'flex', alignItems: 'center', gap: 4, fontSize: 12, color: isOverdue ? '#e53e3e' : 'var(--muted)', fontWeight: isOverdue ? 600 : 400 }}>
                <Calendar size={11} /> {new Date(t.deadline).toLocaleDateString('cs-CZ')}
              </span>
            )}
            {t.projekt && (
              <span style={{ display: 'flex', alignItems: 'center', gap: 4, fontSize: 12, color: 'var(--muted)' }}>
                <Folder size={11} /> {t.projekt}
              </span>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}

export default React.memo(TaskRowImpl)
