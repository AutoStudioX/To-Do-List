'use client'
import React, { useCallback, useEffect, useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { Task } from '@/lib/types'
import Modal from '@/components/Modal'
import Select from '@/components/Select'
import DatePicker from '@/components/DatePicker'
import { Toast, useToast } from '@/components/Toast'
import { useConfirm } from '@/components/ConfirmDialog'
import { Plus, Trash2, Pencil, Calendar, Folder } from 'lucide-react'

const priorityBorder: Record<string, string> = {
  High: '#e53e3e',
  Medium: '#f59e0b',
  Low: '#10b981',
}
const priorityDot: Record<string, string> = {
  High: '#e53e3e',
  Medium: '#f59e0b',
  Low: '#10b981',
}
const statusConfig: Record<string, { dot: string; label: string }> = {
  'Todo': { dot: '#9ca3af', label: 'Todo' },
  'In Progress': { dot: '#3b82f6', label: 'In Progress' },
  'Done': { dot: '#10b981', label: 'Done' },
}

const inputStyle: React.CSSProperties = {
  width: '100%', background: 'var(--input-bg)', border: '1px solid var(--border)',
  borderRadius: 8, padding: '10px 14px', color: 'var(--text)', fontSize: 14, outline: 'none',
}
const labelStyle: React.CSSProperties = { fontSize: 13, color: 'var(--muted)', display: 'block', marginBottom: 6, fontWeight: 500 }
const todayISO = () => { const d = new Date(); return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}` }
const emptyForm = { nazev: '', priorita: 'Medium' as Task['priorita'], deadline: todayISO(), status: 'Todo' as Task['status'], projekt: '' }

export default function UkolyPage() {
  const [tasks, setTasks] = useState<Task[]>([])
  const [loading, setLoading] = useState(false)
  const [modalOpen, setModalOpen] = useState(false)
  const [editTask, setEditTask] = useState<Task | null>(null)
  const [form, setForm] = useState(emptyForm)
  const [filterStatus, setFilterStatus] = useState('All')
  const [filterPriority, setFilterPriority] = useState('All')
  const [filterProjekt, setFilterProjekt] = useState('All')
  const [saving, setSaving] = useState(false)
  const [hoveredId, setHoveredId] = useState<string | null>(null)
  const [formError, setFormError] = useState('')
  const { toast, showToast, hideToast } = useToast()
  const { confirm, dialog: confirmDialog } = useConfirm()

  const load = useCallback(async () => {
    const supabase = createClient()
    try {
      const { data: { session } } = await supabase.auth.getSession()
      const user = session?.user
      if (!user) return
      const { data } = await supabase.from('ukoly').select('*').eq('user_id', user.id).order('created_at', { ascending: false })
      setTasks(data || [])
    } catch { } finally { setLoading(false) }
  }, [])

  useEffect(() => { load() }, [load])
  useEffect(() => {
    window.addEventListener('voice-data-changed', load)
    return () => window.removeEventListener('voice-data-changed', load)
  }, [load])

  function openAdd() { setForm(emptyForm); setEditTask(null); setFormError(''); setModalOpen(true) }
  function openEdit(t: Task) {
    setForm({ nazev: t.nazev, priorita: t.priorita, deadline: t.deadline || '', status: t.status, projekt: t.projekt || '' })
    setEditTask(t); setModalOpen(true)
  }

  async function save() {
    if (!form.nazev.trim()) { setFormError('Název je povinný'); return }
    const supabase = createClient()
    setSaving(true)
    const { data: { session } } = await supabase.auth.getSession()
    const user = session?.user
    if (!user) return
    const payload = { nazev: form.nazev, priorita: form.priorita, deadline: form.deadline || null, status: form.status, projekt: form.projekt || null }
    if (editTask) {
      await supabase.from('ukoly').update(payload).eq('id', editTask.id)
    } else {
      await supabase.from('ukoly').insert({ ...payload, user_id: user.id })
    }
    setSaving(false); setModalOpen(false); setFormError(''); load()
    showToast(editTask ? 'Úkol upraven' : 'Úkol přidán')
  }

  async function deleteTask(id: string) {
    if (!await confirm('Smazat úkol?')) return
    await createClient().from('ukoly').delete().eq('id', id)
    load()
    showToast('Úkol smazán')
  }

  const priorityOrder: Record<string, number> = { High: 0, Medium: 1, Low: 2 }
  const projekty = Array.from(new Set(tasks.map(t => t.projekt).filter((p): p is string => !!p))).sort()
  const filtered = tasks
    .filter(t =>
      (filterStatus === 'All' || t.status === filterStatus) &&
      (filterPriority === 'All' || t.priorita === filterPriority) &&
      (filterProjekt === 'All' || t.projekt === filterProjekt)
    )
    .sort((a, b) => {
      const aDone = a.status === 'Done' ? 1 : 0
      const bDone = b.status === 'Done' ? 1 : 0
      if (aDone !== bDone) return aDone - bDone
      const pDiff = (priorityOrder[a.priorita] ?? 1) - (priorityOrder[b.priorita] ?? 1)
      if (pDiff !== 0) return pDiff
      const aD = a.deadline ? new Date(a.deadline).getTime() : Infinity
      const bD = b.deadline ? new Date(b.deadline).getTime() : Infinity
      return aD - bD
    })
  const openCount = tasks.filter(t => t.status !== 'Done').length

  const pillBase: React.CSSProperties = {
    padding: '5px 14px', borderRadius: 20, fontSize: 13, fontWeight: 500,
    cursor: 'pointer', border: '1px solid transparent', transition: 'all 0.15s', outline: 'none',
  }

  return (
    <div>
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 20 }}>
        <div style={{ display: 'flex', alignItems: 'baseline', gap: 10 }}>
          <h1 style={{ fontSize: 26, fontWeight: 700, color: 'var(--text)', margin: 0 }}>Úkoly</h1>
          <span style={{ fontSize: 14, color: 'var(--muted)', fontWeight: 500 }}>{openCount} otevřených</span>
        </div>
        <button onClick={openAdd} style={{ background: '#e53e3e', color: 'white', border: 'none', borderRadius: 10, padding: '10px 20px', fontSize: 14, fontWeight: 600, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 7, boxShadow: '0 4px 14px rgba(229,62,62,0.35)' }}>
          <Plus size={16} /> Přidat úkol
        </button>
      </div>

      {/* Filter pills */}
      <div className="filter-bar" style={{ display: 'flex', gap: 8, marginBottom: 20, flexWrap: 'wrap' }}>
        <div style={{ display: 'flex', gap: 6 }}>
          {(['All', 'Todo', 'In Progress', 'Done'] as const).map(s => {
            const activeColors: Record<string, { bg: string; color: string; border: string }> = {
              All: { bg: 'var(--text)', color: 'var(--bg)', border: 'var(--text)' },
              Todo: { bg: '#e5e7eb', color: '#374151', border: '#9ca3af' },
              'In Progress': { bg: '#dbeafe', color: '#1d4ed8', border: '#3b82f6' },
              Done: { bg: '#d1fae5', color: '#065f46', border: '#10b981' },
            }
            const active = filterStatus === s
            return (
              <button key={s} onClick={() => setFilterStatus(s)} style={{
                ...pillBase,
                background: active ? activeColors[s].bg : 'var(--card)',
                color: active ? activeColors[s].color : 'var(--muted)',
                border: `1px solid ${active ? activeColors[s].border : 'var(--border)'}`,
                fontWeight: active ? 600 : 500,
              }}>{s === 'All' ? 'Vše' : s}</button>
            )
          })}
        </div>
        <div className="desktop-only" style={{ width: 1, background: 'var(--border)', alignSelf: 'stretch' }} />
        <div style={{ display: 'flex', gap: 6 }}>
          {(['All', 'High', 'Medium', 'Low'] as const).map(p => {
            const priorityActive: Record<string, { bg: string; color: string; border: string }> = {
              All: { bg: 'var(--text)', color: 'var(--bg)', border: 'var(--text)' },
              High: { bg: '#fee2e2', color: '#c53030', border: '#e53e3e' },
              Medium: { bg: '#fef3c7', color: '#b45309', border: '#f59e0b' },
              Low: { bg: '#d1fae5', color: '#065f46', border: '#10b981' },
            }
            const active = filterPriority === p
            return (
              <button key={p} onClick={() => setFilterPriority(p)} style={{
                ...pillBase,
                background: active ? priorityActive[p].bg : 'var(--card)',
                color: active ? priorityActive[p].color : 'var(--muted)',
                border: `1px solid ${active ? priorityActive[p].border : 'var(--border)'}`,
                fontWeight: active ? 600 : 500,
              }}>{p === 'All' ? 'Vše' : p}</button>
            )
          })}
        </div>
        {projekty.length > 0 && (
          <>
            <div className="desktop-only" style={{ width: 1, background: 'var(--border)', alignSelf: 'stretch' }} />
            <div style={{ width: 160 }}>
              <Select
                value={filterProjekt}
                onChange={setFilterProjekt}
                options={[{ value: 'All', label: 'Vše' }, ...projekty.map(p => ({ value: p, label: p }))]}
                style={{ padding: '5px 12px', fontSize: 13, borderRadius: 20 }}
              />
            </div>
          </>
        )}
      </div>

      {/* Cards */}
      {loading ? (
        <div style={{ color: 'var(--muted)', padding: 24 }}>Načítání...</div>
      ) : filtered.length === 0 ? (
        <div style={{ color: 'var(--muted)', padding: 32, textAlign: 'center', background: 'var(--card)', borderRadius: 14, border: '1px solid var(--border)' }}>Žádné úkoly</div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          {filtered.flatMap((t, i) => {
            const isDivider = t.status === 'Done' && i > 0 && filtered[i - 1].status !== 'Done'
            const isOverdue = t.status !== 'Done' && t.deadline && new Date(t.deadline) < new Date(new Date().toDateString())
            const card = <div key={t.id}
              onMouseEnter={() => setHoveredId(t.id)}
              onMouseLeave={() => setHoveredId(null)}
              style={{
                background: isOverdue ? '#fff5f5' : 'var(--card)',
                border: `1px solid ${isOverdue ? '#fca5a5' : 'var(--border)'}`,
                borderRadius: 12,
                display: 'flex',
                overflow: 'hidden',
                boxShadow: hoveredId === t.id ? '0 8px 24px rgba(0,0,0,0.14)' : '0 2px 8px rgba(0,0,0,0.06)',
                transform: hoveredId === t.id ? 'translateY(-2px)' : 'translateY(0)',
                transition: 'box-shadow 0.18s, transform 0.18s',
              }}
            >
              {/* Priority border */}
              <div style={{ width: 5, alignSelf: 'stretch', background: t.status === 'Done' ? '#4b5563' : priorityBorder[t.priorita], flexShrink: 0 }} />

              {/* Content + actions */}
              <div style={{ flex: 1, padding: '12px 14px', minWidth: 0, display: 'flex', flexDirection: 'column', gap: 8 }}>
                {/* Row 1: title + action buttons */}
                <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 8 }}>
                  <div style={{ fontSize: 15, fontWeight: 600, color: t.status === 'Done' ? 'var(--muted)' : 'var(--text)', textDecoration: t.status === 'Done' ? 'line-through' : 'none', lineHeight: 1.3 }}>{t.nazev}</div>
                  <div style={{ display: 'flex', gap: 6, flexShrink: 0 }}>
                    <button onClick={() => openEdit(t)} style={{ background: 'var(--border)', border: 'none', borderRadius: 7, color: 'var(--text)', cursor: 'pointer', padding: '5px 7px', display: 'flex', alignItems: 'center' }}>
                      <Pencil size={13} />
                    </button>
                    <button onClick={() => deleteTask(t.id)} style={{ background: '#fee2e2', border: 'none', borderRadius: 7, color: '#e53e3e', cursor: 'pointer', padding: '5px 7px', display: 'flex', alignItems: 'center' }}>
                      <Trash2 size={13} />
                    </button>
                  </div>
                </div>
                {/* Row 2: meta */}
                <div style={{ display: 'flex', gap: 12, alignItems: 'center', flexWrap: 'wrap' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                    <span style={{ width: 7, height: 7, borderRadius: '50%', background: priorityDot[t.priorita], flexShrink: 0, display: 'inline-block' }} />
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
            return isDivider ? [<div key={`div-${t.id}`} style={{ borderTop: '1px solid var(--muted)', margin: '8px 0', opacity: 0.5 }} />, card] : [card]
          })}
        </div>
      )}

      {toast && <Toast message={toast.message} type={toast.type} onClose={hideToast} />}
      {confirmDialog}

      <Modal isOpen={modalOpen} onClose={() => { setModalOpen(false); setFormError('') }} title={editTask ? 'Upravit úkol' : 'Nový úkol'}>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
          <div>
            <label style={labelStyle}>Název</label>
            <input style={{ ...inputStyle, borderColor: formError ? '#e53e3e' : undefined }} value={form.nazev} onChange={e => { setForm({ ...form, nazev: e.target.value }); setFormError('') }} autoFocus />
            {formError && <div style={{ fontSize: 12, color: '#e53e3e', marginTop: 4 }}>{formError}</div>}
          </div>
          <div><label style={labelStyle}>Priorita</label>
            <Select value={form.priorita} onChange={val => setForm({ ...form, priorita: val as Task['priorita'] })} options={[{ value: 'High', label: 'High' }, { value: 'Medium', label: 'Medium' }, { value: 'Low', label: 'Low' }]} />
          </div>
          <div><label style={labelStyle}>Deadline</label><DatePicker value={form.deadline} onChange={v => setForm({ ...form, deadline: v })} /></div>
          <div><label style={labelStyle}>Status</label>
            <Select value={form.status} onChange={val => setForm({ ...form, status: val as Task['status'] })} options={[{ value: 'Todo', label: 'Todo' }, { value: 'In Progress', label: 'In Progress' }, { value: 'Done', label: 'Done' }]} />
          </div>
          <div><label style={labelStyle}>Projekt</label><input style={inputStyle} value={form.projekt} onChange={e => setForm({ ...form, projekt: e.target.value })} /></div>
          <div style={{ display: 'flex', gap: 12, justifyContent: 'flex-end', marginTop: 8 }}>
            <button onClick={() => setModalOpen(false)} style={{ background: 'transparent', border: '1px solid var(--border)', borderRadius: 8, padding: '10px 16px', color: 'var(--text)', cursor: 'pointer', fontSize: 14 }}>Zrušit</button>
            <button onClick={save} disabled={saving} style={{ background: '#e53e3e', border: 'none', borderRadius: 8, padding: '10px 20px', color: 'white', cursor: 'pointer', fontSize: 14, fontWeight: 600, opacity: saving ? 0.6 : 1 }}>
              {saving ? 'Ukládám...' : 'Uložit'}
            </button>
          </div>
        </div>
      </Modal>
    </div>
  )
}
