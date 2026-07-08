'use client'
import { useCallback, useEffect, useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { Transaction } from '@/lib/types'
import Modal from '@/components/Modal'
import Select from '@/components/Select'
import DatePicker from '@/components/DatePicker'
import { Toast, useToast } from '@/components/Toast'
import { useConfirm } from '@/components/ConfirmDialog'
import { Plus, Trash2, Pencil } from 'lucide-react'
import { seedRecurring } from '@/lib/seedRecurring'
import { BarChart, Bar, Cell, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid } from 'recharts'
import { useTheme } from '@/components/ThemeProvider'

const czk = (n: number) => new Intl.NumberFormat('cs-CZ', { style: 'currency', currency: 'CZK', maximumFractionDigits: 0 }).format(n)
const inputStyle: React.CSSProperties = { width: '100%', background: 'var(--input-bg)', border: '1px solid var(--border)', borderRadius: 8, padding: '10px 14px', color: 'var(--text)', fontSize: 14, outline: 'none' }
const labelStyle: React.CSSProperties = { fontSize: 13, color: 'var(--muted)', display: 'block', marginBottom: 6, fontWeight: 500 }

type Tab = 'vse' | 'prijmy' | 'vydaje' | 'fixni' | 'dluhy'

function getMonthLabel(d: Date) {
  return d.toLocaleDateString('cs-CZ', { month: 'short' })
}

function TypBadge({ typ }: { typ: Transaction['typ'] }) {
  const cfg = { prijem: { label: 'Příjem', bg: '#d1fae5', color: '#059669' }, vydaj: { label: 'Výdaj', bg: '#fee2e2', color: '#e53e3e' }, fixni_naklad: { label: 'Fixní', bg: '#dbeafe', color: '#2563eb' }, dluh: { label: 'Dluh', bg: '#ede9fe', color: '#7c3aed' } }
  const c = cfg[typ]
  return <span style={{ fontSize: 12, padding: '3px 10px', borderRadius: 20, background: c.bg, color: c.color }}>{c.label}</span>
}

function StatusBadge({ status }: { status: string }) {
  const cfg: Record<string, { label: string; bg: string; color: string }> = {
    zaplaceno: { label: 'Zaplaceno', bg: '#d1fae5', color: '#059669' },
    ceka: { label: 'Čeká', bg: '#fef3c7', color: '#d97706' },
    dluh: { label: 'Dluh', bg: '#ede9fe', color: '#7c3aed' },
    splaceno: { label: 'Splaceno', bg: '#d1fae5', color: '#059669' },
    nesplaceno: { label: 'Nesplaceno', bg: '#fee2e2', color: '#e53e3e' },
  }
  const c = cfg[status] || { label: status, bg: '#f3f4f6', color: '#6b7280' }
  return <span style={{ fontSize: 12, padding: '3px 10px', borderRadius: 20, background: c.bg, color: c.color }}>{c.label}</span>
}

const todayISO = () => { const d = new Date(); return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}` }
const emptyForm = { nazev: '', klient: '', castka: '', datum: todayISO(), typ: 'prijem' as Transaction['typ'], kategorie: '', smer: 'mne', opakovani: 'jednorazovy', status: 'ceka', poznamka: '' }

export default function FinancePage() {
  const [transactions, setTransactions] = useState<Transaction[]>([])
  const [loading, setLoading] = useState(false)
  const [activeTab, setActiveTab] = useState<Tab>('prijmy')
  const [modal, setModal] = useState(false)
  const [saving, setSaving] = useState(false)
  const [editTx, setEditTx] = useState<Transaction | null>(null)
  const [form, setForm] = useState({ ...emptyForm })
  const [formErrors, setFormErrors] = useState<Record<string, string>>({})
  const { theme } = useTheme()
  const { toast, showToast, hideToast } = useToast()
  const { confirm, dialog: confirmDialog } = useConfirm()
  const [chartYear, setChartYear] = useState(new Date().getFullYear())

  const load = useCallback(async () => {
    const supabase = createClient()
    try {
      const { data: { session } } = await supabase.auth.getSession()
      const user = session?.user
      if (!user) return
      await seedRecurring(supabase, user.id)
      const { data } = await supabase.from('transakce').select('*').eq('user_id', user.id).order('created_at', { ascending: false })
      setTransactions(data || [])
    } catch { } finally { setLoading(false) }
  }, [])

  useEffect(() => { load() }, [load])
  useEffect(() => {
    window.addEventListener('voice-data-changed', load)
    return () => window.removeEventListener('voice-data-changed', load)
  }, [load])

  const now = new Date()
  const monthStart = new Date(now.getFullYear(), now.getMonth(), 1)
  const monthEnd = new Date(now.getFullYear(), now.getMonth() + 1, 0)

  const prijmy = transactions.filter(t => t.typ === 'prijem')
  const vydaje = transactions.filter(t => t.typ === 'vydaj')
  const fixni = transactions.filter(t => t.typ === 'fixni_naklad')
  const dluhy = transactions.filter(t => t.typ === 'dluh' || (t.typ === 'prijem' && t.status === 'dluh'))

  const monthIncomeTotal = prijmy.filter(t => t.status === 'zaplaceno' && t.datum && new Date(t.datum) >= monthStart && new Date(t.datum) <= monthEnd).reduce((s, t) => s + Number(t.castka), 0)
  const monthExpenseVydaje = vydaje.filter(t => t.datum && new Date(t.datum) >= monthStart && new Date(t.datum) <= monthEnd).reduce((s, t) => s + Number(t.castka), 0)
  const fixedMonthly = fixni.filter(t => t.opakovani !== 'rocni').reduce((s, t) => s + Number(t.castka), 0)
  const fixedYearly = fixni.filter(t => t.opakovani === 'rocni').reduce((s, t) => s + Number(t.castka), 0)
  const fixedTotal = fixedMonthly + fixedYearly / 12
  const monthExpenseTotal = monthExpenseVydaje + fixedTotal
  const profit = monthIncomeTotal - monthExpenseTotal
  const lifetimeIncome = prijmy.filter(t => t.status === 'zaplaceno').reduce((s, t) => s + Number(t.castka), 0)

  const chartData = Array.from({ length: 12 }, (_, i) => {
    const d = new Date(chartYear, i, 1)
    const mS = new Date(d.getFullYear(), d.getMonth(), 1)
    const mE = new Date(d.getFullYear(), d.getMonth() + 1, 0)
    const inc = prijmy.filter(t => t.status === 'zaplaceno' && t.datum && new Date(t.datum) >= mS && new Date(t.datum) <= mE).reduce((s, t) => s + Number(t.castka), 0)
    const monthFixedMonthly = fixni.filter(t => t.opakovani !== 'rocni' && (!t.datum || new Date(t.datum) <= mE)).reduce((s, t) => s + Number(t.castka), 0)
    const monthFixedYearly = fixni.filter(t => t.opakovani === 'rocni' && (!t.datum || new Date(t.datum) <= mE)).reduce((s, t) => s + Number(t.castka), 0)
    const monthFixed = monthFixedMonthly + monthFixedYearly / 12
    const exp = vydaje.filter(t => t.datum && new Date(t.datum) >= mS && new Date(t.datum) <= mE).reduce((s, t) => s + Number(t.castka), 0) + monthFixed
    return { month: getMonthLabel(d), 'Čistý zisk': inc - exp }
  })

  const isDark = theme === 'dark'
  const chartGrid = isDark ? '#2a2a2a' : '#e5e7eb'
  const chartTick = isDark ? '#6b7280' : '#9ca3af'
  const tooltipBg = isDark ? '#1a1a1a' : '#ffffff'
  const tooltipBorder = isDark ? '#2a2a2a' : '#e5e7eb'
  const tooltipLabel = isDark ? '#ffffff' : '#111827'

  function openAdd(typ: Transaction['typ']) {
    setEditTx(null)
    setForm({ ...emptyForm, typ, status: typ === 'prijem' ? 'ceka' : typ === 'dluh' ? 'nesplaceno' : '', smer: typ === 'dluh' ? 'moje' : '', opakovani: typ === 'fixni_naklad' ? 'mesicni' : 'jednorazovy' })
    setFormErrors({}); setModal(true)
  }

  function openEdit(t: Transaction) {
    setEditTx(t)
    setForm({ nazev: t.nazev, klient: t.klient || '', castka: String(t.castka), datum: t.datum || '', typ: t.typ, kategorie: t.kategorie || '', smer: t.smer || '', opakovani: t.opakovani || 'jednorazovy', status: t.status || '', poznamka: t.poznamka || '' })
    setModal(true)
  }

  async function save() {
    const errors: Record<string, string> = {}
    if (!form.castka) errors.castka = 'Částka je povinná'
    if (form.typ === 'prijem' && !form.klient.trim()) errors.klient = 'Klient je povinný'
    if (form.typ !== 'prijem' && !form.nazev.trim()) errors.nazev = 'Název je povinný'
    if (Object.keys(errors).length > 0) { setFormErrors(errors); return }
    const supabase = createClient()
    setSaving(true)
    const payload: Partial<Transaction> = {
      nazev: form.typ === 'prijem' ? (form.klient || form.nazev) : form.nazev,
      castka: Number(form.castka),
      datum: form.datum || null,
      typ: form.typ,
      kategorie: form.kategorie || null,
      smer: form.smer || null,
      opakovani: (form.opakovani as Transaction['opakovani']) || null,
      status: form.status || null,
      klient: form.typ === 'prijem' ? (form.klient || null) : null,
      poznamka: form.poznamka || null,
    }
    if (editTx) {
      await supabase.from('transakce').update(payload).eq('id', editTx.id)
    } else {
      const { data: { session } } = await supabase.auth.getSession()
      const user = session?.user
      if (!user) { setSaving(false); return }
      await supabase.from('transakce').insert({ ...payload, user_id: user.id })
    }
    setSaving(false); setModal(false); setEditTx(null); setFormErrors({}); load()
    showToast(editTx ? 'Záznam upraven' : 'Záznam přidán')
  }

  async function deleteTx(id: string) {
    const tx = transactions.find(t => t.id === id)
    if (!await confirm('Smazat záznam?')) return
    const supabase = createClient()
    // If recurring, delete all records with same nazev+typ+opakovani so seedRecurring doesn't re-insert
    if (tx && tx.opakovani && tx.opakovani !== 'jednorazovy') {
      const { data: { session } } = await supabase.auth.getSession()
      const user = session?.user
      if (user) {
        const { error } = await supabase.from('transakce').delete()
          .eq('user_id', user.id)
          .eq('nazev', tx.nazev)
          .eq('typ', tx.typ)
          .eq('opakovani', tx.opakovani)
        if (error) { showToast('Chyba: ' + error.message); return }
      }
    } else {
      const { error } = await supabase.from('transakce').delete().eq('id', id)
      if (error) { showToast('Chyba: ' + error.message); return }
    }
    await load(); showToast('Záznam smazán')
  }

  const tabStyle = (active: boolean): React.CSSProperties => ({
    padding: '8px 20px', borderRadius: 8, border: 'none', cursor: 'pointer', fontSize: 14,
    fontWeight: active ? 600 : 400, background: active ? '#e53e3e' : 'transparent',
    color: active ? 'white' : 'var(--muted)', transition: 'all 0.15s',
  })

  const tabMap: Record<Tab, Transaction[]> = { vse: transactions, prijmy, vydaje, fixni, dluhy }
  const pendingFirst = (a: Transaction, b: Transaction) => {
    const isPending = (t: Transaction) => t.status === 'ceka' || t.status === 'nesplaceno'
    if (isPending(a) && !isPending(b)) return -1
    if (!isPending(a) && isPending(b)) return 1
    return 0
  }
  const shown = [...tabMap[activeTab]].sort(pendingFirst)

  const tabHeaders: Record<Tab, string[]> = {
    vse: ['Název', 'Typ', 'Částka', 'Datum', 'Status', ''],
    prijmy: ['Klient', 'Částka', 'Datum', 'Opakování', 'Status', ''],
    vydaje: ['Název', 'Částka', 'Datum', 'Kategorie', 'Opakování', ''],
    fixni: ['Název', 'Částka', 'Od kdy', 'Opakování', ''],
    dluhy: ['Směr', 'Komu / Kdo', 'Částka', 'Datum', 'Status', ''],
  }

  const addTypMap: Record<Tab, Transaction['typ'] | null> = { vse: null, prijmy: 'prijem', vydaje: 'vydaj', fixni: 'fixni_naklad', dluhy: 'dluh' }
  const addLabelMap: Record<Tab, string> = { vse: '', prijmy: 'příjem', vydaje: 'výdaj', fixni: 'fixní náklad', dluhy: 'dluh' }

  if (loading) return <div style={{ color: 'var(--muted)', padding: 24 }}>Načítání...</div>

  return (
    <div>
      {toast && <Toast message={toast.message} type={toast.type} onClose={hideToast} />}
      {confirmDialog}
      <h1 style={{ fontSize: 26, fontWeight: 700, marginBottom: 24, color: 'var(--text)' }}>Finance</h1>

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

      <div style={{ background: 'var(--card)', border: '1px solid var(--border)', borderRadius: 10, padding: '20px', marginBottom: 24, boxShadow: 'var(--shadow)' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 14, marginBottom: 10 }}>
          <span style={{ fontWeight: 600, color: 'var(--text)' }}>Cíl 1 000 000 Kč do 16. dubna 2027</span>
          <span style={{ color: 'var(--muted)' }}>{czk(lifetimeIncome)} / {czk(1000000)}</span>
        </div>
        <div style={{ background: 'var(--progress-track)', borderRadius: 6, height: 12, overflow: 'hidden' }}>
          <div style={{ background: 'linear-gradient(90deg, #e53e3e, #f59e0b)', height: '100%', width: `${Math.min(100, (lifetimeIncome / 1000000) * 100)}%`, borderRadius: 6, transition: 'width 0.5s' }} />
        </div>
        <div style={{ fontSize: 12, color: 'var(--muted)', marginTop: 6, textAlign: 'right' }}>{Math.round((lifetimeIncome / 1000000) * 100)}% splněno</div>
      </div>

      <div style={{ background: 'var(--card)', border: '1px solid var(--border)', borderRadius: 10, padding: '20px', marginBottom: 24, boxShadow: 'var(--shadow)' }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16 }}>
          <h2 style={{ fontSize: 16, fontWeight: 600, color: 'var(--text)' }}>Čistý zisk po měsících</h2>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <button onClick={() => setChartYear(y => y - 1)} style={{ background: 'transparent', border: '1px solid var(--border)', borderRadius: 6, padding: '4px 10px', color: 'var(--muted)', cursor: 'pointer', fontSize: 13 }}>←</button>
            <span style={{ fontSize: 14, fontWeight: 600, color: 'var(--text)', minWidth: 40, textAlign: 'center' }}>{chartYear}</span>
            <button onClick={() => setChartYear(y => y + 1)} style={{ background: 'transparent', border: '1px solid var(--border)', borderRadius: 6, padding: '4px 10px', color: 'var(--muted)', cursor: 'pointer', fontSize: 13 }}>→</button>
          </div>
        </div>
        <ResponsiveContainer width="100%" height={220}>
          <BarChart data={chartData} margin={{ top: 0, right: 0, bottom: 0, left: 0 }}>
            <CartesianGrid strokeDasharray="3 3" stroke={chartGrid} />
            <XAxis dataKey="month" stroke={chartTick} tick={{ fill: chartTick, fontSize: 12 }} />
            <YAxis stroke={chartTick} tick={{ fill: chartTick, fontSize: 12 }} tickFormatter={v => `${(v / 1000).toFixed(0)}k`} />
            <Tooltip contentStyle={{ background: tooltipBg, border: `1px solid ${tooltipBorder}`, borderRadius: 8 }} labelStyle={{ color: tooltipLabel }} formatter={(v) => czk(Number(v))} />
            <Bar dataKey="Čistý zisk" radius={[4, 4, 0, 0]}>
              {chartData.map((entry, i) => (
                <Cell key={i} fill={entry['Čistý zisk'] >= 0 ? '#10b981' : '#e53e3e'} />
              ))}
            </Bar>
          </BarChart>
        </ResponsiveContainer>
      </div>

      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20, gap: 10, flexWrap: 'wrap' }}>
        <div className="tab-bar" style={{ display: 'flex', gap: 4, background: 'var(--card)', border: '1px solid var(--border)', borderRadius: 10, padding: 6, width: 'fit-content', maxWidth: '100%' }}>
          {(['vse', 'prijmy', 'vydaje', 'fixni', 'dluhy'] as Tab[]).map(tab => (
            <button key={tab} style={tabStyle(activeTab === tab)} onClick={() => setActiveTab(tab)}>
              {tab === 'vse' ? 'Vše' : tab === 'prijmy' ? 'Příjmy' : tab === 'vydaje' ? 'Výdaje' : tab === 'fixni' ? 'Fixní náklady' : 'Dluhy'}
            </button>
          ))}
        </div>
        <button onClick={() => activeTab === 'vse' ? openAdd('prijem') : openAdd(addTypMap[activeTab]!)} style={{ background: '#e53e3e', color: 'white', border: 'none', borderRadius: 10, padding: '10px 20px', fontSize: 14, fontWeight: 600, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 7, boxShadow: '0 4px 14px rgba(229,62,62,0.35)' }}>
          <Plus size={16} /> Přidat {activeTab === 'vse' ? 'transakci' : addLabelMap[activeTab]}
        </button>
      </div>

      {(() => {
        const statStyle: React.CSSProperties = { fontSize: 13, color: 'var(--muted)' }
        const valStyle = (color: string): React.CSSProperties => ({ color, fontWeight: 700, fontSize: 15 })
        const pill = (label: string, value: string, color: string) => (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
            <span style={statStyle}>{label}</span>
            <span style={valStyle(color)}>{value}</span>
          </div>
        )
        const divider = <div className="stats-divider" style={{ width: 1, background: 'var(--border)', alignSelf: 'stretch' }} />

        const pendingIncome = prijmy.filter(t => t.status === 'ceka').reduce((s, t) => s + Number(t.castka), 0)
        const monthExpenses = vydaje.filter(t => t.datum && new Date(t.datum) >= monthStart && new Date(t.datum) <= monthEnd).reduce((s, t) => s + Number(t.castka), 0)
        const totalExpenses = vydaje.reduce((s, t) => s + Number(t.castka), 0)
        const myDebt = dluhy.filter(d => d.smer === 'moje' && d.status === 'nesplaceno').reduce((s, d) => s + Number(d.castka), 0)
        const theirDebt = dluhy.filter(d => d.status !== 'splaceno' && (d.smer === 'mne' || (d.typ === 'prijem' && d.status === 'dluh'))).reduce((s, d) => s + Number(d.castka), 0)

        const stats: Record<Tab, React.ReactNode> = {
          vse: <>{pill('Příjmy tento m.', czk(monthIncomeTotal), '#10b981')}{divider}{pill('Výdaje tento m.', czk(monthExpenseTotal), '#e53e3e')}{divider}{pill('Čistý zisk', czk(profit), profit >= 0 ? '#10b981' : '#e53e3e')}</>,
          prijmy: <>{pill('Tento m.', czk(monthIncomeTotal), '#10b981')}{divider}{pill('Čeká na platbu', czk(pendingIncome), '#f59e0b')}{divider}{pill('Celkem zaplaceno', czk(lifetimeIncome), '#10b981')}</>,
          vydaje: <>{pill('Tento měsíc', czk(monthExpenses), '#e53e3e')}{divider}{pill('Celkem výdaje', czk(totalExpenses), '#e53e3e')}</>,
          fixni: <>{pill('Měsíčně', czk(fixedMonthly), '#e53e3e')}{divider}{pill('Ročně', czk(fixedYearly), '#e53e3e')}{divider}{pill('Průměr / měsíc', czk(fixedTotal), '#e53e3e')}</>,
          dluhy: <>{pill('Dlužím já', czk(myDebt), '#e53e3e')}{divider}{pill('Dluží mi', czk(theirDebt), '#10b981')}</>,
        }

        return (
          <div className="stats-bar" style={{ display: 'flex', gap: 24, alignItems: 'center', background: 'var(--card)', border: '1px solid var(--border)', borderRadius: 10, padding: '12px 20px', marginBottom: 12, boxShadow: 'var(--shadow)' }}>
            {stats[activeTab]}
          </div>
        )
      })()}

      <div className="table-scroll" style={{ background: 'var(--card)', border: '1px solid var(--border)', borderRadius: 8, boxShadow: 'var(--shadow)' }}>
        <table className="finance-table" style={{ width: '100%', borderCollapse: 'collapse' }}>
          <thead><tr style={{ background: 'var(--table-header)' }}>
            {tabHeaders[activeTab].map(h => <th key={h} style={{ padding: '12px 16px', textAlign: 'left', fontSize: 13, fontWeight: 500, color: 'var(--muted)' }}>{h}</th>)}
          </tr></thead>
          <tbody>
            {shown.length === 0 ? (
              <tr><td colSpan={tabHeaders[activeTab].length} style={{ padding: 24, textAlign: 'center', color: 'var(--muted)' }}>Žádné záznamy</td></tr>
            ) : shown.map(t => (
              <tr key={t.id} style={{ borderBottom: '1px solid var(--border)' }}>
                {activeTab === 'vse' && <>
                  <td style={{ padding: '12px 16px', fontSize: 14, color: 'var(--text)' }}>{t.nazev}</td>
                  <td style={{ padding: '12px 16px' }}><TypBadge typ={t.typ} /></td>
                  <td style={{ padding: '12px 16px', fontSize: 14, fontWeight: 600, color: t.typ === 'prijem' ? '#10b981' : '#e53e3e' }}>{czk(Number(t.castka))}</td>
                  <td style={{ padding: '12px 16px', fontSize: 13, color: 'var(--muted)' }}>{t.datum ? new Date(t.datum).toLocaleDateString('cs-CZ') : '—'}</td>
                  <td style={{ padding: '12px 16px' }}>{t.status ? <StatusBadge status={t.status} /> : '—'}</td>
                </>}
                {activeTab === 'prijmy' && <>
                  <td style={{ padding: '12px 16px', fontSize: 14, color: 'var(--text)' }}>{t.klient || t.nazev}</td>
                  <td style={{ padding: '12px 16px', fontSize: 14, fontWeight: 600, color: '#10b981' }}>{czk(Number(t.castka))}</td>
                  <td style={{ padding: '12px 16px', fontSize: 13, color: 'var(--muted)' }}>{t.datum ? new Date(t.datum).toLocaleDateString('cs-CZ') : '—'}</td>
                  <td style={{ padding: '12px 16px' }}><span style={{ fontSize: 12, padding: '3px 10px', borderRadius: 20, background: '#dbeafe', color: '#2563eb' }}>{t.opakovani || '—'}</span></td>
                  <td style={{ padding: '12px 16px' }}>{t.status ? <StatusBadge status={t.status} /> : '—'}</td>
                </>}
                {activeTab === 'vydaje' && <>
                  <td style={{ padding: '12px 16px', fontSize: 14, color: 'var(--text)' }}>{t.nazev}</td>
                  <td style={{ padding: '12px 16px', fontSize: 14, fontWeight: 600, color: '#e53e3e' }}>{czk(Number(t.castka))}</td>
                  <td style={{ padding: '12px 16px', fontSize: 13, color: 'var(--muted)' }}>{t.datum ? new Date(t.datum).toLocaleDateString('cs-CZ') : '—'}</td>
                  <td style={{ padding: '12px 16px', fontSize: 13, color: 'var(--muted)' }}>{t.kategorie || '—'}</td>
                  <td style={{ padding: '12px 16px' }}><span style={{ fontSize: 12, padding: '3px 10px', borderRadius: 20, background: t.opakovani === 'mesicni' ? '#dbeafe' : '#f3f4f6', color: t.opakovani === 'mesicni' ? '#2563eb' : '#6b7280' }}>{t.opakovani === 'mesicni' ? 'Opakující se' : 'Jednorázový'}</span></td>
                </>}
                {activeTab === 'fixni' && <>
                  <td style={{ padding: '12px 16px', fontSize: 14, color: 'var(--text)' }}>{t.nazev}</td>
                  <td style={{ padding: '12px 16px', fontSize: 14, fontWeight: 600, color: '#e53e3e' }}>{czk(Number(t.castka))}</td>
                  <td style={{ padding: '12px 16px', fontSize: 13, color: 'var(--muted)' }}>{t.datum ? new Date(t.datum).toLocaleDateString('cs-CZ') : '—'}</td>
                  <td style={{ padding: '12px 16px' }}><span style={{ fontSize: 12, padding: '3px 10px', borderRadius: 20, background: t.opakovani === 'rocni' ? '#fef3c7' : '#dbeafe', color: t.opakovani === 'rocni' ? '#d97706' : '#2563eb' }}>{t.opakovani === 'rocni' ? 'Roční' : 'Měsíční'}</span></td>
                </>}
                {activeTab === 'dluhy' && <>
                  <td style={{ padding: '12px 16px' }}>
                    <span style={{ fontSize: 12, padding: '3px 10px', borderRadius: 20, background: t.smer === 'moje' ? '#fee2e2' : '#d1fae5', color: t.smer === 'moje' ? '#e53e3e' : '#059669', whiteSpace: 'nowrap', display: 'inline-block' }}>
                      {t.smer === 'moje' ? 'Dlužím já' : 'Dluží mi'}
                    </span>
                  </td>
                  <td style={{ padding: '12px 16px', fontSize: 14, color: 'var(--text)', fontWeight: 500 }}>{t.nazev}</td>
                  <td style={{ padding: '12px 16px', fontSize: 14, fontWeight: 600, color: t.smer === 'moje' ? '#e53e3e' : '#10b981' }}>{czk(Number(t.castka))}</td>
                  <td style={{ padding: '12px 16px', fontSize: 13, color: 'var(--muted)' }}>{t.datum ? new Date(t.datum).toLocaleDateString('cs-CZ') : '—'}</td>
                  <td style={{ padding: '12px 16px' }}>{t.status ? <StatusBadge status={t.status} /> : '—'}</td>
                </>}
                <td style={{ padding: '12px 16px' }}>
                  <div style={{ display: 'flex', gap: 8 }}>
                    <button onClick={() => openEdit(t)} style={{ background: 'transparent', border: 'none', color: 'var(--muted)', cursor: 'pointer', padding: 2 }}><Pencil size={14} /></button>
                    <button onClick={() => deleteTx(t.id)} style={{ background: 'transparent', border: 'none', color: '#e53e3e', cursor: 'pointer', padding: 2 }}><Trash2 size={14} /></button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <Modal isOpen={modal} onClose={() => { setModal(false); setEditTx(null); setFormErrors({}) }} title={editTx ? 'Upravit záznam' : `Nový ${addLabelMap[activeTab] || 'záznam'}`}>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
          {!editTx && activeTab === 'vse' && (
            <div><label style={labelStyle}>Typ</label>
              <Select value={form.typ} onChange={val => { const typ = val as Transaction['typ']; setForm({ ...form, typ, status: typ === 'prijem' ? 'ceka' : typ === 'dluh' ? 'nesplaceno' : '', smer: typ === 'dluh' ? 'moje' : '' }) }} options={[{ value: 'prijem', label: 'Příjem' }, { value: 'vydaj', label: 'Výdaj' }, { value: 'fixni_naklad', label: 'Fixní náklad' }, { value: 'dluh', label: 'Dluh' }]} />
            </div>
          )}

          {form.typ === 'prijem' && (
            <div>
              <label style={labelStyle}>Klient</label>
              <input style={{ ...inputStyle, borderColor: formErrors.klient ? '#e53e3e' : undefined }} value={form.klient} onChange={e => { setForm({ ...form, klient: e.target.value }); setFormErrors(p => ({ ...p, klient: '' })) }} />
              {formErrors.klient && <div style={{ fontSize: 12, color: '#e53e3e', marginTop: 4 }}>{formErrors.klient}</div>}
            </div>
          )}
          {form.typ !== 'prijem' && (
            <div>
              <label style={labelStyle}>{form.typ === 'dluh' ? (
                <>
                  <span style={{ color: form.smer === 'moje' ? 'var(--text)' : 'var(--muted)', }}>Komu dlužím</span>
                  <span style={{ color: 'var(--muted)', margin: '0 4px' }}>/</span>
                  <span style={{ color: form.smer === 'mne' ? 'var(--text)' : 'var(--muted)' }}>Kdo mi dluží</span>
                </>
              ) : 'Název'}</label>
              <input placeholder={form.typ === 'dluh' ? (form.smer === 'moje' ? 'např. Honza, Novák...' : 'např. Petr, firma...') : ''} style={{ ...inputStyle, borderColor: formErrors.nazev ? '#e53e3e' : undefined }} value={form.nazev} onChange={e => { setForm({ ...form, nazev: e.target.value }); setFormErrors(p => ({ ...p, nazev: '' })) }} />
              {formErrors.nazev && <div style={{ fontSize: 12, color: '#e53e3e', marginTop: 4 }}>{formErrors.nazev}</div>}
            </div>
          )}

          <div>
            <label style={labelStyle}>Částka (Kč)</label>
            <input type="number" style={{ ...inputStyle, borderColor: formErrors.castka ? '#e53e3e' : undefined }} value={form.castka} onChange={e => { setForm({ ...form, castka: e.target.value }); setFormErrors(p => ({ ...p, castka: '' })) }} />
            {formErrors.castka && <div style={{ fontSize: 12, color: '#e53e3e', marginTop: 4 }}>{formErrors.castka}</div>}
          </div>

          <div><label style={labelStyle}>{form.typ === 'fixni_naklad' ? 'Od kdy' : 'Datum'}</label><DatePicker value={form.datum} onChange={v => setForm({ ...form, datum: v })} /></div>

          {form.typ === 'vydaj' && (
            <div><label style={labelStyle}>Kategorie</label><input style={inputStyle} value={form.kategorie} onChange={e => setForm({ ...form, kategorie: e.target.value })} /></div>
          )}

          {(form.typ === 'prijem' || form.typ === 'vydaj') && (
            <div><label style={labelStyle}>Opakování</label>
              <Select value={form.opakovani} onChange={val => setForm({ ...form, opakovani: val })} options={[{ value: 'jednorazovy', label: 'Jednorázový' }, { value: 'mesicni', label: 'Měsíční' }, { value: 'rocni', label: 'Roční' }]} />
            </div>
          )}
          {form.typ === 'fixni_naklad' && (
            <div><label style={labelStyle}>Opakování</label>
              <Select value={form.opakovani} onChange={val => setForm({ ...form, opakovani: val })} options={[{ value: 'mesicni', label: 'Měsíční' }, { value: 'rocni', label: 'Roční' }]} />
            </div>
          )}

          {form.typ === 'prijem' && (
            <div><label style={labelStyle}>Status</label>
              <Select value={form.status} onChange={val => setForm({ ...form, status: val })} options={[{ value: 'zaplaceno', label: 'Zaplaceno' }, { value: 'ceka', label: 'Čeká' }, { value: 'dluh', label: 'Dluh (dluží mi)' }]} />
            </div>
          )}

          {form.typ === 'dluh' && (
            <>
              <div><label style={labelStyle}>Typ dluhu</label>
                <Select value={form.smer} onChange={val => setForm({ ...form, smer: val })} options={[{ value: 'moje', label: 'Dlužím já (komu)' }, { value: 'mne', label: 'Dluží mi (kdo)' }]} />
              </div>
              <div><label style={labelStyle}>Status</label>
                <Select value={form.status} onChange={val => setForm({ ...form, status: val })} options={[{ value: 'nesplaceno', label: 'Nesplaceno' }, { value: 'splaceno', label: 'Splaceno' }]} />
              </div>
            </>
          )}

          <div style={{ display: 'flex', gap: 12, justifyContent: 'flex-end' }}>
            <button onClick={() => { setModal(false); setEditTx(null) }} style={{ background: 'transparent', border: '1px solid var(--border)', borderRadius: 8, padding: '10px 16px', color: 'var(--text)', cursor: 'pointer', fontSize: 14 }}>Zrušit</button>
            <button onClick={save} disabled={saving} style={{ background: '#e53e3e', border: 'none', borderRadius: 8, padding: '10px 16px', color: 'white', cursor: 'pointer', fontSize: 14, fontWeight: 600, opacity: saving ? 0.6 : 1 }}>
              {saving ? 'Ukládám...' : 'Uložit'}
            </button>
          </div>
        </div>
      </Modal>
    </div>
  )
}
