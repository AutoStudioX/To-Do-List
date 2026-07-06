'use client'
import { useCallback, useEffect, useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { Task } from '@/lib/types'
import Modal from '@/components/Modal'
import DatePicker from '@/components/DatePicker'
import { Plus, Trash2, Pencil } from 'lucide-react'

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

  return (
    <div>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 24 }}>
        <h1 style={{ fontSize: 26, fontWeight: 700, color: 'var(--text)' }}>Úkoly</h1>
        <button onClick={openAdd} style={{ background: '#e53e3e', color: 'white', border: 'none', borderRadius: 10, padding: '11px 20px', fontSize: 14, fontWeight: 600, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 7, boxShadow: '0 4px 14px rgba(229,62,62,0.35)' }}>
          <Plus size={16} /> Přidat úkol
        </button>
      </div>

      {/* Filters */}
      <div style={{ display: 'flex', gap: 12, marginBottom: 20 }}>
        <div>
          <label style={labelStyle}>Status</label>
          <select value={filterStatus} onChange={e => setFilterStatus(e.target.value)} style={{ ...inputStyle, width: 'auto', cursor: 'pointer' }}>
            {['All', 'Todo', 'In Progress', 'Done'].map(s => <option key={s} value={s}>{s}</option>)}
          </select>
        </div>
        <div>
          <label style={labelStyle}>Priorita</label>
          <select value={filterPriority} onChange={e => setFilterPriority(e.target.value)} style={{ ...inputStyle, width: 'auto', cursor: 'pointer' }}>
            {['All', 'High', 'Medium', 'Low'].map(p => <option key={p} value={p}>{p}</option>)}
          </select>
        </div>
      </div>

      {/* Table */}
      <div style={{ background: 'var(--card)', border: '1px solid var(--border)', borderRadius: 14, overflow: 'hidden', boxShadow: '0 4px 24px rgba(0,0,0,0.18)' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse' }}>
          <thead>
            <tr style={{ background: 'var(--table-header)', borderBottom: '2px solid var(--border)' }}>
              {['Název', 'Priorita', 'Deadline', 'Status', 'Projekt', ''].map(h => (
                <th key={h} style={{ padding: '14px 16px', textAlign: 'left', fontSize: 12, fontWeight: 600, color: 'var(--muted)', textTransform: 'uppercase', letterSpacing: '0.06em' }}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr><td colSpan={6} style={{ padding: 24, textAlign: 'center', color: 'var(--muted)' }}>Načítání...</td></tr>
            ) : filtered.length === 0 ? (
              <tr><td colSpan={6} style={{ padding: 24, textAlign: 'center', color: 'var(--muted)' }}>Žádné úkoly</td></tr>
            ) : filtered.map(t => (
              <tr key={t.id}
                style={{ borderBottom: '1px solid var(--border)', cursor: 'pointer', transition: 'background 0.12s' }}
                onMouseEnter={e => (e.currentTarget as HTMLElement).style.background = 'var(--hover-bg)'}
                onMouseLeave={e => (e.currentTarget as HTMLElement).style.background = 'transparent'}
              >
                <td style={{ padding: '0', paddingRight: 16 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 0 }}>
                    <div style={{ width: 4, alignSelf: 'stretch', background: priorityBorder[t.priorita], borderRadius: '2px 0 0 2px', minHeight: 48, flexShrink: 0 }} />
                    <span style={{ padding: '14px 14px', fontSize: 14, fontWeight: 500, color: 'var(--text)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', maxWidth: 220, display: 'block' }}>{t.nazev}</span>
                  </div>
                </td>
                <td style={{ padding: '14px 16px' }}>
                  <span style={{ fontSize: 12, padding: '4px 10px', borderRadius: 20, fontWeight: 600, ...priorityBadge[t.priorita] }}>{t.priorita}</span>
                </td>
                <td style={{ padding: '14px 16px', fontSize: 13, color: 'var(--muted)' }}>
                  {t.deadline ? new Date(t.deadline).toLocaleDateString('cs-CZ') : '—'}
                </td>
                <td style={{ padding: '14px 16px' }}>
                  <span style={{ fontSize: 12, padding: '4px 10px', borderRadius: 20, fontWeight: 600, ...statusBadge[t.status] }}>{t.status}</span>
                </td>
                <td style={{ padding: '14px 16px', fontSize: 13, color: 'var(--muted)' }}>{t.projekt || '—'}</td>
                <td style={{ padding: '14px 16px' }}>
                  <div style={{ display: 'flex', gap: 6 }}>
                    <button onClick={() => openEdit(t)} style={{ background: 'var(--hover-bg)', border: 'none', borderRadius: 6, color: 'var(--muted)', cursor: 'pointer', padding: '6px 8px', display: 'flex', alignItems: 'center' }}>
                      <Pencil size={13} />
                    </button>
                    <button onClick={() => deleteTask(t.id)} style={{ background: '#fee2e2', border: 'none', borderRadius: 6, color: '#e53e3e', cursor: 'pointer', padding: '6px 8px', display: 'flex', alignItems: 'center' }}>
                      <Trash2 size={13} />
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
