'use client'
import { useEffect, useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { Debt } from '@/lib/types'
import Modal from '@/components/Modal'
import { Plus, Trash2, ToggleLeft, ToggleRight } from 'lucide-react'

const czk = (n: number) => new Intl.NumberFormat('cs-CZ', { style: 'currency', currency: 'CZK', maximumFractionDigits: 0 }).format(n)

const inputStyle: React.CSSProperties = {
  width: '100%', background: '#0f0f0f', border: '1px solid #2a2a2a',
  borderRadius: 8, padding: '10px 14px', color: 'white', fontSize: 14, outline: 'none',
}
const labelStyle: React.CSSProperties = { fontSize: 13, color: '#9ca3af', display: 'block', marginBottom: 6 }

export default function DluhyPage() {
  const [debts, setDebts] = useState<Debt[]>([])
  const [loading, setLoading] = useState(true)
  const [activeTab, setActiveTab] = useState<'moje' | 'mne'>('moje')
  const [modal, setModal] = useState(false)
  const [saving, setSaving] = useState(false)
  const [form, setForm] = useState({ smer: 'moje' as Debt['smer'], komu_kdo: '', castka: '', datum: '', popis: '', status: 'nesplaceno' as Debt['status'] })
  const supabase = createClient()

  async function load() {
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return
    const { data } = await supabase.from('dluhy').select('*').eq('user_id', user.id).order('datum', { ascending: false })
    setDebts(data || [])
    setLoading(false)
  }

  useEffect(() => { load() }, [])

  function openAdd() {
    setForm({ smer: activeTab, komu_kdo: '', castka: '', datum: '', popis: '', status: 'nesplaceno' })
    setModal(true)
  }

  async function save() {
    setSaving(true)
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return
    await supabase.from('dluhy').insert({ smer: form.smer, komu_kdo: form.komu_kdo, castka: Number(form.castka), datum: form.datum, popis: form.popis || null, status: form.status, user_id: user.id })
    setSaving(false); setModal(false); load()
  }

  async function toggleStatus(d: Debt) {
    const newStatus = d.status === 'splaceno' ? 'nesplaceno' : 'splaceno'
    await supabase.from('dluhy').update({ status: newStatus }).eq('id', d.id)
    load()
  }

  async function deleteDebt(id: string) {
    if (!confirm('Smazat dluh?')) return
    await supabase.from('dluhy').delete().eq('id', id); load()
  }

  const myDebts = debts.filter(d => d.smer === 'moje')
  const theirDebts = debts.filter(d => d.smer === 'mne')
  const myTotal = myDebts.filter(d => d.status === 'nesplaceno').reduce((s, d) => s + Number(d.castka), 0)
  const theirTotal = theirDebts.filter(d => d.status === 'nesplaceno').reduce((s, d) => s + Number(d.castka), 0)

  const shown = activeTab === 'moje' ? myDebts : theirDebts

  const tabStyle = (active: boolean): React.CSSProperties => ({
    padding: '8px 20px', borderRadius: 8, border: 'none', cursor: 'pointer', fontSize: 14, fontWeight: active ? 600 : 400,
    background: active ? '#3b82f6' : 'transparent', color: active ? 'white' : '#6b7280',
  })

  if (loading) return <div style={{ color: '#6b7280', padding: 24 }}>Načítání...</div>

  return (
    <div>
      <h1 style={{ fontSize: 26, fontWeight: 700, marginBottom: 24 }}>Dluhy</h1>

      {/* Summary */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16, marginBottom: 24 }}>
        <div style={{ background: '#1a1a1a', border: '1px solid #2a2a2a', borderRadius: 10, padding: '16px 20px' }}>
          <div style={{ fontSize: 13, color: '#6b7280', marginBottom: 8 }}>Dluhu já celkem (nesplaceno)</div>
          <div style={{ fontSize: 22, fontWeight: 700, color: '#ef4444' }}>{czk(myTotal)}</div>
        </div>
        <div style={{ background: '#1a1a1a', border: '1px solid #2a2a2a', borderRadius: 10, padding: '16px 20px' }}>
          <div style={{ fontSize: 13, color: '#6b7280', marginBottom: 8 }}>Dluží mi celkem (nesplaceno)</div>
          <div style={{ fontSize: 22, fontWeight: 700, color: '#10b981' }}>{czk(theirTotal)}</div>
        </div>
      </div>

      {/* Tabs + Add */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 }}>
        <div style={{ display: 'flex', gap: 8, background: '#1a1a1a', border: '1px solid #2a2a2a', borderRadius: 10, padding: 8 }}>
          <button style={tabStyle(activeTab === 'moje')} onClick={() => setActiveTab('moje')}>Moje dluhy</button>
          <button style={tabStyle(activeTab === 'mne')} onClick={() => setActiveTab('mne')}>Dluží mně</button>
        </div>
        <button onClick={openAdd} style={{ background: '#3b82f6', color: 'white', border: 'none', borderRadius: 8, padding: '10px 16px', fontSize: 14, fontWeight: 600, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 6 }}>
          <Plus size={16} /> Přidat dluh
        </button>
      </div>

      <div style={{ background: '#1a1a1a', border: '1px solid #2a2a2a', borderRadius: 8, overflow: 'hidden' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse' }}>
          <thead>
            <tr style={{ background: '#2a2a2a' }}>
              {[activeTab === 'moje' ? 'Komu' : 'Kdo', 'Částka', 'Datum', 'Popis', 'Status', ''].map(h => (
                <th key={h} style={{ padding: '12px 16px', textAlign: 'left', fontSize: 13, fontWeight: 500, color: '#9ca3af' }}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {shown.length === 0 ? (
              <tr><td colSpan={6} style={{ padding: 24, textAlign: 'center', color: '#6b7280' }}>Žádné záznamy</td></tr>
            ) : shown.map(d => (
              <tr key={d.id} style={{ borderBottom: '1px solid #2a2a2a' }}>
                <td style={{ padding: '12px 16px', fontSize: 14, fontWeight: 500 }}>{d.komu_kdo}</td>
                <td style={{ padding: '12px 16px', fontSize: 14, fontWeight: 600, color: d.smer === 'moje' ? '#ef4444' : '#10b981' }}>{czk(Number(d.castka))}</td>
                <td style={{ padding: '12px 16px', fontSize: 13, color: '#9ca3af' }}>{new Date(d.datum).toLocaleDateString('cs-CZ')}</td>
                <td style={{ padding: '12px 16px', fontSize: 13, color: '#9ca3af' }}>{d.popis || '—'}</td>
                <td style={{ padding: '12px 16px' }}>
                  <span style={{ fontSize: 12, padding: '2px 8px', borderRadius: 20, background: d.status === 'splaceno' ? '#10b98122' : '#ef444422', color: d.status === 'splaceno' ? '#34d399' : '#f87171' }}>
                    {d.status === 'splaceno' ? 'Splaceno' : 'Nesplaceno'}
                  </span>
                </td>
                <td style={{ padding: '12px 16px' }}>
                  <div style={{ display: 'flex', gap: 8 }}>
                    <button onClick={() => toggleStatus(d)} title={d.status === 'splaceno' ? 'Označit jako nesplaceno' : 'Označit jako splaceno'} style={{ background: 'transparent', border: 'none', color: '#6b7280', cursor: 'pointer', padding: 4 }}>
                      {d.status === 'splaceno' ? <ToggleRight size={16} color="#10b981" /> : <ToggleLeft size={16} />}
                    </button>
                    <button onClick={() => deleteDebt(d.id)} style={{ background: 'transparent', border: 'none', color: '#ef4444', cursor: 'pointer', padding: 4 }}>
                      <Trash2 size={14} />
                    </button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <Modal isOpen={modal} onClose={() => setModal(false)} title="Přidat dluh">
        <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
          <div>
            <label style={labelStyle}>Typ</label>
            <select style={{ ...inputStyle, cursor: 'pointer' }} value={form.smer} onChange={e => setForm({ ...form, smer: e.target.value as Debt['smer'] })}>
              <option value="moje">Moje dluh (dluhu já)</option>
              <option value="mne">Dluží mně (dluhu mi)</option>
            </select>
          </div>
          <div><label style={labelStyle}>{form.smer === 'moje' ? 'Komu dluhu' : 'Kdo mi dluží'}</label><input style={inputStyle} value={form.komu_kdo} onChange={e => setForm({ ...form, komu_kdo: e.target.value })} /></div>
          <div><label style={labelStyle}>Částka (Kč)</label><input type="number" style={inputStyle} value={form.castka} onChange={e => setForm({ ...form, castka: e.target.value })} /></div>
          <div><label style={labelStyle}>Datum</label><input type="date" style={inputStyle} value={form.datum} onChange={e => setForm({ ...form, datum: e.target.value })} /></div>
          <div><label style={labelStyle}>Popis</label><textarea style={{ ...inputStyle, resize: 'vertical', minHeight: 80 }} value={form.popis} onChange={e => setForm({ ...form, popis: e.target.value })} /></div>
          <div>
            <label style={labelStyle}>Status</label>
            <select style={{ ...inputStyle, cursor: 'pointer' }} value={form.status} onChange={e => setForm({ ...form, status: e.target.value as Debt['status'] })}>
              <option value="nesplaceno">Nesplaceno</option>
              <option value="splaceno">Splaceno</option>
            </select>
          </div>
          <div style={{ display: 'flex', gap: 12, justifyContent: 'flex-end' }}>
            <button onClick={() => setModal(false)} style={{ background: 'transparent', border: '1px solid #2a2a2a', borderRadius: 8, padding: '10px 16px', color: 'white', cursor: 'pointer', fontSize: 14 }}>Zrušit</button>
            <button onClick={save} disabled={saving || !form.komu_kdo || !form.castka || !form.datum} style={{ background: '#3b82f6', border: 'none', borderRadius: 8, padding: '10px 16px', color: 'white', cursor: 'pointer', fontSize: 14, fontWeight: 600, opacity: saving ? 0.6 : 1 }}>
              {saving ? 'Ukládám...' : 'Uložit'}
            </button>
          </div>
        </div>
      </Modal>
    </div>
  )
}
