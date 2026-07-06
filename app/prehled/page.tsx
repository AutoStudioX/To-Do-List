'use client'
import { useEffect, useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { Task, Goal, Transaction } from '@/lib/types'
import Modal from '@/components/Modal'
import { Plus, TrendingUp, TrendingDown, CheckSquare, Target, X } from 'lucide-react'
import CircleProgress from '@/components/CircleProgress'
import DatePicker from '@/components/DatePicker'
import Link from 'next/link'

const czk = (n: number) => new Intl.NumberFormat('cs-CZ', { style: 'currency', currency: 'CZK', maximumFractionDigits: 0 }).format(n)
const inputStyle: React.CSSProperties = { width: '100%', background: 'var(--input-bg)', border: '1px solid var(--border)', borderRadius: 8, padding: '10px 14px', color: 'var(--text)', fontSize: 14, outline: 'none' }
const labelStyle: React.CSSProperties = { fontSize: 13, color: 'var(--muted)', display: 'block', marginBottom: 6, fontWeight: 500 }

const priorityColor: Record<string, string> = { High: '#e53e3e', Medium: '#f59e0b', Low: '#10b981' }

export default function PrehledPage() {
  const [tasks, setTasks] = useState<Task[]>([])
  const [goals, setGoals] = useState<Goal[]>([])
  const [transactions, setTransactions] = useState<Transaction[]>([])
  const [menu, setMenu] = useState(false)
  const [addModal, setAddModal] = useState<'finance' | 'ukol' | 'goal' | null>(null)
  const [saving, setSaving] = useState(false)
  const [txForm, setTxForm] = useState({ nazev: '', castka: '', datum: new Date().toISOString().split('T')[0], typ: 'prijem' as Transaction['typ'], status: 'ceka' })
  const [taskForm, setTaskForm] = useState({ nazev: '', priorita: 'Medium', deadline: '' })
  const [goalForm, setGoalForm] = useState({ nazev: '', deadline: '', popis: '' })

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
      nazev: txForm.nazev, castka: Number(txForm.castka), datum: txForm.datum,
      typ: txForm.typ, status: txForm.status, user_id: user.id,
    }).select().single()
    if (data) setTransactions(prev => [data, ...prev])
    setSaving(false); setAddModal(null)
    setTxForm({ nazev: '', castka: '', datum: new Date().toISOString().split('T')[0], typ: 'prijem', status: 'ceka' })
  }

  async function saveTask() {
    const supabase = createClient()
    setSaving(true)
    const { data: { session } } = await supabase.auth.getSession()
    const user = session?.user
    if (!user) { setSaving(false); return }
    const { data } = await supabase.from('ukoly').insert({
      nazev: taskForm.nazev, priorita: taskForm.priorita,
      deadline: taskForm.deadline || null, status: 'Todo', user_id: user.id,
    }).select().single()
    if (data) setTasks(prev => [data, ...prev])
    setSaving(false); setAddModal(null)
    setTaskForm({ nazev: '', priorita: 'Medium', deadline: '' })
  }

  async function saveGoal() {
    const supabase = createClient()
    setSaving(true)
    const { data: { session } } = await supabase.auth.getSession()
    const user = session?.user
    if (!user) { setSaving(false); return }
    const { data } = await supabase.from('goaly').insert({
      nazev: goalForm.nazev, deadline: goalForm.deadline || null,
      popis: goalForm.popis || null, progress: 0, status: 'active', user_id: user.id,
    }).select().single()
    if (data) setGoals(prev => [...prev, data])
    setSaving(false); setAddModal(null)
    setGoalForm({ nazev: '', deadline: '', popis: '' })
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

  const singleGoal = goals.length === 1 ? goals[0] : null
  const last5tx = transactions.slice(0, 5)

  // Goal ring: single goal → show its progress; multiple → show % completed
  const goalRingValue = singleGoal ? singleGoal.progress : goals.filter(g => g.status === 'completed').length
  const goalRingMax = singleGoal ? 100 : Math.max(goals.length, 1)
  const goalRingLabel = singleGoal ? singleGoal.nazev : 'Goaly splněny'
  const goalRingSublabel = singleGoal ? singleGoal.nazev : undefined

  return (
    <div style={{ height: '100%', display: 'flex', flexDirection: 'column', gap: 12, minHeight: 0 }}>
      {/* Header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexShrink: 0 }}>
        <h1 style={{ fontSize: 22, fontWeight: 700, color: 'var(--text)', margin: 0 }}>Přehled</h1>
        <div style={{ position: 'relative' }}>
          <button onClick={() => setMenu(m => !m)} style={{ background: '#e53e3e', color: 'white', border: 'none', borderRadius: 10, padding: '8px 16px', fontSize: 13, fontWeight: 600, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 7 }}>
            <Plus size={14} /> Přidat
          </button>
          {menu && (
            <>
              <div onClick={() => setMenu(false)} style={{ position: 'fixed', inset: 0, zIndex: 10 }} />
              <div style={{ position: 'absolute', top: '100%', right: 0, marginTop: 6, background: 'var(--card)', border: '1px solid var(--border)', borderRadius: 10, boxShadow: '0 8px 24px rgba(0,0,0,0.4)', zIndex: 20, minWidth: 160, overflow: 'hidden' }}>
                {([
                  { key: 'finance', label: 'Finance', icon: TrendingUp },
                  { key: 'ukol', label: 'Úkol', icon: CheckSquare },
                  { key: 'goal', label: 'Goal', icon: Target },
                ] as const).map(({ key, label, icon: Icon }) => (
                  <button key={key} onClick={() => { setAddModal(key); setMenu(false) }} style={{ display: 'flex', alignItems: 'center', gap: 10, width: '100%', padding: '11px 16px', background: 'transparent', border: 'none', color: 'var(--text)', fontSize: 14, cursor: 'pointer', textAlign: 'left' }}
                    onMouseEnter={e => (e.currentTarget.style.background = 'var(--nav-hover)')}
                    onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}
                  >
                    <Icon size={15} color="var(--muted)" /> {label}
                  </button>
                ))}
              </div>
            </>
          )}
        </div>
      </div>

      {/* Rings */}
      <div style={{ background: 'var(--card)', border: '1px solid var(--border)', borderRadius: 12, padding: '16px 20px', boxShadow: 'var(--shadow)', display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 16, flexShrink: 0 }}>
        <CircleProgress label="Úkoly splněny" value={tasks.filter(t => t.status === 'Done').length} max={Math.max(tasks.length, 1)} color="#e53e3e" size={90} />
        <CircleProgress label={goalRingLabel} value={goalRingValue} max={goalRingMax} color="#8b5cf6" size={90} sublabel={goalRingSublabel} />
        <CircleProgress label="Finance — cíl 1M Kč" value={lifetimeIncome} max={1000000} color="#f59e0b" size={90} />
      </div>

      {/* Bottom grid — fills remaining height */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, flex: 1, minHeight: 0 }}>
        {/* Tasks */}
        <div style={{ background: 'var(--card)', border: '1px solid var(--border)', borderRadius: 12, padding: '14px 16px', boxShadow: 'var(--shadow)', display: 'flex', flexDirection: 'column', minHeight: 0, overflow: 'hidden' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10, flexShrink: 0 }}>
            <h2 style={{ fontSize: 14, fontWeight: 700, color: 'var(--text)', margin: 0 }}>Úkoly</h2>
            <Link href="/ukoly" style={{ fontSize: 12, color: 'var(--muted)', textDecoration: 'none' }}>Zobrazit vše →</Link>
          </div>
          <div style={{ flex: 1, overflowY: 'auto', minHeight: 0 }}>
            {urgentTasks.length === 0 ? (
              <div style={{ color: 'var(--muted)', fontSize: 13, textAlign: 'center', paddingTop: 16 }}>Žádné otevřené úkoly 🎉</div>
            ) : urgentTasks.map(t => (
              <div key={t.id} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '8px 0', borderBottom: '1px solid var(--border)' }}>
                <input type="checkbox" checked={t.status === 'Done'} onChange={() => checkTask(t)}
                  style={{ width: 15, height: 15, accentColor: '#e53e3e', cursor: 'pointer', flexShrink: 0 }} />
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: 13, color: 'var(--text)', fontWeight: 500, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', textDecoration: t.status === 'Done' ? 'line-through' : 'none', opacity: t.status === 'Done' ? 0.5 : 1 }}>{t.nazev}</div>
                  {t.deadline && <div style={{ fontSize: 11, color: 'var(--muted)', marginTop: 1 }}>{new Date(t.deadline).toLocaleDateString('cs-CZ')}</div>}
                </div>
                <span style={{ fontSize: 10, padding: '2px 7px', borderRadius: 20, background: priorityColor[t.priorita] + '22', color: priorityColor[t.priorita], fontWeight: 600, flexShrink: 0 }}>{t.priorita}</span>
              </div>
            ))}
          </div>
        </div>

        {/* Finance */}
        <div style={{ background: 'var(--card)', border: '1px solid var(--border)', borderRadius: 12, padding: '14px 16px', boxShadow: 'var(--shadow)', display: 'flex', flexDirection: 'column', minHeight: 0, overflow: 'hidden' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10, flexShrink: 0 }}>
            <h2 style={{ fontSize: 14, fontWeight: 700, color: 'var(--text)', margin: 0 }}>Finance</h2>
            <Link href="/finance" style={{ fontSize: 12, color: 'var(--muted)', textDecoration: 'none' }}>Zobrazit vše →</Link>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8, marginBottom: 10, flexShrink: 0 }}>
            <div style={{ background: '#d1fae522', border: '1px solid #d1fae5', borderRadius: 8, padding: '8px 12px' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 5, marginBottom: 3 }}>
                <TrendingUp size={12} color="#10b981" />
                <span style={{ fontSize: 11, color: '#10b981', fontWeight: 500 }}>Příjmy / měsíc</span>
              </div>
              <div style={{ fontSize: 15, fontWeight: 700, color: '#10b981' }}>{czk(monthIncome)}</div>
            </div>
            <div style={{ background: '#fee2e222', border: '1px solid #fee2e2', borderRadius: 8, padding: '8px 12px' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 5, marginBottom: 3 }}>
                <TrendingDown size={12} color="#e53e3e" />
                <span style={{ fontSize: 11, color: '#e53e3e', fontWeight: 500 }}>Výdaje / měsíc</span>
              </div>
              <div style={{ fontSize: 15, fontWeight: 700, color: '#e53e3e' }}>{czk(monthExpense)}</div>
            </div>
          </div>

          <div style={{ fontSize: 11, color: 'var(--muted)', marginBottom: 6, fontWeight: 500, flexShrink: 0 }}>Poslední transakce</div>
          <div style={{ flex: 1, overflowY: 'auto', minHeight: 0 }}>
            {last5tx.length === 0 ? (
              <div style={{ color: 'var(--muted)', fontSize: 13, textAlign: 'center', paddingTop: 12 }}>Žádné transakce</div>
            ) : last5tx.map(t => (
              <div key={t.id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '7px 0', borderBottom: '1px solid var(--border)' }}>
                <div>
                  <div style={{ fontSize: 12, color: 'var(--text)', fontWeight: 500 }}>{t.nazev}</div>
                  <div style={{ fontSize: 10, color: 'var(--muted)' }}>{t.datum ? new Date(t.datum).toLocaleDateString('cs-CZ') : '—'}</div>
                </div>
                <div style={{ fontSize: 13, fontWeight: 700, color: t.typ === 'prijem' ? '#10b981' : '#e53e3e' }}>
                  {t.typ === 'prijem' ? '+' : '-'}{czk(Number(t.castka))}
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Finance modal */}
      <Modal isOpen={addModal === 'finance'} onClose={() => setAddModal(null)} title="Přidat transakci">
        <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
          <div><label style={labelStyle}>Název</label><input style={inputStyle} value={txForm.nazev} onChange={e => setTxForm({ ...txForm, nazev: e.target.value })} placeholder="např. Faktura klient" autoFocus /></div>
          <div><label style={labelStyle}>Částka (Kč)</label><input type="number" style={inputStyle} value={txForm.castka} onChange={e => setTxForm({ ...txForm, castka: e.target.value })} /></div>
          <div><label style={labelStyle}>Datum</label><DatePicker value={txForm.datum} onChange={v => setTxForm({ ...txForm, datum: v })} /></div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
            <div><label style={labelStyle}>Typ</label>
              <select style={{ ...inputStyle, cursor: 'pointer' }} value={txForm.typ} onChange={e => setTxForm({ ...txForm, typ: e.target.value as Transaction['typ'], status: e.target.value === 'prijem' ? 'ceka' : e.target.value === 'dluh' ? 'nesplaceno' : '' })}>
                <option value="prijem">Příjem</option>
                <option value="vydaj">Výdaj</option>
                <option value="dluh">Dluh</option>
              </select>
            </div>
            <div><label style={labelStyle}>Status</label>
              <select style={{ ...inputStyle, cursor: 'pointer' }} value={txForm.status} onChange={e => setTxForm({ ...txForm, status: e.target.value })}>
                {txForm.typ === 'prijem' && <><option value="zaplaceno">Zaplaceno</option><option value="ceka">Čeká</option><option value="dluh">Dluh</option></>}
                {txForm.typ === 'vydaj' && <option value="">—</option>}
                {txForm.typ === 'dluh' && <><option value="nesplaceno">Nesplaceno</option><option value="splaceno">Splaceno</option></>}
              </select>
            </div>
          </div>
          <div style={{ display: 'flex', gap: 12, justifyContent: 'flex-end' }}>
            <button onClick={() => setAddModal(null)} style={{ background: 'transparent', border: '1px solid var(--border)', borderRadius: 8, padding: '10px 16px', color: 'var(--text)', cursor: 'pointer', fontSize: 14 }}>Zrušit</button>
            <button onClick={saveTransaction} disabled={saving || !txForm.nazev || !txForm.castka} style={{ background: '#e53e3e', border: 'none', borderRadius: 8, padding: '10px 20px', color: 'white', cursor: 'pointer', fontSize: 14, fontWeight: 600, opacity: saving ? 0.6 : 1 }}>
              {saving ? 'Ukládám...' : 'Uložit'}
            </button>
          </div>
        </div>
      </Modal>

      {/* Task modal */}
      <Modal isOpen={addModal === 'ukol'} onClose={() => setAddModal(null)} title="Přidat úkol">
        <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
          <div><label style={labelStyle}>Název</label><input style={inputStyle} value={taskForm.nazev} onChange={e => setTaskForm({ ...taskForm, nazev: e.target.value })} placeholder="Co je potřeba udělat?" autoFocus /></div>
          <div><label style={labelStyle}>Priorita</label>
            <select style={{ ...inputStyle, cursor: 'pointer' }} value={taskForm.priorita} onChange={e => setTaskForm({ ...taskForm, priorita: e.target.value })}>
              <option value="High">High</option>
              <option value="Medium">Medium</option>
              <option value="Low">Low</option>
            </select>
          </div>
          <div><label style={labelStyle}>Deadline</label><DatePicker value={taskForm.deadline} onChange={v => setTaskForm({ ...taskForm, deadline: v })} /></div>
          <div style={{ display: 'flex', gap: 12, justifyContent: 'flex-end' }}>
            <button onClick={() => setAddModal(null)} style={{ background: 'transparent', border: '1px solid var(--border)', borderRadius: 8, padding: '10px 16px', color: 'var(--text)', cursor: 'pointer', fontSize: 14 }}>Zrušit</button>
            <button onClick={saveTask} disabled={saving || !taskForm.nazev} style={{ background: '#e53e3e', border: 'none', borderRadius: 8, padding: '10px 20px', color: 'white', cursor: 'pointer', fontSize: 14, fontWeight: 600, opacity: saving ? 0.6 : 1 }}>
              {saving ? 'Ukládám...' : 'Uložit'}
            </button>
          </div>
        </div>
      </Modal>

      {/* Goal modal */}
      <Modal isOpen={addModal === 'goal'} onClose={() => setAddModal(null)} title="Přidat goal">
        <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
          <div><label style={labelStyle}>Název</label><input style={inputStyle} value={goalForm.nazev} onChange={e => setGoalForm({ ...goalForm, nazev: e.target.value })} placeholder="Čeho chceš dosáhnout?" autoFocus /></div>
          <div><label style={labelStyle}>Deadline</label><DatePicker value={goalForm.deadline} onChange={v => setGoalForm({ ...goalForm, deadline: v })} /></div>
          <div><label style={labelStyle}>Popis</label><textarea style={{ ...inputStyle, resize: 'vertical', minHeight: 80 }} value={goalForm.popis} onChange={e => setGoalForm({ ...goalForm, popis: e.target.value })} placeholder="Volitelný popis..." /></div>
          <div style={{ display: 'flex', gap: 12, justifyContent: 'flex-end' }}>
            <button onClick={() => setAddModal(null)} style={{ background: 'transparent', border: '1px solid var(--border)', borderRadius: 8, padding: '10px 16px', color: 'var(--text)', cursor: 'pointer', fontSize: 14 }}>Zrušit</button>
            <button onClick={saveGoal} disabled={saving || !goalForm.nazev} style={{ background: '#8b5cf6', border: 'none', borderRadius: 8, padding: '10px 20px', color: 'white', cursor: 'pointer', fontSize: 14, fontWeight: 600, opacity: saving ? 0.6 : 1 }}>
              {saving ? 'Ukládám...' : 'Uložit'}
            </button>
          </div>
        </div>
      </Modal>
    </div>
  )
}
