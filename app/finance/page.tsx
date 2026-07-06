'use client'
import { useCallback, useEffect, useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { Income, Expense, FixedCost } from '@/lib/types'
import Modal from '@/components/Modal'
import { Plus, Trash2 } from 'lucide-react'
import { BarChart, Bar, XAxis, YAxis, Tooltip, Legend, ResponsiveContainer, CartesianGrid } from 'recharts'
import { useTheme } from '@/components/ThemeProvider'

const czk = (n: number) => new Intl.NumberFormat('cs-CZ', { style: 'currency', currency: 'CZK', maximumFractionDigits: 0 }).format(n)

const inputStyle: React.CSSProperties = {
  width: '100%', background: 'var(--input-bg)', border: '1px solid var(--border)',
  borderRadius: 8, padding: '10px 14px', color: 'var(--text)', fontSize: 14, outline: 'none',
}
const labelStyle: React.CSSProperties = { fontSize: 13, color: 'var(--muted)', display: 'block', marginBottom: 6, fontWeight: 500 }

function getMonthLabel(date: Date) {
  return date.toLocaleDateString('cs-CZ', { month: 'short', year: '2-digit' })
}

export default function FinancePage() {
  const [incomes, setIncomes] = useState<Income[]>([])
  const [expenses, setExpenses] = useState<Expense[]>([])
  const [fixedCosts, setFixedCosts] = useState<FixedCost[]>([])
  const [loading, setLoading] = useState(false)
  const [activeTab, setActiveTab] = useState<'prijmy' | 'vydaje' | 'fixni'>('prijmy')
  const [incomeModal, setIncomeModal] = useState(false)
  const [expenseModal, setExpenseModal] = useState(false)
  const [fixedModal, setFixedModal] = useState(false)
  const [saving, setSaving] = useState(false)
  const [incomeForm, setIncomeForm] = useState({ klient: '', castka: '', datum: '', typ: 'jednorazovy' as Income['typ'], status: 'ceka' as Income['status'] })
  const [expenseForm, setExpenseForm] = useState({ nazev: '', castka: '', datum: '', kategorie: '', opakovani: false })
  const [fixedForm, setFixedForm] = useState({ nazev: '', castka: '' })
  const { theme } = useTheme()

  const load = useCallback(async () => {
    const supabase = createClient()
    try {
      const { data: { session } } = await supabase.auth.getSession()
      const user = session?.user
      if (!user) return
      const [ir, er, fr] = await Promise.all([
        supabase.from('prijmy').select('*').eq('user_id', user.id).order('datum', { ascending: false }),
        supabase.from('vydaje').select('*').eq('user_id', user.id).order('datum', { ascending: false }),
        supabase.from('fixni_naklady').select('*').eq('user_id', user.id),
      ])
      setIncomes(ir.data || [])
      setExpenses(er.data || [])
      setFixedCosts(fr.data || [])
    } catch {
      // ignore
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { load() }, [load])

  const now = new Date()
  const monthStart = new Date(now.getFullYear(), now.getMonth(), 1)
  const monthEnd = new Date(now.getFullYear(), now.getMonth() + 1, 0)

  const monthIncomes = incomes.filter(i => i.status === 'zaplaceno' && new Date(i.datum) >= monthStart && new Date(i.datum) <= monthEnd)
  const monthExpenses = expenses.filter(e => new Date(e.datum) >= monthStart && new Date(e.datum) <= monthEnd)
  const monthIncomeTotal = monthIncomes.reduce((s, i) => s + Number(i.castka), 0)
  const monthExpenseTotal = monthExpenses.reduce((s, e) => s + Number(e.castka), 0)
  const profit = monthIncomeTotal - monthExpenseTotal
  const lifetimeIncome = incomes.filter(i => i.status === 'zaplaceno').reduce((s, i) => s + Number(i.castka), 0)
  const fixedTotal = fixedCosts.reduce((s, f) => s + Number(f.castka), 0)

  const chartData = Array.from({ length: 6 }, (_, i) => {
    const d = new Date(now.getFullYear(), now.getMonth() - 5 + i, 1)
    const mStart = new Date(d.getFullYear(), d.getMonth(), 1)
    const mEnd = new Date(d.getFullYear(), d.getMonth() + 1, 0)
    const inc = incomes.filter(x => x.status === 'zaplaceno' && new Date(x.datum) >= mStart && new Date(x.datum) <= mEnd).reduce((s, x) => s + Number(x.castka), 0)
    const exp = expenses.filter(x => new Date(x.datum) >= mStart && new Date(x.datum) <= mEnd).reduce((s, x) => s + Number(x.castka), 0)
    return { month: getMonthLabel(d), Příjmy: inc, Výdaje: exp }
  })

  const isDark = theme === 'dark'
  const chartGrid = isDark ? '#2a2a2a' : '#e5e7eb'
  const chartTick = isDark ? '#6b7280' : '#9ca3af'
  const tooltipBg = isDark ? '#1a1a1a' : '#ffffff'
  const tooltipBorder = isDark ? '#2a2a2a' : '#e5e7eb'
  const tooltipLabel = isDark ? '#ffffff' : '#111827'

  async function saveIncome() {
    const supabase = createClient()
    setSaving(true)
    const { data: { session } } = await supabase.auth.getSession()
    const user = session?.user
    if (!user) return
    await supabase.from('prijmy').insert({ klient: incomeForm.klient, castka: Number(incomeForm.castka), datum: incomeForm.datum, typ: incomeForm.typ, status: incomeForm.status, user_id: user.id })
    setSaving(false); setIncomeModal(false); load()
  }

  async function saveExpense() {
    const supabase = createClient()
    setSaving(true)
    const { data: { session } } = await supabase.auth.getSession()
    const user = session?.user
    if (!user) return
    await supabase.from('vydaje').insert({ nazev: expenseForm.nazev, castka: Number(expenseForm.castka), datum: expenseForm.datum, kategorie: expenseForm.kategorie, opakovani: expenseForm.opakovani, user_id: user.id })
    setSaving(false); setExpenseModal(false); load()
  }

  async function saveFixed() {
    const supabase = createClient()
    setSaving(true)
    const { data: { session } } = await supabase.auth.getSession()
    const user = session?.user
    if (!user) return
    await supabase.from('fixni_naklady').insert({ nazev: fixedForm.nazev, castka: Number(fixedForm.castka), user_id: user.id })
    setSaving(false); setFixedModal(false); load()
  }

  async function deleteIncome(id: string) {
    if (!confirm('Smazat příjem?')) return
    await createClient().from('prijmy').delete().eq('id', id); load()
  }
  async function deleteExpense(id: string) {
    if (!confirm('Smazat výdaj?')) return
    await createClient().from('vydaje').delete().eq('id', id); load()
  }
  async function deleteFixed(id: string) {
    if (!confirm('Smazat fixní náklad?')) return
    await createClient().from('fixni_naklady').delete().eq('id', id); load()
  }

  const tabStyle = (active: boolean): React.CSSProperties => ({
    padding: '8px 20px', borderRadius: 8, border: 'none', cursor: 'pointer', fontSize: 14, fontWeight: active ? 600 : 400,
    background: active ? '#e53e3e' : 'transparent', color: active ? 'white' : 'var(--muted)', transition: 'all 0.15s',
  })

  if (loading) return <div style={{ color: 'var(--muted)', padding: 24 }}>Načítání...</div>

  return (
    <div>
      <h1 style={{ fontSize: 26, fontWeight: 700, marginBottom: 24, color: 'var(--text)' }}>Finance</h1>

      {/* Stats */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: 16, marginBottom: 24 }}>
        {[
          { label: 'Příjmy tento měsíc', value: czk(monthIncomeTotal), color: '#10b981' },
          { label: 'Výdaje tento měsíc', value: czk(monthExpenseTotal), color: '#e53e3e' },
          { label: 'Čistý zisk', value: czk(profit), color: profit >= 0 ? '#10b981' : '#e53e3e' },
        ].map((s, i) => (
          <div key={i} style={{ background: 'var(--card)', border: '1px solid var(--border)', borderRadius: 10, padding: '16px 20px', boxShadow: 'var(--shadow)' }}>
            <div style={{ fontSize: 13, color: 'var(--muted)', marginBottom: 8 }}>{s.label}</div>
            <div style={{ fontSize: 22, fontWeight: 700, color: s.color }}>{s.value}</div>
          </div>
        ))}
      </div>

      {/* Progress to 1M goal */}
      <div style={{ background: 'var(--card)', border: '1px solid var(--border)', borderRadius: 10, padding: '20px', marginBottom: 24, boxShadow: 'var(--shadow)' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 14, marginBottom: 10 }}>
          <span style={{ fontWeight: 600, color: 'var(--text)' }}>Cíl 1 000 000 Kč do 16. dubna 2027</span>
          <span style={{ color: 'var(--muted)' }}>{czk(lifetimeIncome)} / {czk(1000000)}</span>
        </div>
        <div style={{ background: 'var(--progress-track)', borderRadius: 6, height: 12, overflow: 'hidden' }}>
          <div style={{ background: 'linear-gradient(90deg, #e53e3e, #f59e0b)', height: '100%', width: `${Math.min(100, (lifetimeIncome / 1000000) * 100)}%`, borderRadius: 6, transition: 'width 0.5s' }} />
        </div>
        <div style={{ fontSize: 12, color: 'var(--muted)', marginTop: 6, textAlign: 'right' }}>
          {Math.round((lifetimeIncome / 1000000) * 100)}% splněno
        </div>
      </div>

      {/* Chart */}
      <div style={{ background: 'var(--card)', border: '1px solid var(--border)', borderRadius: 10, padding: '20px', marginBottom: 24, boxShadow: 'var(--shadow)' }}>
        <h2 style={{ fontSize: 16, fontWeight: 600, marginBottom: 16, color: 'var(--text)' }}>Posledních 6 měsíců</h2>
        <ResponsiveContainer width="100%" height={220}>
          <BarChart data={chartData} margin={{ top: 0, right: 0, bottom: 0, left: 0 }}>
            <CartesianGrid strokeDasharray="3 3" stroke={chartGrid} />
            <XAxis dataKey="month" stroke={chartTick} tick={{ fill: chartTick, fontSize: 12 }} />
            <YAxis stroke={chartTick} tick={{ fill: chartTick, fontSize: 12 }} tickFormatter={v => `${(v / 1000).toFixed(0)}k`} />
            <Tooltip contentStyle={{ background: tooltipBg, border: `1px solid ${tooltipBorder}`, borderRadius: 8 }} labelStyle={{ color: tooltipLabel }} formatter={(v) => czk(Number(v))} />
            <Legend wrapperStyle={{ color: chartTick, fontSize: 13 }} />
            <Bar dataKey="Příjmy" fill="#10b981" radius={[4, 4, 0, 0]} />
            <Bar dataKey="Výdaje" fill="#e53e3e" radius={[4, 4, 0, 0]} />
          </BarChart>
        </ResponsiveContainer>
      </div>

      {/* Tabs */}
      <div style={{ display: 'flex', gap: 8, marginBottom: 20, background: 'var(--card)', border: '1px solid var(--border)', borderRadius: 10, padding: 8, width: 'fit-content' }}>
        <button style={tabStyle(activeTab === 'prijmy')} onClick={() => setActiveTab('prijmy')}>Příjmy</button>
        <button style={tabStyle(activeTab === 'vydaje')} onClick={() => setActiveTab('vydaje')}>Výdaje</button>
        <button style={tabStyle(activeTab === 'fixni')} onClick={() => setActiveTab('fixni')}>Fixní náklady</button>
      </div>

      {activeTab === 'prijmy' && (
        <div>
          <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: 12 }}>
            <button onClick={() => { setIncomeForm({ klient: '', castka: '', datum: '', typ: 'jednorazovy', status: 'ceka' }); setIncomeModal(true) }} style={{ background: '#e53e3e', color: 'white', border: 'none', borderRadius: 8, padding: '8px 14px', fontSize: 13, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 6 }}>
              <Plus size={14} /> Přidat příjem
            </button>
          </div>
          <div style={{ background: 'var(--card)', border: '1px solid var(--border)', borderRadius: 8, overflow: 'hidden', boxShadow: 'var(--shadow)' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse' }}>
              <thead><tr style={{ background: 'var(--table-header)' }}>
                {['Klient', 'Částka', 'Datum', 'Typ', 'Status', ''].map(h => <th key={h} style={{ padding: '12px 16px', textAlign: 'left', fontSize: 13, fontWeight: 500, color: 'var(--muted)' }}>{h}</th>)}
              </tr></thead>
              <tbody>
                {incomes.length === 0 ? <tr><td colSpan={6} style={{ padding: 24, textAlign: 'center', color: 'var(--muted)' }}>Žádné příjmy</td></tr> :
                  incomes.map(i => (
                    <tr key={i.id} style={{ borderBottom: '1px solid var(--border)' }}>
                      <td style={{ padding: '12px 16px', fontSize: 14, color: 'var(--text)' }}>{i.klient}</td>
                      <td style={{ padding: '12px 16px', fontSize: 14, color: '#10b981', fontWeight: 600 }}>{czk(Number(i.castka))}</td>
                      <td style={{ padding: '12px 16px', fontSize: 13, color: 'var(--muted)' }}>{new Date(i.datum).toLocaleDateString('cs-CZ')}</td>
                      <td style={{ padding: '12px 16px' }}><span style={{ fontSize: 12, padding: '3px 10px', borderRadius: 20, background: '#dbeafe', color: '#2563eb' }}>{i.typ}</span></td>
                      <td style={{ padding: '12px 16px' }}><span style={{ fontSize: 12, padding: '3px 10px', borderRadius: 20, background: i.status === 'zaplaceno' ? '#d1fae5' : '#fef3c7', color: i.status === 'zaplaceno' ? '#059669' : '#d97706' }}>{i.status}</span></td>
                      <td style={{ padding: '12px 16px' }}><button onClick={() => deleteIncome(i.id)} style={{ background: 'transparent', border: 'none', color: '#e53e3e', cursor: 'pointer' }}><Trash2 size={14} /></button></td>
                    </tr>
                  ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {activeTab === 'vydaje' && (
        <div>
          <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: 12 }}>
            <button onClick={() => { setExpenseForm({ nazev: '', castka: '', datum: '', kategorie: '', opakovani: false }); setExpenseModal(true) }} style={{ background: '#e53e3e', color: 'white', border: 'none', borderRadius: 8, padding: '8px 14px', fontSize: 13, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 6 }}>
              <Plus size={14} /> Přidat výdaj
            </button>
          </div>
          <div style={{ background: 'var(--card)', border: '1px solid var(--border)', borderRadius: 8, overflow: 'hidden', boxShadow: 'var(--shadow)' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse' }}>
              <thead><tr style={{ background: 'var(--table-header)' }}>
                {['Název', 'Částka', 'Datum', 'Kategorie', 'Opakující se', ''].map(h => <th key={h} style={{ padding: '12px 16px', textAlign: 'left', fontSize: 13, fontWeight: 500, color: 'var(--muted)' }}>{h}</th>)}
              </tr></thead>
              <tbody>
                {expenses.length === 0 ? <tr><td colSpan={6} style={{ padding: 24, textAlign: 'center', color: 'var(--muted)' }}>Žádné výdaje</td></tr> :
                  expenses.map(e => (
                    <tr key={e.id} style={{ borderBottom: '1px solid var(--border)' }}>
                      <td style={{ padding: '12px 16px', fontSize: 14, color: 'var(--text)' }}>{e.nazev}</td>
                      <td style={{ padding: '12px 16px', fontSize: 14, color: '#e53e3e', fontWeight: 600 }}>{czk(Number(e.castka))}</td>
                      <td style={{ padding: '12px 16px', fontSize: 13, color: 'var(--muted)' }}>{new Date(e.datum).toLocaleDateString('cs-CZ')}</td>
                      <td style={{ padding: '12px 16px', fontSize: 13, color: 'var(--muted)' }}>{e.kategorie}</td>
                      <td style={{ padding: '12px 16px' }}><span style={{ fontSize: 12, padding: '3px 10px', borderRadius: 20, background: e.opakovani ? '#dbeafe' : '#f3f4f6', color: e.opakovani ? '#2563eb' : '#6b7280' }}>{e.opakovani ? 'Ano' : 'Ne'}</span></td>
                      <td style={{ padding: '12px 16px' }}><button onClick={() => deleteExpense(e.id)} style={{ background: 'transparent', border: 'none', color: '#e53e3e', cursor: 'pointer' }}><Trash2 size={14} /></button></td>
                    </tr>
                  ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {activeTab === 'fixni' && (
        <div>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
            <div style={{ fontSize: 14, color: 'var(--muted)' }}>Celkem měsíčně: <span style={{ color: '#e53e3e', fontWeight: 600 }}>{czk(fixedTotal)}</span></div>
            <button onClick={() => { setFixedForm({ nazev: '', castka: '' }); setFixedModal(true) }} style={{ background: '#e53e3e', color: 'white', border: 'none', borderRadius: 8, padding: '8px 14px', fontSize: 13, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 6 }}>
              <Plus size={14} /> Přidat fixní náklad
            </button>
          </div>
          <div style={{ background: 'var(--card)', border: '1px solid var(--border)', borderRadius: 8, overflow: 'hidden', boxShadow: 'var(--shadow)' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse' }}>
              <thead><tr style={{ background: 'var(--table-header)' }}>
                {['Název', 'Částka/měsíc', ''].map(h => <th key={h} style={{ padding: '12px 16px', textAlign: 'left', fontSize: 13, fontWeight: 500, color: 'var(--muted)' }}>{h}</th>)}
              </tr></thead>
              <tbody>
                {fixedCosts.length === 0 ? <tr><td colSpan={3} style={{ padding: 24, textAlign: 'center', color: 'var(--muted)' }}>Žádné fixní náklady</td></tr> :
                  fixedCosts.map(f => (
                    <tr key={f.id} style={{ borderBottom: '1px solid var(--border)' }}>
                      <td style={{ padding: '12px 16px', fontSize: 14, color: 'var(--text)' }}>{f.nazev}</td>
                      <td style={{ padding: '12px 16px', fontSize: 14, color: '#e53e3e', fontWeight: 600 }}>{czk(Number(f.castka))}</td>
                      <td style={{ padding: '12px 16px' }}><button onClick={() => deleteFixed(f.id)} style={{ background: 'transparent', border: 'none', color: '#e53e3e', cursor: 'pointer' }}><Trash2 size={14} /></button></td>
                    </tr>
                  ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      <Modal isOpen={incomeModal} onClose={() => setIncomeModal(false)} title="Nový příjem">
        <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
          <div><label style={labelStyle}>Klient</label><input style={inputStyle} value={incomeForm.klient} onChange={e => setIncomeForm({ ...incomeForm, klient: e.target.value })} /></div>
          <div><label style={labelStyle}>Částka (Kč)</label><input type="number" style={inputStyle} value={incomeForm.castka} onChange={e => setIncomeForm({ ...incomeForm, castka: e.target.value })} /></div>
          <div><label style={labelStyle}>Datum</label><input type="date" style={inputStyle} value={incomeForm.datum} onChange={e => setIncomeForm({ ...incomeForm, datum: e.target.value })} /></div>
          <div><label style={labelStyle}>Typ</label>
            <select style={{ ...inputStyle, cursor: 'pointer' }} value={incomeForm.typ} onChange={e => setIncomeForm({ ...incomeForm, typ: e.target.value as Income['typ'] })}>
              <option value="jednorazovy">Jednorázový</option>
              <option value="mesicni">Měsíční</option>
            </select>
          </div>
          <div><label style={labelStyle}>Status</label>
            <select style={{ ...inputStyle, cursor: 'pointer' }} value={incomeForm.status} onChange={e => setIncomeForm({ ...incomeForm, status: e.target.value as Income['status'] })}>
              <option value="zaplaceno">Zaplaceno</option>
              <option value="ceka">Čeká</option>
            </select>
          </div>
          <div style={{ display: 'flex', gap: 12, justifyContent: 'flex-end' }}>
            <button onClick={() => setIncomeModal(false)} style={{ background: 'transparent', border: '1px solid var(--border)', borderRadius: 8, padding: '10px 16px', color: 'var(--text)', cursor: 'pointer', fontSize: 14 }}>Zrušit</button>
            <button onClick={saveIncome} disabled={saving || !incomeForm.klient || !incomeForm.castka || !incomeForm.datum} style={{ background: '#e53e3e', border: 'none', borderRadius: 8, padding: '10px 16px', color: 'white', cursor: 'pointer', fontSize: 14, fontWeight: 600, opacity: saving ? 0.6 : 1 }}>
              {saving ? 'Ukládám...' : 'Uložit'}
            </button>
          </div>
        </div>
      </Modal>

      <Modal isOpen={expenseModal} onClose={() => setExpenseModal(false)} title="Nový výdaj">
        <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
          <div><label style={labelStyle}>Název</label><input style={inputStyle} value={expenseForm.nazev} onChange={e => setExpenseForm({ ...expenseForm, nazev: e.target.value })} /></div>
          <div><label style={labelStyle}>Částka (Kč)</label><input type="number" style={inputStyle} value={expenseForm.castka} onChange={e => setExpenseForm({ ...expenseForm, castka: e.target.value })} /></div>
          <div><label style={labelStyle}>Datum</label><input type="date" style={inputStyle} value={expenseForm.datum} onChange={e => setExpenseForm({ ...expenseForm, datum: e.target.value })} /></div>
          <div><label style={labelStyle}>Kategorie</label><input style={inputStyle} value={expenseForm.kategorie} onChange={e => setExpenseForm({ ...expenseForm, kategorie: e.target.value })} /></div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <input type="checkbox" id="opakovani" checked={expenseForm.opakovani} onChange={e => setExpenseForm({ ...expenseForm, opakovani: e.target.checked })} style={{ width: 16, height: 16, accentColor: '#e53e3e' }} />
            <label htmlFor="opakovani" style={{ fontSize: 14, color: 'var(--text)', cursor: 'pointer' }}>Opakující se výdaj</label>
          </div>
          <div style={{ display: 'flex', gap: 12, justifyContent: 'flex-end' }}>
            <button onClick={() => setExpenseModal(false)} style={{ background: 'transparent', border: '1px solid var(--border)', borderRadius: 8, padding: '10px 16px', color: 'var(--text)', cursor: 'pointer', fontSize: 14 }}>Zrušit</button>
            <button onClick={saveExpense} disabled={saving || !expenseForm.nazev || !expenseForm.castka || !expenseForm.datum} style={{ background: '#e53e3e', border: 'none', borderRadius: 8, padding: '10px 16px', color: 'white', cursor: 'pointer', fontSize: 14, fontWeight: 600, opacity: saving ? 0.6 : 1 }}>
              {saving ? 'Ukládám...' : 'Uložit'}
            </button>
          </div>
        </div>
      </Modal>

      <Modal isOpen={fixedModal} onClose={() => setFixedModal(false)} title="Nový fixní náklad">
        <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
          <div><label style={labelStyle}>Název</label><input style={inputStyle} value={fixedForm.nazev} onChange={e => setFixedForm({ ...fixedForm, nazev: e.target.value })} /></div>
          <div><label style={labelStyle}>Měsíční částka (Kč)</label><input type="number" style={inputStyle} value={fixedForm.castka} onChange={e => setFixedForm({ ...fixedForm, castka: e.target.value })} /></div>
          <div style={{ display: 'flex', gap: 12, justifyContent: 'flex-end' }}>
            <button onClick={() => setFixedModal(false)} style={{ background: 'transparent', border: '1px solid var(--border)', borderRadius: 8, padding: '10px 16px', color: 'var(--text)', cursor: 'pointer', fontSize: 14 }}>Zrušit</button>
            <button onClick={saveFixed} disabled={saving || !fixedForm.nazev || !fixedForm.castka} style={{ background: '#e53e3e', border: 'none', borderRadius: 8, padding: '10px 16px', color: 'white', cursor: 'pointer', fontSize: 14, fontWeight: 600, opacity: saving ? 0.6 : 1 }}>
              {saving ? 'Ukládám...' : 'Uložit'}
            </button>
          </div>
        </div>
      </Modal>
    </div>
  )
}
