'use client'
import { useEffect, useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { Task, Goal, Transaction } from '@/lib/types'
import Modal from '@/components/Modal'
import { Plus, TrendingUp, TrendingDown } from 'lucide-react'
import Link from 'next/link'

const czk = (n: number) => new Intl.NumberFormat('cs-CZ', { style: 'currency', currency: 'CZK', maximumFractionDigits: 0 }).format(n)
const inputStyle: React.CSSProperties = { width: '100%', background: 'var(--input-bg)', border: '1px solid var(--border)', borderRadius: 8, padding: '10px 14px', color: 'var(--text)', fontSize: 14, outline: 'none' }
const labelStyle: React.CSSProperties = { fontSize: 13, color: 'var(--muted)', display: 'block', marginBottom: 6, fontWeight: 500 }

const priorityColor: Record<string, string> = { High: '#e53e3e', Medium: '#f59e0b', Low: '#10b981' }

export default function PrehledPage() {
  const [tasks, setTasks] = useState<Task[]>([])
  const [goals, setGoals] = useState<Goal[]>([])
  const [transactions, setTransactions] = useState<Transaction[]>([])
  const [addModal, setAddModal] = useState(false)
  const [saving, setSaving] = useState(false)
  const [form, setForm] = useState({ nazev: '', castka: '', datum: new Date().toISOString().split('T')[0], typ: 'prijem' as Transaction['typ'], status: 'ceka' })

  useEffect(() => {
    const supabase = createClient()
    async function load() {
      try {
        const { data: { session } } = await supabase.auth.getSession()
        const user = session?.user
        if (!user) return
        const [tr, gr, txr] = await Promise.all([
          supabase.from('ukoly').select('*').eq('user_id', user.id),
          supabase.from('goaly').select('*').eq('user_id', user.id),
          supabase.from('transakce').select('*').eq('user_id', user.id).order('created_at', { ascending: false }),
        ])
        setTasks(tr.data || [])
        setGoals(gr.data || [])
        setTransactions(txr.data || [])
      } catch { }
    }
    load()
  }, [])

  async function checkTask(task: Task) {
    const newStatus = task.status === 'Done' ? 'Todo' : 'Done'
    await createClient().from('ukoly').update({ status: newStatus }).eq('id', task.id)
    setTasks(prev => prev.map(t => t.id === task.id ? { ...t, status: newStatus } : t))
  }

  async function saveTransaction() {
    const supabase = createClient()
    setSaving(true)
    const { data: { session } } = await supabase.auth.getSession()
    const user = session?.user
    if (!user) { setSaving(false); return }
    const { data } = await supabase.from('transakce').insert({
      nazev: form.nazev, castka: Number(form.castka), datum: form.datum,
      typ: form.typ, status: form.status, user_id: user.id,
    }).select().single()
    if (data) setTransactions(prev => [data, ...prev])
    setSaving(false); setAddModal(false)
    setForm({ nazev: '', castka: '', datum: new Date().toISOString().split('T')[0], typ: 'prijem', status: 'ceka' })
  }

  const now = new Date()
  const monthStart = new Date(now.getFullYear(), now.getMonth(), 1)
  const monthEnd = new Date(now.getFullYear(), now.getMonth() + 1, 0)

  const prijmy = transactions.filter(t => t.typ === 'prijem')
  const lifetimeIncome = prijmy.filter(t => t.status === 'zaplaceno').reduce((s, t) => s + Number(t.castka), 0)
  const monthIncome = prijmy.filter(t => t.status === 'zaplaceno' && t.datum && new Date(t.datum) >= monthStart && new Date(t.datum) <= monthEnd).reduce((s, t) => s + Number(t.castka), 0)
  const monthExpense = transactions.filter(t => t.typ === 'vydaj' && t.datum && new Date(t.datum) >= monthStart && new Date(t.datum) <= monthEnd).reduce((s, t) => s + Number(t.castka), 0)

  const openTasks = tasks.filter(t => t.status !== 'Done')
  const urgentTasks = [...openTasks]
    .sort((a, b) => {
      if (!a.deadline && !b.deadline) return 0
      if (!a.deadline) return 1
      if (!b.deadline) return -1
      return new Date(a.deadline).getTime() - new Date(b.deadline).getTime()
    })
    .slice(0, 5)

  const activeGoals = goals.filter(g => g.status === 'active')
  const last5tx = transactions.slice(0, 5)
  const pct1M = Math.min(100, Math.round((lifetimeIncome / 1000000) * 100))

  return (
    <div style={{ maxWidth: 1200, margin: '0 auto' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 28 }}>
        <h1 style={{ fontSize: 26, fontWeight: 700, color: 'var(--text)' }}>Přehled</h1>
        <button onClick={() => setAddModal(true)} style={{ background: '#e53e3e', color: 'white', border: 'none', borderRadius: 10, padding: '10px 18px', fontSize: 14, fontWeight: 600, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 8 }}>
          <Plus size={16} /> Přidat transakci
        </button>
      </div>

      {/* Top stats */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 2fr 1fr', gap: 16, marginBottom: 28 }}>
        <div style={{ background: 'var(--card)', border: '1px solid var(--border)', borderRadius: 12, padding: '20px 24px', boxShadow: 'var(--shadow)' }}>
          <div style={{ fontSize: 13, color: 'var(--muted)', marginBottom: 8 }}>Celkem vyděláno</div>
          <div style={{ fontSize: 28, fontWeight: 800, color: '#10b981' }}>{czk(lifetimeIncome)}</div>
          <div style={{ fontSize: 12, color: 'var(--muted)', marginTop: 4 }}>tento měsíc {czk(monthIncome)}</div>
        </div>

        <div style={{ background: 'var(--card)', border: '1px solid var(--border)', borderRadius: 12, padding: '20px 24px', boxShadow: 'var(--shadow)' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
            <div style={{ fontSize: 13, color: 'var(--muted)', fontWeight: 500 }}>Cíl 1 000 000 Kč</div>
            <div style={{ fontSize: 22, fontWeight: 800, color: '#f59e0b' }}>{pct1M}%</div>
          </div>
          <div style={{ background: 'var(--progress-track)', borderRadius: 8, height: 14, overflow: 'hidden' }}>
            <div style={{ background: 'linear-gradient(90deg, #e53e3e, #f59e0b)', height: '100%', width: `${pct1M}%`, borderRadius: 8, transition: 'width 0.6s' }} />
          </div>
          <div style={{ fontSize: 12, color: 'var(--muted)', marginTop: 8 }}>{czk(lifetimeIncome)} z {czk(1000000)} — zbývá {czk(1000000 - lifetimeIncome)}</div>
        </div>

        <div style={{ background: 'var(--card)', border: '1px solid var(--border)', borderRadius: 12, padding: '20px 24px', boxShadow: 'var(--shadow)' }}>
          <div style={{ fontSize: 13, color: 'var(--muted)', marginBottom: 8 }}>Otevřené úkoly</div>
          <div style={{ fontSize: 28, fontWeight: 800, color: openTasks.length > 0 ? '#e53e3e' : '#10b981' }}>{openTasks.length}</div>
          <div style={{ fontSize: 12, color: 'var(--muted)', marginTop: 4 }}>z {tasks.length} celkem</div>
        </div>
      </div>

      {/* Goals */}
      {activeGoals.length > 0 && (
        <div style={{ marginBottom: 28 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 14 }}>
            <h2 style={{ fontSize: 17, fontWeight: 700, color: 'var(--text)' }}>Goaly</h2>
            <Link href="/goaly" style={{ fontSize: 13, color: 'var(--muted)', textDecoration: 'none' }}>Zobrazit vše →</Link>
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(220px, 1fr))', gap: 12 }}>
            {activeGoals.map(g => (
              <div key={g.id} style={{ background: 'var(--card)', border: '1px solid var(--border)', borderRadius: 10, padding: '16px 18px', boxShadow: 'var(--shadow)' }}>
                <div style={{ fontSize: 14, fontWeight: 600, color: 'var(--text)', marginBottom: 4, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{g.nazev}</div>
                {g.deadline && <div style={{ fontSize: 12, color: 'var(--muted)', marginBottom: 10 }}>do {new Date(g.deadline).toLocaleDateString('cs-CZ')}</div>}
                <div style={{ background: 'var(--progress-track)', borderRadius: 4, height: 6, overflow: 'hidden', marginBottom: 6 }}>
                  <div style={{ background: '#8b5cf6', height: '100%', width: `${g.progress}%`, borderRadius: 4, transition: 'width 0.4s' }} />
                </div>
                <div style={{ fontSize: 12, color: '#8b5cf6', fontWeight: 600 }}>{g.progress}%</div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Bottom grid */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 20 }}>
        {/* Tasks */}
        <div style={{ background: 'var(--card)', border: '1px solid var(--border)', borderRadius: 12, padding: '20px', boxShadow: 'var(--shadow)' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
            <h2 style={{ fontSize: 16, fontWeight: 700, color: 'var(--text)' }}>Úkoly</h2>
            <Link href="/ukoly" style={{ fontSize: 13, color: 'var(--muted)', textDecoration: 'none' }}>Zobrazit vše →</Link>
          </div>
          {urgentTasks.length === 0 ? (
            <div style={{ color: 'var(--muted)', fontSize: 14, textAlign: 'center', padding: '20px 0' }}>Žádné otevřené úkoly 🎉</div>
          ) : urgentTasks.map(t => (
            <div key={t.id} style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '10px 0', borderBottom: '1px solid var(--border)' }}>
              <input type="checkbox" checked={t.status === 'Done'} onChange={() => checkTask(t)}
                style={{ width: 16, height: 16, accentColor: '#e53e3e', cursor: 'pointer', flexShrink: 0 }} />
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: 14, color: 'var(--text)', fontWeight: 500, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', textDecoration: t.status === 'Done' ? 'line-through' : 'none', opacity: t.status === 'Done' ? 0.5 : 1 }}>{t.nazev}</div>
                {t.deadline && <div style={{ fontSize: 12, color: 'var(--muted)', marginTop: 2 }}>{new Date(t.deadline).toLocaleDateString('cs-CZ')}</div>}
              </div>
              <span style={{ fontSize: 11, padding: '2px 8px', borderRadius: 20, background: priorityColor[t.priorita] + '22', color: priorityColor[t.priorita], fontWeight: 600, flexShrink: 0 }}>{t.priorita}</span>
            </div>
          ))}
        </div>

        {/* Finance */}
        <div style={{ background: 'var(--card)', border: '1px solid var(--border)', borderRadius: 12, padding: '20px', boxShadow: 'var(--shadow)' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 14 }}>
            <h2 style={{ fontSize: 16, fontWeight: 700, color: 'var(--text)' }}>Finance</h2>
            <Link href="/finance" style={{ fontSize: 13, color: 'var(--muted)', textDecoration: 'none' }}>Zobrazit vše →</Link>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, marginBottom: 16 }}>
            <div style={{ background: '#d1fae522', border: '1px solid #d1fae5', borderRadius: 8, padding: '10px 14px' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 4 }}>
                <TrendingUp size={14} color="#10b981" />
                <span style={{ fontSize: 12, color: '#10b981', fontWeight: 500 }}>Příjmy / měsíc</span>
              </div>
              <div style={{ fontSize: 18, fontWeight: 700, color: '#10b981' }}>{czk(monthIncome)}</div>
            </div>
            <div style={{ background: '#fee2e222', border: '1px solid #fee2e2', borderRadius: 8, padding: '10px 14px' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 4 }}>
                <TrendingDown size={14} color="#e53e3e" />
                <span style={{ fontSize: 12, color: '#e53e3e', fontWeight: 500 }}>Výdaje / měsíc</span>
              </div>
              <div style={{ fontSize: 18, fontWeight: 700, color: '#e53e3e' }}>{czk(monthExpense)}</div>
            </div>
          </div>

          <div style={{ fontSize: 12, color: 'var(--muted)', marginBottom: 10, fontWeight: 500 }}>Poslední transakce</div>
          {last5tx.length === 0 ? (
            <div style={{ color: 'var(--muted)', fontSize: 14, textAlign: 'center', padding: '12px 0' }}>Žádné transakce</div>
          ) : last5tx.map(t => (
            <div key={t.id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '8px 0', borderBottom: '1px solid var(--border)' }}>
              <div>
                <div style={{ fontSize: 13, color: 'var(--text)', fontWeight: 500 }}>{t.nazev}</div>
                <div style={{ fontSize: 11, color: 'var(--muted)' }}>{t.datum ? new Date(t.datum).toLocaleDateString('cs-CZ') : '—'}</div>
              </div>
              <div style={{ fontSize: 14, fontWeight: 700, color: t.typ === 'prijem' ? '#10b981' : '#e53e3e' }}>
                {t.typ === 'prijem' ? '+' : '-'}{czk(Number(t.castka))}
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Quick add transaction modal */}
      <Modal isOpen={addModal} onClose={() => setAddModal(false)} title="Přidat transakci">
        <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
          <div><label style={labelStyle}>Název</label><input style={inputStyle} value={form.nazev} onChange={e => setForm({ ...form, nazev: e.target.value })} placeholder="např. Faktura klient" autoFocus /></div>
          <div><label style={labelStyle}>Částka (Kč)</label><input type="number" style={inputStyle} value={form.castka} onChange={e => setForm({ ...form, castka: e.target.value })} /></div>
          <div><label style={labelStyle}>Datum</label><input type="date" style={inputStyle} value={form.datum} onChange={e => setForm({ ...form, datum: e.target.value })} /></div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
            <div><label style={labelStyle}>Typ</label>
              <select style={{ ...inputStyle, cursor: 'pointer' }} value={form.typ} onChange={e => setForm({ ...form, typ: e.target.value as Transaction['typ'], status: e.target.value === 'prijem' ? 'ceka' : e.target.value === 'dluh' ? 'nesplaceno' : '' })}>
                <option value="prijem">Příjem</option>
                <option value="vydaj">Výdaj</option>
                <option value="dluh">Dluh</option>
              </select>
            </div>
            <div><label style={labelStyle}>Status</label>
              <select style={{ ...inputStyle, cursor: 'pointer' }} value={form.status} onChange={e => setForm({ ...form, status: e.target.value })}>
                {form.typ === 'prijem' && <><option value="zaplaceno">Zaplaceno</option><option value="ceka">Čeká</option><option value="dluh">Dluh</option></>}
                {form.typ === 'vydaj' && <><option value="">—</option></>}
                {form.typ === 'dluh' && <><option value="nesplaceno">Nesplaceno</option><option value="splaceno">Splaceno</option></>}
              </select>
            </div>
          </div>
          <div style={{ display: 'flex', gap: 12, justifyContent: 'flex-end' }}>
            <button onClick={() => setAddModal(false)} style={{ background: 'transparent', border: '1px solid var(--border)', borderRadius: 8, padding: '10px 16px', color: 'var(--text)', cursor: 'pointer', fontSize: 14 }}>Zrušit</button>
            <button onClick={saveTransaction} disabled={saving || !form.nazev || !form.castka} style={{ background: '#e53e3e', border: 'none', borderRadius: 8, padding: '10px 20px', color: 'white', cursor: 'pointer', fontSize: 14, fontWeight: 600, opacity: saving ? 0.6 : 1 }}>
              {saving ? 'Ukládám...' : 'Uložit'}
            </button>
          </div>
        </div>
      </Modal>
    </div>
  )
}
