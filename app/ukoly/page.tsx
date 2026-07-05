'use client'
import { useEffect, useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { Task } from '@/lib/types'
import Modal from '@/components/Modal'
import { Plus, Trash2, Pencil } from 'lucide-react'

const priorityColors: Record<string, { bg: string; color: string }> = {
  High: { bg: '#ef444422', color: '#f87171' },
  Medium: { bg: '#f59e0b22', color: '#fbbf24' },
  Low: { bg: '#10b98122', color: '#34d399' },
}
const statusColors: Record<string, { bg: string; color: string }> = {
  'Todo': { bg: '#6b728022', color: '#9ca3af' },
  'In Progress': { bg: '#3b82f622', color: '#60a5fa' },
  'Done': { bg: '#10b98122', color: '#34d399' },
}

const inputStyle: React.CSSProperties = {
  width: '100%', background: '#0f0f0f', border: '1px solid #2a2a2a',
  borderRadius: 8, padding: '10px 14px', color: 'white', fontSize: 14, outline: 'none',
}
const labelStyle: React.CSSProperties = { fontSize: 13, color: '#9ca3af', display: 'block', marginBottom: 6 }

const emptyForm = { nazev: '', priorita: 'Medium' as Task['priorita'], deadline: '', status: 'Todo' as Task['status'], projekt: '' }

export default function UkolyPage() {
  const [tasks, setTasks] = useState<Task[]>([])
  const [loading, setLoading] = useState(true)
  const [modalOpen, setModalOpen] = useState(false)
  const [editTask, setEditTask] = useState<Task | null>(null)
  const [form, setForm] = useState(emptyForm)
  const [filterStatus, setFilterStatus] = useState('All')
  const [filterPriority, setFilterPriority] = useState('All')
  const [saving, setSaving] = useState(false)
  const supabase = createClient()

  async function load() {
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return
    const { data } = await supabase.from('ukoly').select('*').eq('user_id', user.id).order('created_at', { ascending: false })
    setTasks(data || [])
    setLoading(false)
  }

  useEffect(() => { load() }, [])

  function openAdd() { setForm(emptyForm); setEditTask(null); setModalOpen(true) }
  function openEdit(t: Task) {
    setForm({ nazev: t.nazev, priorita: t.priorita, deadline: t.deadline || '', status: t.status, projekt: t.projekt || '' })
    setEditTask(t); setModalOpen(true)
  }

  async function save() {
    setSaving(true)
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return
    const payload = { nazev: form.nazev, priorita: form.priorita, deadline: form.deadline || null, status: form.status, projekt: form.projekt || null }
    if (editTask) {
      await supabase.from('ukoly').update(payload).eq('id', editTask.id)
    } else {
      await supabase.from('ukoly').insert({ ...payload, user_id: user.id })
    }
    setSaving(false)
    setModalOpen(false)
    load()
  }

  async function deleteTask(id: string) {
    if (!confirm('Smazat úkol?')) return
    await supabase.from('ukoly').delete().eq('id', id)
    load()
  }

  const filtered = tasks.filter(t =>
    (filterStatus === 'All' || t.status === filterStatus) &&
    (filterPriority === 'All' || t.priorita === filterPriority)
  )

  const selectStyle: React.CSSProperties = { ...inputStyle, cursor: 'pointer' }

  return (
    <div>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 24 }}>
        <h1 style={{ fontSize: 26, fontWeight: 700 }}>Úkoly</h1>
        <button onClick={openAdd} style={{ background: '#3b82f6', color: 'white', border: 'none', borderRadius: 8, padding: '10px 16px', fontSize: 14, fontWeight: 600, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 6 }}>
          <Plus size={16} /> Přidat úkol
        </button>
      </div>

      {/* Filters */}
      <div style={{ display: 'flex', gap: 12, marginBottom: 20 }}>
        <div>
          <label style={labelStyle}>Status</label>
          <select value={filterStatus} onChange={e => setFilterStatus(e.target.value)} style={{ ...selectStyle, width: 'auto' }}>
            {['All', 'Todo', 'In Progress', 'Done'].map(s => <option key={s} value={s}>{s}</option>)}
          </select>
        </div>
        <div>
          <label style={labelStyle}>Priorita</label>
          <select value={filterPriority} onChange={e => setFilterPriority(e.target.value)} style={{ ...selectStyle, width: 'auto' }}>
            {['All', 'High', 'Medium', 'Low'].map(p => <option key={p} value={p}>{p}</option>)}
          </select>
        </div>
      </div>

      {/* Table */}
      <div style={{ background: '#1a1a1a', border: '1px solid #2a2a2a', borderRadius: 8, overflow: 'hidden' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse' }}>
          <thead>
            <tr style={{ background: '#2a2a2a' }}>
              {['Název', 'Priorita', 'Deadline', 'Status', 'Projekt', ''].map(h => (
                <th key={h} style={{ padding: '12px 16px', textAlign: 'left', fontSize: 13, fontWeight: 500, color: '#9ca3af' }}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr><td colSpan={6} style={{ padding: 24, textAlign: 'center', color: '#6b7280' }}>Načítání...</td></tr>
            ) : filtered.length === 0 ? (
              <tr><td colSpan={6} style={{ padding: 24, textAlign: 'center', color: '#6b7280' }}>Žádné úkoly</td></tr>
            ) : filtered.map(t => (
              <tr key={t.id} style={{ borderBottom: '1px solid #2a2a2a', cursor: 'pointer' }}
                onMouseEnter={e => (e.currentTarget as HTMLElement).style.background = 'rgba(42,42,42,0.3)'}
                onMouseLeave={e => (e.currentTarget as HTMLElement).style.background = 'transparent'}
              >
                <td style={{ padding: '12px 16px', fontSize: 14 }}>{t.nazev}</td>
                <td style={{ padding: '12px 16px' }}>
                  <span style={{ fontSize: 12, padding: '2px 8px', borderRadius: 20, ...priorityColors[t.priorita] }}>{t.priorita}</span>
                </td>
                <td style={{ padding: '12px 16px', fontSize: 13, color: '#9ca3af' }}>
                  {t.deadline ? new Date(t.deadline).toLocaleDateString('cs-CZ') : '—'}
                </td>
                <td style={{ padding: '12px 16px' }}>
                  <span style={{ fontSize: 12, padding: '2px 8px', borderRadius: 20, ...statusColors[t.status] }}>{t.status}</span>
                </td>
                <td style={{ padding: '12px 16px', fontSize: 13, color: '#9ca3af' }}>{t.projekt || '—'}</td>
                <td style={{ padding: '12px 16px' }}>
                  <div style={{ display: 'flex', gap: 8 }}>
                    <button onClick={() => openEdit(t)} style={{ background: 'transparent', border: 'none', color: '#6b7280', cursor: 'pointer', padding: 4 }}>
                      <Pencil size={14} />
                    </button>
                    <button onClick={() => deleteTask(t.id)} style={{ background: 'transparent', border: 'none', color: '#ef4444', cursor: 'pointer', padding: 4 }}>
                      <Trash2 size={14} />
                    </button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <Modal isOpen={modalOpen} onClose={() => setModalOpen(false)} title={editTask ? 'Upravit úkol' : 'Nový úkol'}>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
          <div>
            <label style={labelStyle}>Název</label>
            <input style={inputStyle} value={form.nazev} onChange={e => setForm({ ...form, nazev: e.target.value })} />
          </div>
          <div>
            <label style={labelStyle}>Priorita</label>
            <select style={selectStyle} value={form.priorita} onChange={e => setForm({ ...form, priorita: e.target.value as Task['priorita'] })}>
              <option value="High">High</option>
              <option value="Medium">Medium</option>
              <option value="Low">Low</option>
            </select>
          </div>
          <div>
            <label style={labelStyle}>Deadline</label>
            <input type="date" style={inputStyle} value={form.deadline} onChange={e => setForm({ ...form, deadline: e.target.value })} />
          </div>
          <div>
            <label style={labelStyle}>Status</label>
            <select style={selectStyle} value={form.status} onChange={e => setForm({ ...form, status: e.target.value as Task['status'] })}>
              <option value="Todo">Todo</option>
              <option value="In Progress">In Progress</option>
              <option value="Done">Done</option>
            </select>
          </div>
          <div>
            <label style={labelStyle}>Projekt</label>
            <input style={inputStyle} value={form.projekt} onChange={e => setForm({ ...form, projekt: e.target.value })} />
          </div>
          <div style={{ display: 'flex', gap: 12, justifyContent: 'flex-end', marginTop: 8 }}>
            <button onClick={() => setModalOpen(false)} style={{ background: 'transparent', border: '1px solid #2a2a2a', borderRadius: 8, padding: '10px 16px', color: 'white', cursor: 'pointer', fontSize: 14 }}>Zrušit</button>
            <button onClick={save} disabled={saving || !form.nazev} style={{ background: '#3b82f6', border: 'none', borderRadius: 8, padding: '10px 16px', color: 'white', cursor: 'pointer', fontSize: 14, fontWeight: 600, opacity: saving || !form.nazev ? 0.6 : 1 }}>
              {saving ? 'Ukládám...' : 'Uložit'}
            </button>
          </div>
        </div>
      </Modal>
    </div>
  )
}
