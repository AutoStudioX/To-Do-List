'use client'
import { useCallback, useEffect, useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { Transaction } from '@/lib/types'
import Modal from '@/components/Modal'
import Select from '@/components/Select'
import DatePicker from '@/components/DatePicker'
import { Toast, useToast } from '@/components/Toast'
import { useConfirm } from '@/components/ConfirmDialog'
import { useLiveData } from '@/lib/useLiveData'
import { Plus, Trash2, Pencil, ToggleLeft, ToggleRight } from 'lucide-react'

const todayISO = () => { const d = new Date(); return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}` }
const czk = (n: number) => new Intl.NumberFormat('cs-CZ', { style: 'currency', currency: 'CZK', maximumFractionDigits: 0 }).format(n)
const inputStyle: React.CSSProperties = { width: '100%', background: 'var(--input-bg)', border: '1px solid var(--border)', borderRadius: 8, padding: '10px 14px', color: 'var(--text)', fontSize: 14, outline: 'none' }
const labelStyle: React.CSSProperties = { fontSize: 13, color: 'var(--muted)', display: 'block', marginBottom: 6, fontWeight: 500 }

export default function DluhyPage() {
  const [debts, setDebts] = useState<Transaction[]>([])
  const [loading, setLoading] = useState(false)
  const [activeTab, setActiveTab] = useState<'moje' | 'mne'>('moje')
  const [modal, setModal] = useState(false)
  const [saving, setSaving] = useState(false)
  const [editDebt, setEditDebt] = useState<Transaction | null>(null)
  const [form, setForm] = useState({ smer: 'moje', nazev: '', castka: '', datum: todayISO(), poznamka: '', status: 'nesplaceno' })
  const [formErrors, setFormErrors] = useState<Record<string, string>>({})
  const { toast, showToast, hideToast } = useToast()
  const { confirm, dialog: confirmDialog } = useConfirm()

  const load = useCallback(async () => {
    const supabase = createClient()
    try {
      const { data: { session } } = await supabase.auth.getSession()
      const user = session?.user
      if (!user) return
      const { data } = await supabase.from('transakce').select('*').eq('user_id', user.id).order('datum', { ascending: false })
      const filtered = (data || []).filter((t: Transaction) => t.typ === 'dluh' || (t.typ === 'prijem' && t.status === 'dluh'))
      setDebts(filtered)
    } catch { } finally { setLoading(false) }
  }, [])

  useEffect(() => { load() }, [load])
  useLiveData(['transakce'], load)

  function openAdd() {
    setEditDebt(null)
    setForm({ smer: activeTab, nazev: '', castka: '', datum: todayISO(), poznamka: '', status: 'nesplaceno' })
    setFormErrors({}); setModal(true)
  }

  function openEdit(d: Transaction) {
    setEditDebt(d)
    setForm({ smer: d.smer || 'moje', nazev: d.nazev, castka: String(d.castka), datum: d.datum || '', poznamka: d.poznamka || '', status: d.status || 'nesplaceno' })
    setModal(true)
  }

  async function save() {
    const errors: Record<string, string> = {}
    if (!form.nazev.trim()) errors.nazev = 'Toto pole je povinné'
    if (!form.castka) errors.castka = 'Částka je povinná'
    if (Object.keys(errors).length > 0) { setFormErrors(errors); return }
    const supabase = createClient()
    setSaving(true)
    const typ = editDebt ? editDebt.typ : 'dluh' as const
    const payload = { nazev: form.nazev, castka: Number(form.castka), datum: form.datum || null, typ, smer: form.smer || null, status: form.status, poznamka: form.poznamka || null }
    if (editDebt) {
      await supabase.from('transakce').update(payload).eq('id', editDebt.id)
    } else {
      const { data: { session } } = await supabase.auth.getSession()
      const user = session?.user
      if (!user) { setSaving(false); return }
      await supabase.from('transakce').insert({ ...payload, user_id: user.id })
    }
    setSaving(false); setModal(false); setEditDebt(null); setFormErrors({}); load()
    showToast(editDebt ? 'Dluh upraven' : 'Dluh přidán')
  }

  async function toggleStatus(d: Transaction) {
    const newStatus = d.status === 'splaceno' ? 'nesplaceno' : 'splaceno'
    await createClient().from('transakce').update({ status: newStatus }).eq('id', d.id)
    load()
  }

  async function deleteDebt(id: string) {
    if (!await confirm('Smazat dluh?')) return
    const supabase = createClient()
    const record = debts.find(d => d.id === id)
    if (record?.typ === 'prijem') {
      await supabase.from('transakce').update({ status: 'ceka' }).eq('id', id)
    } else {
      await supabase.from('transakce').delete().eq('id', id)
    }
    load()
  }

  const myDebts = debts.filter(d => d.smer === 'moje')
  const theirDebts = debts.filter(d => d.smer === 'mne')
  const myTotal = myDebts.filter(d => d.status === 'nesplaceno').reduce((s, d) => s + Number(d.castka), 0)
  const theirTotal = theirDebts.filter(d => d.status === 'nesplaceno').reduce((s, d) => s + Number(d.castka), 0)
  const shown = activeTab === 'moje' ? myDebts : theirDebts

  const tabStyle = (active: boolean): React.CSSProperties => ({
    padding: '8px 20px', borderRadius: 8, border: 'none', cursor: 'pointer', fontSize: 14,
    fontWeight: active ? 600 : 400, background: active ? '#e53e3e' : 'transparent', color: active ? 'white' : 'var(--muted)',
  })

  if (loading) return <div style={{ color: 'var(--muted)', padding: 24 }}>Načítání...</div>

  return (
    <div>
      {toast && <Toast message={toast.message} type={toast.type} onClose={hideToast} />}
      {confirmDialog}
      <h1 style={{ fontSize: 26, fontWeight: 700, marginBottom: 24, color: 'var(--text)' }}>Dluhy</h1>

      <div className="bottom-grid" style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16, marginBottom: 24 }}>
        <div style={{ background: 'var(--card)', border: '1px solid var(--border)', borderRadius: 10, padding: '16px 20px', boxShadow: 'var(--shadow)' }}>
          <div style={{ fontSize: 13, color: 'var(--muted)', marginBottom: 8 }}>Dluhu já celkem (nesplaceno)</div>
          <div style={{ fontSize: 22, fontWeight: 700, color: '#e53e3e' }}>{czk(myTotal)}</div>
        </div>
        <div style={{ background: 'var(--card)', border: '1px solid var(--border)', borderRadius: 10, padding: '16px 20px', boxShadow: 'var(--shadow)' }}>
          <div style={{ fontSize: 13, color: 'var(--muted)', marginBottom: 8 }}>Dluží mi celkem (nesplaceno)</div>
          <div style={{ fontSize: 22, fontWeight: 700, color: '#10b981' }}>{czk(theirTotal)}</div>
        </div>
      </div>

      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 }}>
        <div style={{ display: 'flex', gap: 8, background: 'var(--card)', border: '1px solid var(--border)', borderRadius: 10, padding: 8 }}>
          <button style={tabStyle(activeTab === 'moje')} onClick={() => setActiveTab('moje')}>Moje dluhy</button>
          <button style={tabStyle(activeTab === 'mne')} onClick={() => setActiveTab('mne')}>Dluží mně</button>
        </div>
        <button onClick={openAdd} style={{ background: '#e53e3e', color: 'white', border: 'none', borderRadius: 8, padding: '10px 16px', fontSize: 14, fontWeight: 600, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 6 }}>
          <Plus size={16} /> Přidat dluh
        </button>
      </div>

      <div className="table-scroll" style={{ background: 'var(--card)', border: '1px solid var(--border)', borderRadius: 8, boxShadow: 'var(--shadow)' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: 480 }}>
          <thead><tr style={{ background: 'var(--table-header)' }}>
            {[activeTab === 'moje' ? 'Komu' : 'Kdo', 'Částka', 'Datum', 'Poznámka', 'Status', ''].map(h => (
              <th key={h} style={{ padding: '12px 16px', textAlign: 'left', fontSize: 13, fontWeight: 500, color: 'var(--muted)' }}>{h}</th>
            ))}
          </tr></thead>
          <tbody>
            {shown.length === 0 ? (
              <tr><td colSpan={6} style={{ padding: 24, textAlign: 'center', color: 'var(--muted)' }}>Žádné záznamy</td></tr>
            ) : shown.map(d => (
              <tr key={d.id} style={{ borderBottom: '1px solid var(--border)' }}>
                <td style={{ padding: '12px 16px', fontSize: 14, fontWeight: 500, color: 'var(--text)' }}>{d.nazev}</td>
                <td style={{ padding: '12px 16px', fontSize: 14, fontWeight: 600, color: d.smer === 'moje' ? '#e53e3e' : '#10b981' }}>{czk(Number(d.castka))}</td>
                <td style={{ padding: '12px 16px', fontSize: 13, color: 'var(--muted)' }}>{d.datum ? new Date(d.datum).toLocaleDateString('cs-CZ') : '—'}</td>
                <td style={{ padding: '12px 16px', fontSize: 13, color: 'var(--muted)' }}>{d.poznamka || '—'}</td>
                <td style={{ padding: '12px 16px' }}>
                  <span style={{ fontSize: 12, padding: '3px 10px', borderRadius: 20, background: d.status === 'splaceno' ? '#d1fae5' : '#fee2e2', color: d.status === 'splaceno' ? '#059669' : '#e53e3e' }}>
                    {d.status === 'splaceno' ? 'Splaceno' : 'Nesplaceno'}
                  </span>
                </td>
                <td style={{ padding: '12px 16px' }}>
                  <div style={{ display: 'flex', gap: 8 }}>
                    <button onClick={() => openEdit(d)} style={{ background: 'transparent', border: 'none', color: 'var(--muted)', cursor: 'pointer', padding: 4 }}><Pencil size={14} /></button>
                    <button onClick={() => toggleStatus(d)} title={d.status === 'splaceno' ? 'Označit jako nesplaceno' : 'Označit jako splaceno'} style={{ background: 'transparent', border: 'none', color: 'var(--muted)', cursor: 'pointer', padding: 4 }}>
                      {d.status === 'splaceno' ? <ToggleRight size={16} color="#10b981" /> : <ToggleLeft size={16} />}
                    </button>
                    <button onClick={() => deleteDebt(d.id)} style={{ background: 'transparent', border: 'none', color: '#e53e3e', cursor: 'pointer', padding: 4 }}><Trash2 size={14} /></button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <Modal isOpen={modal} onClose={() => { setModal(false); setEditDebt(null); setFormErrors({}) }} title={editDebt ? 'Upravit dluh' : 'Přidat dluh'}>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
          <div><label style={labelStyle}>Typ</label>
            <Select value={form.smer} onChange={val => setForm({ ...form, smer: val })} options={[{ value: 'moje', label: 'Dluhu já (komu)' }, { value: 'mne', label: 'Dluží mi (kdo)' }]} />
          </div>
          <div>
            <label style={labelStyle}>
              <span style={{ color: form.smer === 'moje' ? 'var(--text)' : 'var(--muted)', }}>Komu dlužím</span>
              <span style={{ color: 'var(--muted)', margin: '0 4px' }}>/</span>
              <span style={{ color: form.smer === 'mne' ? 'var(--text)' : 'var(--muted)' }}>Kdo mi dluží</span>
            </label>
            <input placeholder={form.smer === 'moje' ? 'např. Honza, Novák...' : 'např. Petr, firma...'} style={{ ...inputStyle, borderColor: formErrors.nazev ? '#e53e3e' : undefined }} value={form.nazev} onChange={e => { setForm({ ...form, nazev: e.target.value }); setFormErrors(p => ({ ...p, nazev: '' })) }} />
            {formErrors.nazev && <div style={{ fontSize: 12, color: '#e53e3e', marginTop: 4 }}>{formErrors.nazev}</div>}
          </div>
          <div>
            <label style={labelStyle}>Částka (Kč)</label>
            <input type="number" style={{ ...inputStyle, borderColor: formErrors.castka ? '#e53e3e' : undefined }} value={form.castka} onChange={e => { setForm({ ...form, castka: e.target.value }); setFormErrors(p => ({ ...p, castka: '' })) }} />
            {formErrors.castka && <div style={{ fontSize: 12, color: '#e53e3e', marginTop: 4 }}>{formErrors.castka}</div>}
          </div>
          <div><label style={labelStyle}>Datum</label><DatePicker value={form.datum} onChange={v => setForm({ ...form, datum: v })} /></div>

          <div><label style={labelStyle}>Status</label>
            <Select value={form.status} onChange={val => setForm({ ...form, status: val })} options={[{ value: 'nesplaceno', label: 'Nesplaceno' }, { value: 'splaceno', label: 'Splaceno' }]} />
          </div>
          <div style={{ display: 'flex', gap: 12, justifyContent: 'flex-end' }}>
            <button onClick={() => { setModal(false); setEditDebt(null) }} style={{ background: 'transparent', border: '1px solid var(--border)', borderRadius: 8, padding: '10px 16px', color: 'var(--text)', cursor: 'pointer', fontSize: 14 }}>Zrušit</button>
            <button onClick={save} disabled={saving} style={{ background: '#e53e3e', border: 'none', borderRadius: 8, padding: '10px 16px', color: 'white', cursor: 'pointer', fontSize: 14, fontWeight: 600, opacity: saving ? 0.6 : 1 }}>
              {saving ? 'Ukládám...' : 'Uložit'}
            </button>
          </div>
        </div>
      </Modal>
    </div>
  )
}
