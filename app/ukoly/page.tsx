'use client'
import { useCallback, useEffect, useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { Task } from '@/lib/types'
import Modal from '@/components/Modal'
import DatePicker from '@/components/DatePicker'
import { Plus, Trash2, Pencil, Calendar, Folder } from 'lucide-react'

const priorityBorder: Record<string, string> = {
  High: '#e53e3e',
  Medium: '#f59e0b',
  Low: '#9ca3af',
}
const priorityBadge: Record<string, { bg: string; color: string }> = {
  High: { bg: '#fee2e2', color: '#e53e3e' },
  Medium: { bg: '#fef3c7', color: '#d97706' },
  Low: { bg: '#f3f4f6', color: '#6b7280' },
}
const statusBadge: Record<string, { bg: string; color: string }> = {
  'Todo': { bg: '#f3f4f6', color: '#6b7280' },
  'In Progress': { bg: '#dbeafe', color: '#2563eb' },
  'Done': { bg: '#d1fae5', color: '#059669' },
}

const inputStyle: React.CSSProperties = {
  width: '100%', background: 'var(--input-bg)', border: '1px solid var(--border)',
  borderRadius: 8, padding: '10px 14px', color: 'var(--text)', fontSize: 14, outline: 'none',
}
const labelStyle: React.CSSProperties = { fontSize: 13, color: 'var(--muted)', display: 'block', marginBottom: 6, fontWeight: 500 }
const emptyForm = { nazev: '', priorita: 'Medium' as Task['priorita'], deadline: '', status: 'Todo' as Task['status'], projekt: '' }

export default function UkolyPage() {
  const [tasks, setTasks] = useState<Task[]>([])
  const [loading, setLoading] = useState(false)
  const [modalOpen, setModalOpen] = useState(false)
  const [editTask, setEditTask] = useState<Task | null>(null)
  const [form, setForm] = useState(emptyForm)
  const [filterStatus, setFilterStatus] = useState('All')
  const [filterPriority, setFilterPriority] = useState('All')
  const [saving, setSaving] = useState(false)
  const [hoveredId, setHoveredId] = useState<string | null>(null)

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

  function openAdd() { setForm(emptyForm); setEditTask(null); setModalOpen(true) }
  function openEdit(t: Task) {
    setForm({ nazev: t.nazev, priorita: t.priorita, deadline: t.deadline || '', status: t.status, projekt: t.projekt || '' })
    setEditTask(t); setModalOpen(true)
  }

  async function save() {
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
    setSaving(false); setModalOpen(false); load()
  }

  async function deleteTask(id: string) {
    if (!confirm('Smazat úkol?')) return
    await createClient().from('ukoly').delete().eq('id', id)
    load()
  }

  const filtered = tasks.filter(t =>
    (filterStatus === 'All' || t.status === filterStatus) &&
    (filterPriority === 'All' || t.priorita === filterPriority)
  )
  const openCount = tasks.filter(t => t.status !== 'Done').length

  const pillBase: React.CSSProperties = {
    padding: '5px 14px', borderRadius: 20, fontSize: 13, fontWeight: 500,
    cursor: 'pointer', border: '1px solid transparent', transition: 'all 0.15s',
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
      <div style={{ display: 'flex', gap: 16, marginBottom: 20, flexWrap: 'wrap' }}>
        <div style={{ display: 'flex', gap: 6 }}>
          {['All', 'Todo', 'In Progress', 'Done'].map(s => (
            <button key={s} onClick={() => setFilterStatus(s)} style={{
              ...pillBase,
              background: filterStatus === s ? 'var(--text)' : 'var(--card)',
              color: filterStatus === s ? 'var(--bg)' : 'var(--muted)',
              border: `1px solid ${filterStatus === s ? 'var(--text)' : 'var(--border)'}`,
            }}>{s === 'All' ? 'Vše' : s}</button>
          ))}
        </div>
        <div style={{ display: 'flex', gap: 6 }}>
          {(['All', 'High', 'Medium', 'Low'] as const).map(p => (
            <button key={p} onClick={() => setFilterPriority(p)} style={{
              ...pillBase,
              background: filterPriority === p ? (p === 'All' ? 'var(--text)' : priorityBorder[p]) : 'var(--card)',
              color: filterPriority === p ? (p === 'All' ? 'var(--bg)' : 'white') : 'var(--muted)',
              border: `1px solid ${filterPriority === p ? (p === 'All' ? 'var(--text)' : priorityBorder[p]) : 'var(--border)'}`,
            }}>{p === 'All' ? 'Vše' : p}</button>
          ))}
        </div>
      </div>

      {/* Cards */}
      {loading ? (
        <div style={{ color: 'var(--muted)', padding: 24 }}>Načítání...</div>
      ) : filtered.length === 0 ? (
        <div style={{ color: 'var(--muted)', padding: 32, textAlign: 'center', background: 'var(--card)', borderRadius: 14, border: '1px solid var(--border)' }}>Žádné úkoly</div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          {filtered.map(t => (
            <div key={t.id}
              onMouseEnter={() => setHoveredId(t.id)}
              onMouseLeave={() => setHoveredId(null)}
              style={{
                background: 'var(--card)',
                border: '1px solid var(--border)',
                borderRadius: 12,
                display: 'flex',
                alignItems: 'center',
                overflow: 'hidden',
                boxShadow: hoveredId === t.id ? '0 8px 24px rgba(0,0,0,0.14)' : '0 2px 8px rgba(0,0,0,0.06)',
                transform: hoveredId === t.id ? 'translateY(-2px)' : 'translateY(0)',
                transition: 'box-shadow 0.18s, transform 0.18s',
              }}
            >
              {/* Priority border */}
              <div style={{ width: 5, alignSelf: 'stretch', background: priorityBorder[t.priorita], flexShrink: 0 }} />

              {/* Content */}
              <div style={{ flex: 1, padding: '14px 18px', minWidth: 0 }}>
                <div style={{ fontSize: 15, fontWeight: 600, color: t.status === 'Done' ? 'var(--muted)' : 'var(--text)', textDecoration: t.status === 'Done' ? 'line-through' : 'none', marginBottom: 5 }}>{t.nazev}</div>
                <div style={{ display: 'flex', gap: 14, alignItems: 'center' }}>
                  {t.deadline && (
                    <span style={{ display: 'flex', alignItems: 'center', gap: 4, fontSize: 12, color: 'var(--muted)' }}>
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

              {/* Badges + actions */}
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '0 14px', flexShrink: 0 }}>
                <span style={{ fontSize: 11, padding: '3px 10px', borderRadius: 20, fontWeight: 600, ...priorityBadge[t.priorita] }}>{t.priorita}</span>
                <span style={{ fontSize: 11, padding: '3px 10px', borderRadius: 20, fontWeight: 600, ...statusBadge[t.status] }}>{t.status}</span>
                <button onClick={() => openEdit(t)} style={{ background: 'var(--border)', border: 'none', borderRadius: 7, color: 'var(--text)', cursor: 'pointer', padding: '6px 8px', display: 'flex', alignItems: 'center' }}>
                  <Pencil size={13} />
                </button>
                <button onClick={() => deleteTask(t.id)} style={{ background: '#fee2e2', border: 'none', borderRadius: 7, color: '#e53e3e', cursor: 'pointer', padding: '6px 8px', display: 'flex', alignItems: 'center' }}>
                  <Trash2 size={13} />
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      <Modal isOpen={modalOpen} onClose={() => setModalOpen(false)} title={editTask ? 'Upravit úkol' : 'Nový úkol'}>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
          <div><label style={labelStyle}>Název</label><input style={inputStyle} value={form.nazev} onChange={e => setForm({ ...form, nazev: e.target.value })} autoFocus /></div>
          <div><label style={labelStyle}>Priorita</label>
            <select style={{ ...inputStyle, cursor: 'pointer' }} value={form.priorita} onChange={e => setForm({ ...form, priorita: e.target.value as Task['priorita'] })}>
              <option value="High">High</option><option value="Medium">Medium</option><option value="Low">Low</option>
            </select>
          </div>
          <div><label style={labelStyle}>Deadline</label><DatePicker value={form.deadline} onChange={v => setForm({ ...form, deadline: v })} /></div>
          <div><label style={labelStyle}>Status</label>
            <select style={{ ...inputStyle, cursor: 'pointer' }} value={form.status} onChange={e => setForm({ ...form, status: e.target.value as Task['status'] })}>
              <option value="Todo">Todo</option><option value="In Progress">In Progress</option><option value="Done">Done</option>
            </select>
          </div>
          <div><label style={labelStyle}>Projekt</label><input style={inputStyle} value={form.projekt} onChange={e => setForm({ ...form, projekt: e.target.value })} /></div>
          <div style={{ display: 'flex', gap: 12, justifyContent: 'flex-end', marginTop: 8 }}>
            <button onClick={() => setModalOpen(false)} style={{ background: 'transparent', border: '1px solid var(--border)', borderRadius: 8, padding: '10px 16px', color: 'var(--text)', cursor: 'pointer', fontSize: 14 }}>Zrušit</button>
            <button onClick={save} disabled={saving || !form.nazev} style={{ background: '#e53e3e', border: 'none', borderRadius: 8, padding: '10px 20px', color: 'white', cursor: 'pointer', fontSize: 14, fontWeight: 600, opacity: saving || !form.nazev ? 0.6 : 1 }}>
              {saving ? 'Ukládám...' : 'Uložit'}
            </button>
          </div>
        </div>
      </Modal>
    </div>
  )
}
