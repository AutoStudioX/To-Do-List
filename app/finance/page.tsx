'use client'
import { useCallback, useEffect, useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { Income, Expense, FixedCost, Debt } from '@/lib/types'
import Modal from '@/components/Modal'
import { Plus, Trash2, Pencil } from 'lucide-react'
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
  const [debts, setDebts] = useState<Debt[]>([])
  const [activeTab, setActiveTab] = useState<'prijmy' | 'vydaje' | 'fixni' | 'dluhy'>('prijmy')
  const [incomeModal, setIncomeModal] = useState(false)
  const [expenseModal, setExpenseModal] = useState(false)
  const [fixedModal, setFixedModal] = useState(false)
  const [debtModal, setDebtModal] = useState(false)
  const [saving, setSaving] = useState(false)
  const [editIncome, setEditIncome] = useState<Income | null>(null)
  const [editExpense, setEditExpense] = useState<Expense | null>(null)
  const [editFixed, setEditFixed] = useState<FixedCost | null>(null)
  const [editDebt, setEditDebt] = useState<Debt | null>(null)
  const [incomeForm, setIncomeForm] = useState({ klient: '', castka: '', datum: '', typ: 'jednorazovy' as Income['typ'], status: 'ceka' as Income['status'], komu_kdo: '' })
  const [expenseForm, setExpenseForm] = useState({ nazev: '', castka: '', datum: '', kategorie: '', opakovani: false })
  const [fixedForm, setFixedForm] = useState({ nazev: '', castka: '' })
  const [debtForm, setDebtForm] = useState({ smer: 'moje' as Debt['smer'], komu_kdo: '', castka: '', datum: '', popis: '', status: 'nesplaceno' as Debt['status'] })
  const { theme } = useTheme()

  const load = useCallback(async () => {
    const supabase = createClient()
    try {
      const { data: { session } } = await supabase.auth.getSession()
      const user = session?.user
      if (!user) return
      const [ir, er, fr, dr] = await Promise.all([
        supabase.from('prijmy').select('*').eq('user_id', user.id).order('datum', { ascending: false }),
        supabase.from('vydaje').select('*').eq('user_id', user.id).order('datum', { ascending: false }),
        supabase.from('fixni_naklady').select('*').eq('user_id', user.id),
        supabase.from('dluhy').select('*').eq('user_id', user.id).order('datum', { ascending: false }),
      ])
      setIncomes(ir.data || [])
      setExpenses(er.data || [])
      setFixedCosts(fr.data || [])
      setDebts(dr.data || [])
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
    const payload = { klient: incomeForm.klient, castka: Number(incomeForm.castka), datum: incomeForm.datum, typ: incomeForm.typ, status: incomeForm.status }
    const { data: { session } } = await supabase.auth.getSession()
    const user = session?.user
    if (!user) { setSaving(false); return }
    if (editIncome) {
      await supabase.from('prijmy').update(payload).eq('id', editIncome.id)
    } else {
      await supabase.from('prijmy').insert({ ...payload, user_id: user.id })
      if (incomeForm.status === 'dluh') {
        await supabase.from('dluhy').insert({
          smer: 'mne', komu_kdo: incomeForm.komu_kdo || incomeForm.klient,
          castka: Number(incomeForm.castka), datum: incomeForm.datum,
          popis: `Příjem: ${incomeForm.klient}`, status: 'nesplaceno', user_id: user.id,
        })
      }
    }
    setSaving(false); setIncomeModal(false); setEditIncome(null); load()
  }

  async function saveExpense() {
    const supabase = createClient()
    setSaving(true)
    const payload = { nazev: expenseForm.nazev, castka: Number(expenseForm.castka), datum: expenseForm.datum, kategorie: expenseForm.kategorie, opakovani: expenseForm.opakovani }
    if (editExpense) {
      await supabase.from('vydaje').update(payload).eq('id', editExpense.id)
    } else {
      const { data: { session } } = await supabase.auth.getSession()
      const user = session?.user
      if (!user) { setSaving(false); return }
      await supabase.from('vydaje').insert({ ...payload, user_id: user.id })
    }
    setSaving(false); setExpenseModal(false); setEditExpense(null); load()
  }

  async function saveFixed() {
    const supabase = createClient()
    setSaving(true)
    const payload = { nazev: fixedForm.nazev, castka: Number(fixedForm.castka) }
    if (editFixed) {
      await supabase.from('fixni_naklady').update(payload).eq('id', editFixed.id)
    } else {
      const { data: { session } } = await supabase.auth.getSession()
      const user = session?.user
      if (!user) { setSaving(false); return }
      await supabase.from('fixni_naklady').insert({ ...payload, user_id: user.id })
    }
    setSaving(false); setFixedModal(false); setEditFixed(null); load()
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

  async function saveDebt() {
    const supabase = createClient()
    setSaving(true)
    const payload = { smer: debtForm.smer, komu_kdo: debtForm.komu_kdo, castka: Number(debtForm.castka), datum: debtForm.datum, popis: debtForm.popis || null, status: debtForm.status }
    if (editDebt) {
      await supabase.from('dluhy').update(payload).eq('id', editDebt.id)
    } else {
      const { data: { session } } = await supabase.auth.getSession()
      const user = session?.user
      if (!user) { setSaving(false); return }
      await supabase.from('dluhy').insert({ ...payload, user_id: user.id })
    }
    setSaving(false); setDebtModal(false); setEditDebt(null); load()
  }

  async function deleteDebt(id: string) {
    if (!confirm('Smazat dluh?')) return
    await createClient().from('dluhy').delete().eq('id', id); load()
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
        <button style={tabStyle(activeTab === 'dluhy')} onClick={() => setActiveTab('dluhy')}>Dluhy</button>
      </div>

      {activeTab === 'prijmy' && (
        <div>
          <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: 12 }}>
            <button onClick={() => { setEditIncome(null); setIncomeForm({ klient: '', castka: '', datum: '', typ: 'jednorazovy', status: 'ceka' }); setIncomeModal(true) }} style={{ background: '#e53e3e', color: 'white', border: 'none', borderRadius: 8, padding: '8px 14px', fontSize: 13, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 6 }}>
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
                      <td style={{ padding: '12px 16px' }}><span style={{ fontSize: 12, padding: '3px 10px', borderRadius: 20, background: i.status === 'zaplaceno' ? '#d1fae5' : i.status === 'dluh' ? '#ede9fe' : '#fef3c7', color: i.status === 'zaplaceno' ? '#059669' : i.status === 'dluh' ? '#7c3aed' : '#d97706' }}>{i.status === 'zaplaceno' ? 'Zaplaceno' : i.status === 'dluh' ? 'Dluh' : 'Čeká'}</span></td>
                      <td style={{ padding: '12px 16px' }}>
                        <div style={{ display: 'flex', gap: 8 }}>
                          <button onClick={() => { setEditIncome(i); setIncomeForm({ klient: i.klient, castka: String(i.castka), datum: i.datum, typ: i.typ, status: i.status, komu_kdo: '' }); setIncomeModal(true) }} style={{ background: 'transparent', border: 'none', color: 'var(--muted)', cursor: 'pointer', padding: 2 }}><Pencil size={14} /></button>
                          <button onClick={() => deleteIncome(i.id)} style={{ background: 'transparent', border: 'none', color: '#e53e3e', cursor: 'pointer', padding: 2 }}><Trash2 size={14} /></button>
                        </div>
                      </td>
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
            <button onClick={() => { setEditExpense(null); setExpenseForm({ nazev: '', castka: '', datum: '', kategorie: '', opakovani: false }); setExpenseModal(true) }} style={{ background: '#e53e3e', color: 'white', border: 'none', borderRadius: 8, padding: '8px 14px', fontSize: 13, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 6 }}>
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
                      <td style={{ padding: '12px 16px' }}>
                        <div style={{ display: 'flex', gap: 8 }}>
                          <button onClick={() => { setEditExpense(e); setExpenseForm({ nazev: e.nazev, castka: String(e.castka), datum: e.datum, kategorie: e.kategorie, opakovani: e.opakovani }); setExpenseModal(true) }} style={{ background: 'transparent', border: 'none', color: 'var(--muted)', cursor: 'pointer', padding: 2 }}><Pencil size={14} /></button>
                          <button onClick={() => deleteExpense(e.id)} style={{ background: 'transparent', border: 'none', color: '#e53e3e', cursor: 'pointer', padding: 2 }}><Trash2 size={14} /></button>
                        </div>
                      </td>
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
            <button onClick={() => { setEditFixed(null); setFixedForm({ nazev: '', castka: '' }); setFixedModal(true) }} style={{ background: '#e53e3e', color: 'white', border: 'none', borderRadius: 8, padding: '8px 14px', fontSize: 13, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 6 }}>
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
                      <td style={{ padding: '12px 16px' }}>
                        <div style={{ display: 'flex', gap: 8 }}>
                          <button onClick={() => { setEditFixed(f); setFixedForm({ nazev: f.nazev, castka: String(f.castka) }); setFixedModal(true) }} style={{ background: 'transparent', border: 'none', color: 'var(--muted)', cursor: 'pointer', padding: 2 }}><Pencil size={14} /></button>
                          <button onClick={() => deleteFixed(f.id)} style={{ background: 'transparent', border: 'none', color: '#e53e3e', cursor: 'pointer', padding: 2 }}><Trash2 size={14} /></button>
                        </div>
                      </td>
                    </tr>
                  ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {activeTab === 'dluhy' && (
        <div>
          <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: 12 }}>
            <button onClick={() => { setEditDebt(null); setDebtForm({ smer: 'moje', komu_kdo: '', castka: '', datum: '', popis: '', status: 'nesplaceno' }); setDebtModal(true) }} style={{ background: '#e53e3e', color: 'white', border: 'none', borderRadius: 8, padding: '8px 14px', fontSize: 13, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 6 }}>
              <Plus size={14} /> Přidat dluh
            </button>
          </div>
          <div style={{ background: 'var(--card)', border: '1px solid var(--border)', borderRadius: 8, overflow: 'hidden', boxShadow: 'var(--shadow)' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse' }}>
              <thead><tr style={{ background: 'var(--table-header)' }}>
                {['Směr', 'Kdo / Komu', 'Částka', 'Datum', 'Status', ''].map(h => <th key={h} style={{ padding: '12px 16px', textAlign: 'left', fontSize: 13, fontWeight: 500, color: 'var(--muted)' }}>{h}</th>)}
              </tr></thead>
              <tbody>
                {debts.length === 0 ? <tr><td colSpan={6} style={{ padding: 24, textAlign: 'center', color: 'var(--muted)' }}>Žádné dluhy</td></tr> :
                  debts.map(d => (
                    <tr key={d.id} style={{ borderBottom: '1px solid var(--border)' }}>
                      <td style={{ padding: '12px 16px' }}>
                        <span style={{ fontSize: 12, padding: '3px 10px', borderRadius: 20, background: d.smer === 'moje' ? '#fee2e2' : '#d1fae5', color: d.smer === 'moje' ? '#e53e3e' : '#059669' }}>
                          {d.smer === 'moje' ? 'Dluhu já' : 'Dluží mi'}
                        </span>
                      </td>
                      <td style={{ padding: '12px 16px', fontSize: 14, color: 'var(--text)', fontWeight: 500 }}>{d.komu_kdo}</td>
                      <td style={{ padding: '12px 16px', fontSize: 14, fontWeight: 600, color: d.smer === 'moje' ? '#e53e3e' : '#10b981' }}>{czk(Number(d.castka))}</td>
                      <td style={{ padding: '12px 16px', fontSize: 13, color: 'var(--muted)' }}>{new Date(d.datum).toLocaleDateString('cs-CZ')}</td>
                      <td style={{ padding: '12px 16px' }}>
                        <span style={{ fontSize: 12, padding: '3px 10px', borderRadius: 20, background: d.status === 'splaceno' ? '#d1fae5' : '#fee2e2', color: d.status === 'splaceno' ? '#059669' : '#e53e3e' }}>
                          {d.status === 'splaceno' ? 'Splaceno' : 'Nesplaceno'}
                        </span>
                      </td>
                      <td style={{ padding: '12px 16px' }}>
                        <div style={{ display: 'flex', gap: 8 }}>
                          <button onClick={() => { setEditDebt(d); setDebtForm({ smer: d.smer, komu_kdo: d.komu_kdo, castka: String(d.castka), datum: d.datum, popis: d.popis || '', status: d.status }); setDebtModal(true) }} style={{ background: 'transparent', border: 'none', color: 'var(--muted)', cursor: 'pointer', padding: 2 }}><Pencil size={14} /></button>
                          <button onClick={() => deleteDebt(d.id)} style={{ background: 'transparent', border: 'none', color: '#e53e3e', cursor: 'pointer', padding: 2 }}><Trash2 size={14} /></button>
                        </div>
                      </td>
                    </tr>
                  ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      <Modal isOpen={incomeModal} onClose={() => { setIncomeModal(false); setEditIncome(null) }} title={editIncome ? 'Upravit příjem' : 'Nový příjem'}>
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
              <option value="dluh">Dluh (dluží mi)</option>
            </select>
          </div>
          {incomeForm.status === 'dluh' && !editIncome && (
            <div><label style={labelStyle}>Kdo dluží (pokud jiné než klient)</label><input style={inputStyle} placeholder={incomeForm.klient} value={incomeForm.komu_kdo} onChange={e => setIncomeForm({ ...incomeForm, komu_kdo: e.target.value })} /></div>
          )}
          <div style={{ display: 'flex', gap: 12, justifyContent: 'flex-end' }}>
            <button onClick={() => { setIncomeModal(false); setEditIncome(null) }} style={{ background: 'transparent', border: '1px solid var(--border)', borderRadius: 8, padding: '10px 16px', color: 'var(--text)', cursor: 'pointer', fontSize: 14 }}>Zrušit</button>
            <button onClick={saveIncome} disabled={saving || !incomeForm.klient || !incomeForm.castka || !incomeForm.datum} style={{ background: '#e53e3e', border: 'none', borderRadius: 8, padding: '10px 16px', color: 'white', cursor: 'pointer', fontSize: 14, fontWeight: 600, opacity: saving ? 0.6 : 1 }}>
              {saving ? 'Ukládám...' : 'Uložit'}
            </button>
          </div>
        </div>
      </Modal>

      <Modal isOpen={expenseModal} onClose={() => { setExpenseModal(false); setEditExpense(null) }} title={editExpense ? 'Upravit výdaj' : 'Nový výdaj'}>
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
            <button onClick={() => { setExpenseModal(false); setEditExpense(null) }} style={{ background: 'transparent', border: '1px solid var(--border)', borderRadius: 8, padding: '10px 16px', color: 'var(--text)', cursor: 'pointer', fontSize: 14 }}>Zrušit</button>
            <button onClick={saveExpense} disabled={saving || !expenseForm.nazev || !expenseForm.castka || !expenseForm.datum} style={{ background: '#e53e3e', border: 'none', borderRadius: 8, padding: '10px 16px', color: 'white', cursor: 'pointer', fontSize: 14, fontWeight: 600, opacity: saving ? 0.6 : 1 }}>
              {saving ? 'Ukládám...' : 'Uložit'}
            </button>
          </div>
        </div>
      </Modal>

      <Modal isOpen={fixedModal} onClose={() => { setFixedModal(false); setEditFixed(null) }} title={editFixed ? 'Upravit fixní náklad' : 'Nový fixní náklad'}>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
          <div><label style={labelStyle}>Název</label><input style={inputStyle} value={fixedForm.nazev} onChange={e => setFixedForm({ ...fixedForm, nazev: e.target.value })} /></div>
          <div><label style={labelStyle}>Měsíční částka (Kč)</label><input type="number" style={inputStyle} value={fixedForm.castka} onChange={e => setFixedForm({ ...fixedForm, castka: e.target.value })} /></div>
          <div style={{ display: 'flex', gap: 12, justifyContent: 'flex-end' }}>
            <button onClick={() => { setFixedModal(false); setEditFixed(null) }} style={{ background: 'transparent', border: '1px solid var(--border)', borderRadius: 8, padding: '10px 16px', color: 'var(--text)', cursor: 'pointer', fontSize: 14 }}>Zrušit</button>
            <button onClick={saveFixed} disabled={saving || !fixedForm.nazev || !fixedForm.castka} style={{ background: '#e53e3e', border: 'none', borderRadius: 8, padding: '10px 16px', color: 'white', cursor: 'pointer', fontSize: 14, fontWeight: 600, opacity: saving ? 0.6 : 1 }}>
              {saving ? 'Ukládám...' : 'Uložit'}
            </button>
          </div>
        </div>
      </Modal>

      <Modal isOpen={debtModal} onClose={() => { setDebtModal(false); setEditDebt(null) }} title={editDebt ? 'Upravit dluh' : 'Nový dluh'}>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
          <div>
            <label style={labelStyle}>Typ</label>
            <select style={{ ...inputStyle, cursor: 'pointer' }} value={debtForm.smer} onChange={e => setDebtForm({ ...debtForm, smer: e.target.value as Debt['smer'] })}>
              <option value="moje">Dluhu já (komu)</option>
              <option value="mne">Dluží mi (kdo)</option>
            </select>
          </div>
          <div><label style={labelStyle}>{debtForm.smer === 'moje' ? 'Komu dluhu' : 'Kdo mi dluží'}</label><input style={inputStyle} value={debtForm.komu_kdo} onChange={e => setDebtForm({ ...debtForm, komu_kdo: e.target.value })} /></div>
          <div><label style={labelStyle}>Částka (Kč)</label><input type="number" style={inputStyle} value={debtForm.castka} onChange={e => setDebtForm({ ...debtForm, castka: e.target.value })} /></div>
          <div><label style={labelStyle}>Datum</label><input type="date" style={inputStyle} value={debtForm.datum} onChange={e => setDebtForm({ ...debtForm, datum: e.target.value })} /></div>
          <div><label style={labelStyle}>Popis</label><input style={inputStyle} value={debtForm.popis} onChange={e => setDebtForm({ ...debtForm, popis: e.target.value })} /></div>
          <div>
            <label style={labelStyle}>Status</label>
            <select style={{ ...inputStyle, cursor: 'pointer' }} value={debtForm.status} onChange={e => setDebtForm({ ...debtForm, status: e.target.value as Debt['status'] })}>
              <option value="nesplaceno">Nesplaceno</option>
              <option value="splaceno">Splaceno</option>
            </select>
          </div>
          <div style={{ display: 'flex', gap: 12, justifyContent: 'flex-end' }}>
            <button onClick={() => { setDebtModal(false); setEditDebt(null) }} style={{ background: 'transparent', border: '1px solid var(--border)', borderRadius: 8, padding: '10px 16px', color: 'var(--text)', cursor: 'pointer', fontSize: 14 }}>Zrušit</button>
            <button onClick={saveDebt} disabled={saving || !debtForm.komu_kdo || !debtForm.castka || !debtForm.datum} style={{ background: '#e53e3e', border: 'none', borderRadius: 8, padding: '10px 16px', color: 'white', cursor: 'pointer', fontSize: 14, fontWeight: 600, opacity: saving ? 0.6 : 1 }}>
              {saving ? 'Ukládám...' : 'Uložit'}
            </button>
          </div>
        </div>
      </Modal>
    </div>
  )
}
