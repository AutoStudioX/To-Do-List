'use client'
import { useEffect, useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { Task, Goal, Transaction, Projekt } from '@/lib/types'
import Modal from '@/components/Modal'
import Select from '@/components/Select'
import PillGroup from '@/components/PillGroup'
import { priorityColors, taskStatusColors, txTypColors, txStatusColors, smerColors, opakovaniColors, goalStatusColors } from '@/lib/badgeColors'
import { Toast, useToast } from '@/components/Toast'
import { Plus, TrendingUp, TrendingDown, CheckSquare, Target, X, Check, Sliders, Zap, Calculator } from 'lucide-react'
import CircleProgress from '@/components/CircleProgress'
import DatePicker from '@/components/DatePicker'
import Link from 'next/link'
import { seedRecurring } from '@/lib/seedRecurring'
import { useLiveData } from '@/lib/useLiveData'

const todayISO = () => { const d = new Date(); return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}` }
const czk = (n: number) => new Intl.NumberFormat('cs-CZ', { style: 'currency', currency: 'CZK', maximumFractionDigits: 0 }).format(n)
const inputStyle: React.CSSProperties = { width: '100%', background: 'var(--input-bg)', border: '1px solid var(--border)', borderRadius: 8, padding: '10px 14px', color: 'var(--text)', fontSize: 14, outline: 'none' }
const labelStyle: React.CSSProperties = { fontSize: 13, color: 'var(--muted)', display: 'block', marginBottom: 6, fontWeight: 500 }

const priorityColor: Record<string, string> = { High: '#e53e3e', Medium: '#f59e0b', Low: '#10b981' }

export default function PrehledPage() {
  const [tasks, setTasks] = useState<Task[]>([])
  const [goals, setGoals] = useState<Goal[]>([])
  const [transactions, setTransactions] = useState<Transaction[]>([])
  const [projekty, setProjekty] = useState<Projekt[]>([])
  const [addingProjekt, setAddingProjekt] = useState(false)
  const [newProjektName, setNewProjektName] = useState('')
  const [menu, setMenu] = useState(false)
  const [isMobile, setIsMobile] = useState(false)
  const [userEmail, setUserEmail] = useState<string | null>(null)
  useEffect(() => {
    const check = () => setIsMobile(window.innerWidth <= 768)
    check()
    window.addEventListener('resize', check)
    return () => window.removeEventListener('resize', check)
  }, [])
  const [addModal, setAddModal] = useState<'finance' | 'ukol' | 'goal' | null>(null)
  const [saving, setSaving] = useState(false)
  const [formErrors, setFormErrors] = useState<Record<string, string>>({})
  const { toast, showToast, hideToast } = useToast()
  const [txForm, setTxForm] = useState({ nazev: '', klient: '', castka: '', datum: new Date().toISOString().split('T')[0], typ: 'prijem' as Transaction['typ'], status: 'ceka', kategorie: '', opakovani: 'jednorazovy', smer: 'moje', poznamka: '' })
  const [taskForm, setTaskForm] = useState({ nazev: '', priorita: 'High', deadline: todayISO(), status: 'Todo', projekt: '' })
  const [goalForm, setGoalForm] = useState({ nazev: '', deadline: todayISO(), popis: '', typ: 'manual' as 'manual' | 'number' | 'income', progress: 0, current_value: '', target_value: '', status: 'active' as 'active' | 'completed' })

  async function load() {
    try {
      const supabase = createClient()
      const { data: { session } } = await supabase.auth.getSession()
      const user = session?.user
      if (!user) return
      setUserEmail(user.email ?? null)
      await seedRecurring(supabase, user.id)
      const [tr, gr, txr, pr] = await Promise.all([
        supabase.from('ukoly').select('*').eq('user_id', user.id),
        supabase.from('goaly').select('*').eq('user_id', user.id),
        supabase.from('transakce').select('*').eq('user_id', user.id).order('created_at', { ascending: false }),
        supabase.from('projekty').select('*').eq('user_id', user.id).order('nazev', { ascending: true }),
      ])
      setTasks(tr.data || [])
      setGoals(gr.data || [])
      setTransactions(txr.data || [])
      setProjekty(pr.data || [])
    } catch { }
  }

  async function addProjekt() {
    const nazev = newProjektName.trim()
    if (!nazev) return
    const supabase = createClient()
    const { data: { session } } = await supabase.auth.getSession()
    const user = session?.user
    if (!user) return
    if (projekty.some(p => p.nazev.toLowerCase() === nazev.toLowerCase())) {
      setTaskForm(f => ({ ...f, projekt: projekty.find(p => p.nazev.toLowerCase() === nazev.toLowerCase())!.nazev }))
      setNewProjektName(''); setAddingProjekt(false)
      return
    }
    const { data, error } = await supabase.from('projekty').insert({ user_id: user.id, nazev }).select().single()
    if (error) { showToast('Chyba: ' + error.message); return }
    setProjekty(prev => [...prev, data].sort((a, b) => a.nazev.localeCompare(b.nazev)))
    setTaskForm(f => ({ ...f, projekt: data.nazev }))
    setNewProjektName(''); setAddingProjekt(false)
  }

  useEffect(() => {
    load()
    window.addEventListener('voice-data-changed', load)
    return () => window.removeEventListener('voice-data-changed', load)
  }, [])
  useLiveData(['ukoly', 'goaly', 'transakce', 'projekty'], load)

  async function checkTask(task: Task) {
    const newStatus = task.status === 'Done' ? 'Todo' : 'Done'
    await createClient().from('ukoly').update({ status: newStatus }).eq('id', task.id)
    setTasks(prev => prev.map(t => t.id === task.id ? { ...t, status: newStatus } : t))
  }

  async function saveTransaction() {
    const errors: Record<string, string> = {}
    if (!txForm.castka) errors.castka = 'Částka je povinná'
    if (txForm.typ === 'prijem' && !txForm.klient.trim()) errors.klient = 'Klient je povinný'
    if (txForm.typ !== 'prijem' && !txForm.nazev.trim()) errors.nazev = 'Název je povinný'
    if (Object.keys(errors).length > 0) { setFormErrors(errors); return }
    const supabase = createClient()
    setSaving(true)
    const { data: { session } } = await supabase.auth.getSession()
    const user = session?.user
    if (!user) { setSaving(false); return }
    const { data } = await supabase.from('transakce').insert({
      nazev: txForm.typ === 'prijem' ? txForm.klient : txForm.nazev,
      klient: txForm.typ === 'prijem' ? txForm.klient : null,
      castka: Number(txForm.castka),
      datum: txForm.typ === 'fixni_naklad' ? null : txForm.datum,
      typ: txForm.typ, status: txForm.status,
      kategorie: txForm.kategorie || null,
      opakovani: txForm.opakovani,
      smer: txForm.typ === 'dluh' ? txForm.smer : null,
      poznamka: txForm.poznamka || null,
      user_id: user.id,
    }).select().single()
    if (data) setTransactions(prev => [data, ...prev])
    setSaving(false); setAddModal(null); setFormErrors({})
    setTxForm({ nazev: '', klient: '', castka: '', datum: new Date().toISOString().split('T')[0], typ: 'prijem', status: 'ceka', kategorie: '', opakovani: 'jednorazovy', smer: 'moje', poznamka: '' })
    showToast('Transakce přidána')
  }

  async function saveTask() {
    if (!taskForm.nazev.trim()) { setFormErrors({ nazev: 'Název je povinný' }); return }
    const supabase = createClient()
    setSaving(true)
    const { data: { session } } = await supabase.auth.getSession()
    const user = session?.user
    if (!user) { setSaving(false); return }
    const { data } = await supabase.from('ukoly').insert({
      nazev: taskForm.nazev, priorita: taskForm.priorita,
      deadline: taskForm.deadline || null, status: taskForm.status, projekt: taskForm.projekt || null, user_id: user.id,
    }).select().single()
    if (data) setTasks(prev => [data, ...prev])
    setSaving(false); setAddModal(null); setFormErrors({})
    setTaskForm({ nazev: '', priorita: 'High', deadline: todayISO(), status: 'Todo', projekt: '' })
    showToast('Úkol přidán')
  }

  async function saveGoal() {
    if (!goalForm.nazev.trim()) { setFormErrors({ nazev: 'Název je povinný' }); return }
    const supabase = createClient()
    setSaving(true)
    const { data: { session } } = await supabase.auth.getSession()
    const user = session?.user
    if (!user) { setSaving(false); return }
    const progress = goalForm.typ === 'manual' ? goalForm.progress
      : goalForm.typ === 'number' && goalForm.target_value ? Math.min(100, Math.round(Number(goalForm.current_value) / Number(goalForm.target_value) * 100))
      : goalForm.typ === 'income' && goalForm.target_value ? Math.min(100, Math.round(monthIncome / Number(goalForm.target_value) * 100))
      : 0
    const { data } = await supabase.from('goaly').insert({
      nazev: goalForm.nazev, deadline: goalForm.deadline || null,
      popis: goalForm.popis || null, progress,
      status: goalForm.status, user_id: user.id,
      typ: goalForm.typ,
      target_value: goalForm.target_value ? Number(goalForm.target_value) : null,
      current_value: goalForm.current_value ? Number(goalForm.current_value) : null,
    }).select().single()
    if (data) setGoals(prev => [...prev, data])
    setSaving(false); setAddModal(null); setFormErrors({})
    setGoalForm({ nazev: '', deadline: todayISO(), popis: '', typ: 'manual', progress: 0, current_value: '', target_value: '', status: 'active' })
    showToast('Goal přidán')
  }

  const now = new Date()
  const monthStart = new Date(now.getFullYear(), now.getMonth(), 1)
  const monthEnd = new Date(now.getFullYear(), now.getMonth() + 1, 0)

  const prijmy = transactions.filter(t => t.typ === 'prijem')
  const lifetimeIncome = prijmy.filter(t => t.status === 'zaplaceno').reduce((s, t) => s + Number(t.castka), 0)
  const monthIncome = prijmy.filter(t => t.status === 'zaplaceno' && t.datum && new Date(t.datum) >= monthStart && new Date(t.datum) <= monthEnd).reduce((s, t) => s + Number(t.castka), 0)
  const monthExpense = transactions.filter(t => t.typ === 'vydaj' && t.datum && new Date(t.datum) >= monthStart && new Date(t.datum) <= monthEnd).reduce((s, t) => s + Number(t.castka), 0)

  const openTasks = tasks.filter(t => t.status !== 'Done')
  const priorityOrder: Record<string, number> = { High: 0, Medium: 1, Low: 2 }
  const urgentTasks = [...openTasks]
    .sort((a, b) => {
      const pd = (priorityOrder[a.priorita] ?? 1) - (priorityOrder[b.priorita] ?? 1)
      if (pd !== 0) return pd
      if (!a.deadline && !b.deadline) return 0
      if (!a.deadline) return 1
      if (!b.deadline) return -1
      return new Date(a.deadline).getTime() - new Date(b.deadline).getTime()
    })

  const ringSize = isMobile ? 70 : 120
  const singleGoal = goals.length === 1 ? goals[0] : null
  const pendingIncome = prijmy.filter(t => t.status === 'ceka').reduce((s, t) => s + Number(t.castka), 0)
  const myDebt = transactions.filter(t => t.typ === 'dluh' && t.smer === 'moje' && t.status === 'nesplaceno').reduce((s, t) => s + Number(t.castka), 0)
  const theirDebt = transactions.filter(t => t.status !== 'splaceno' && (t.smer === 'mne' || (t.typ === 'prijem' && t.status === 'dluh'))).reduce((s, t) => s + Number(t.castka), 0)
  const last5tx = transactions.slice(0, 5)

  const [quickGoalId, setQuickGoalId] = useState<string | null>(null)
  const [quickValue, setQuickValue] = useState('')

  async function saveQuickProgress(goal: Goal) {
    if (!quickValue) return
    const supabase = createClient()
    const { data: { session } } = await supabase.auth.getSession()
    if (!session?.user) return
    const typ = goal.typ || 'manual'
    let newProgress = goal.progress
    let updates: Record<string, unknown> = {}
    if (typ === 'manual') {
      newProgress = Math.min(100, Math.max(0, Number(quickValue)))
      updates = { progress: newProgress }
    } else if (typ === 'number') {
      const newCurrent = (goal.current_value ?? 0) + Number(quickValue)
      newProgress = Math.min(100, Math.round(newCurrent / (goal.target_value ?? 1) * 100))
      updates = { current_value: newCurrent, progress: newProgress }
    } else if (typ === 'income') {
      return // income is auto, nothing to do
    }
    await supabase.from('goaly').update(updates).eq('id', goal.id)
    setGoals(prev => prev.map(g => g.id === goal.id ? { ...g, ...updates } as Goal : g))
    setQuickGoalId(null)
    setQuickValue('')
  }

  // Goal ring: single goal → show its progress; multiple → show % completed
  const calcGoalProgress = (g: Goal) => {
    const typ = g.typ || 'manual'
    if (typ === 'income') return Math.min(100, Math.round(monthIncome / (g.target_value ?? 1) * 100))
    if (typ === 'number') return Math.min(100, Math.round((g.current_value ?? 0) / (g.target_value ?? 1) * 100))
    return g.progress
  }
  const goalRingValue = singleGoal ? calcGoalProgress(singleGoal) : goals.filter(g => g.status === 'completed').length
  const goalRingMax = singleGoal ? 100 : Math.max(goals.length, 1)
  const goalRingLabel = singleGoal ? singleGoal.nazev : 'Goaly splněny'
  const goalRingSublabel = singleGoal ? singleGoal.nazev : undefined

  // Tasks ring = "how much of my plate did I clear THIS week".
  //   numerator   = tasks completed this calendar week (Mon 00:00 → now), by the
  //                 dokonceno_at stamp — counts even tasks finished late.
  //   denominator = those + everything still not done (the outstanding backlog).
  const _now = new Date()
  const _monday = new Date(_now)
  _monday.setHours(0, 0, 0, 0)
  _monday.setDate(_now.getDate() - ((_now.getDay() + 6) % 7))
  const _mondayMs = _monday.getTime()
  const weekDone = tasks.filter(t => t.status === 'Done' && t.dokonceno_at && new Date(t.dokonceno_at).getTime() >= _mondayMs).length
  const notDone = tasks.filter(t => t.status !== 'Done').length
  const weekRingMax = Math.max(weekDone + notDone, 1)

  return (
    <div style={{ height: isMobile ? 'auto' : '100%', display: 'flex', flexDirection: 'column', gap: 12, minHeight: 0 }}>
      {toast && <Toast message={toast.message} type={toast.type} onClose={hideToast} />}
      {/* Header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexShrink: 0 }}>
        <h1 style={{ fontSize: 26, fontWeight: 700, color: 'var(--text)', margin: 0 }}>Přehled</h1>
        <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
        <div style={{ position: 'relative' }}>
          <button onClick={() => setMenu(m => !m)} style={{ background: '#e53e3e', color: 'white', border: 'none', borderRadius: 10, padding: '10px 20px', fontSize: 14, fontWeight: 600, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 7, boxShadow: '0 4px 14px rgba(229,62,62,0.35)' }}>
            <Plus size={16} /> Přidat
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
      </div>

      {/* Rings */}
      <div className="rings-grid" style={{ background: 'var(--card)', border: '1px solid var(--border)', borderRadius: 12, padding: '16px 20px', boxShadow: 'var(--shadow)', display: 'grid', gridTemplateColumns: 'repeat(3, minmax(0, 1fr))', gap: 16, flexShrink: 0 }}>
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
          <CircleProgress label="Úkoly tento týden" value={weekDone} max={weekRingMax} color="#e53e3e" size={ringSize} hideBar={isMobile} />
          <div style={{ fontSize: 12, color: 'var(--muted)', marginTop: 4, textAlign: 'center' }}>
            {weekDone} splněno tento týden · {notDone} zbývá
          </div>
        </div>
        <CircleProgress label={goalRingLabel} value={goalRingValue} max={goalRingMax} color="#e53e3e" size={ringSize} hideBar={isMobile} />
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
          <CircleProgress label="Finance — cíl 1M Kč" value={lifetimeIncome} max={1000000} color="#f59e0b" size={ringSize} hideBar={isMobile} />
          {userEmail === 'larisaprodanets2055@gmail.com' && (
            <div style={{ fontSize: 11, color: 'var(--muted)', textAlign: 'center', marginTop: 4, fontStyle: 'italic' }}>Zavolej mi jestli používáš appku 😜</div>
          )}
        </div>
      </div>

      {/* Goals */}
      {goals.filter(g => g.status === 'active').length > 0 && (
        <div style={{ display: 'flex', gap: 10, flexShrink: 0, flexWrap: 'wrap' }}>
          {goals.filter(g => g.status === 'active').map(g => {
            const typ = g.typ || 'manual'
            const isOpen = quickGoalId === g.id
            const pct = typ === 'manual' ? g.progress
              : typ === 'number' ? Math.min(100, Math.round((g.current_value ?? 0) / (g.target_value ?? 1) * 100))
              : Math.min(100, Math.round(monthIncome / (g.target_value ?? 1) * 100))
            const valueLabel = typ === 'number'
              ? `${new Intl.NumberFormat('cs-CZ').format(g.current_value ?? 0)} z ${new Intl.NumberFormat('cs-CZ').format(g.target_value ?? 0)}`
              : typ === 'income'
              ? `${new Intl.NumberFormat('cs-CZ').format(monthIncome)} z ${new Intl.NumberFormat('cs-CZ').format(g.target_value ?? 0)}`
              : `${pct}%`
            return (
              <div key={g.id} style={{ background: 'var(--card)', border: `1px solid ${isOpen ? '#e53e3e' : 'var(--border)'}`, borderRadius: 10, padding: '10px 14px', boxShadow: 'var(--shadow)', flex: '1 1 180px', minWidth: 0, transition: 'border-color 0.15s' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 8, marginBottom: 5 }}>
                  <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--text)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', flex: 1 }}>{g.nazev}</div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexShrink: 0 }}>
                    <span style={{ fontSize: 12, fontWeight: 700, color: '#e53e3e' }}>{valueLabel}</span>
                    {typ !== 'income' && (
                      <button
                        onClick={() => { setQuickGoalId(isOpen ? null : g.id); setQuickValue('') }}
                        style={{ width: 22, height: 22, borderRadius: 6, border: `1px solid ${isOpen ? '#e53e3e' : 'var(--border)'}`, background: isOpen ? '#e53e3e' : 'transparent', color: isOpen ? 'white' : '#e53e3e', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 16, lineHeight: 1, fontWeight: 700 }}
                      >{isOpen ? <X size={13} /> : <Plus size={13} />}</button>
                    )}
                  </div>
                </div>
                {g.deadline && <div style={{ fontSize: 11, color: 'var(--muted)', marginBottom: 6 }}>do {new Date(g.deadline).toLocaleDateString('cs-CZ')}</div>}
                <div style={{ background: 'var(--progress-track)', borderRadius: 4, height: 5, overflow: 'hidden', marginBottom: isOpen ? 8 : 0 }}>
                  <div style={{ background: '#e53e3e', height: '100%', width: `${pct}%`, borderRadius: 4, transition: 'width 0.4s' }} />
                </div>
                {isOpen && (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                    {typ === 'manual' ? (
                      <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                        <input
                          type="range" min={0} max={100}
                          value={quickValue || g.progress || 0}
                          onChange={e => setQuickValue(e.target.value)}
                          style={{ flex: 1, accentColor: '#e53e3e' }}
                        />
                        <span style={{ fontSize: 12, fontWeight: 700, color: '#e53e3e', minWidth: 32, textAlign: 'right' }}>{quickValue || g.progress || 0}%</span>
                        <button onClick={() => saveQuickProgress(g)} style={{ background: '#e53e3e', border: 'none', borderRadius: 6, padding: '5px 10px', color: 'white', fontSize: 12, cursor: 'pointer', display: 'flex', alignItems: 'center' }}><Check size={14} /></button>
                      </div>
                    ) : (
                      <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
                        <input
                          type="number"
                          autoFocus
                          placeholder={`+ hodnota (aktuálně ${g.current_value ?? 0})`}
                          value={quickValue}
                          onChange={e => setQuickValue(e.target.value)}
                          onKeyDown={e => { if (e.key === 'Enter') saveQuickProgress(g); if (e.key === 'Escape') { setQuickGoalId(null); setQuickValue('') } }}
                          style={{ flex: 1, background: 'var(--input-bg)', border: '1px solid #e53e3e', borderRadius: 6, padding: '5px 10px', color: 'var(--text)', fontSize: 12, outline: 'none' }}
                        />
                        <button onClick={() => saveQuickProgress(g)} style={{ background: '#e53e3e', border: 'none', borderRadius: 6, padding: '5px 10px', color: 'white', fontSize: 12, fontWeight: 600, cursor: 'pointer', display: 'flex', alignItems: 'center' }}><Check size={14} /></button>
                      </div>
                    )}
                  </div>
                )}
              </div>
            )
          })}
        </div>
      )}

      {/* Bottom grid — fills remaining height */}
      <div className="bottom-grid" style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, flex: isMobile ? undefined : 1, minHeight: 0 }}>
        {/* Tasks */}
        <div style={{ background: 'var(--card)', border: '1px solid var(--border)', borderRadius: 12, padding: '14px 16px', boxShadow: 'var(--shadow)', display: 'flex', flexDirection: 'column', minHeight: isMobile ? 200 : 0, overflow: 'hidden' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10, flexShrink: 0 }}>
            <h2 style={{ fontSize: 14, fontWeight: 700, color: 'var(--text)', margin: 0 }}>Úkoly</h2>
            <Link href="/ukoly" style={{ fontSize: 12, color: 'var(--muted)', textDecoration: 'none' }}>Zobrazit vše →</Link>
          </div>
          <div style={{ flex: 1, overflowY: 'auto', minHeight: 0 }}>
            {urgentTasks.length === 0 ? (
              <div style={{ color: 'var(--muted)', fontSize: 13, textAlign: 'center', paddingTop: 16 }}>Žádné otevřené úkoly 🎉</div>
            ) : urgentTasks.map(t => {
              const isOverdue = t.status !== 'Done' && t.deadline && new Date(t.deadline) < new Date(new Date().toDateString())
              return (
              <div key={t.id} style={{ display: 'flex', alignItems: 'center', borderBottom: '1px solid var(--border)', background: isOverdue ? 'rgba(229,62,62,0.06)' : 'transparent', borderRadius: 6, overflow: 'hidden' }}>
                <div style={{ width: 4, alignSelf: 'stretch', background: t.status === 'Done' ? '#4b5563' : priorityColor[t.priorita], flexShrink: 0 }} />
                <div style={{ display: 'flex', alignItems: 'center', gap: 10, flex: 1, minWidth: 0, padding: '8px 10px' }}>
                <label style={{ minWidth: 44, minHeight: 44, marginLeft: -10, display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', flexShrink: 0, touchAction: 'manipulation' }}>
                  <input type="checkbox" checked={t.status === 'Done'} onChange={() => checkTask(t)}
                    style={{ width: 24, height: 24, accentColor: '#e53e3e', cursor: 'pointer' }} />
                </label>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: 15, color: 'var(--text)', fontWeight: 500, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', textDecoration: t.status === 'Done' ? 'line-through' : 'none', opacity: t.status === 'Done' ? 0.5 : 1 }}>{t.nazev}</div>
                  {t.deadline && <div style={{ fontSize: 13, color: isOverdue ? '#e53e3e' : 'var(--muted)', fontWeight: isOverdue ? 600 : 400, marginTop: 1 }}>{new Date(t.deadline).toLocaleDateString('cs-CZ')}</div>}
                </div>
                <span style={{ fontSize: 10, padding: '2px 7px', borderRadius: 20, background: priorityColor[t.priorita] + '22', color: priorityColor[t.priorita], fontWeight: 600, flexShrink: 0, whiteSpace: 'nowrap' }}>{t.priorita}</span>
                </div>
              </div>
            )})}
          </div>
        </div>

        {/* Finance */}
        <div style={{ background: 'var(--card)', border: '1px solid var(--border)', borderRadius: 12, padding: '14px 16px', boxShadow: 'var(--shadow)', display: 'flex', flexDirection: 'column', minHeight: isMobile ? 200 : 0, overflow: 'hidden' }}>
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
            {userEmail !== 'larisaprodanets2055@gmail.com' && <>
              <div style={{ background: '#fef3c722', border: '1px solid #fef3c7', borderRadius: 8, padding: '8px 12px' }}>
                <div style={{ fontSize: 11, color: '#d97706', fontWeight: 500, marginBottom: 3 }}>Čeká na platbu</div>
                <div style={{ fontSize: 15, fontWeight: 700, color: '#d97706' }}>{czk(pendingIncome)}</div>
              </div>
              <div style={{ background: '#ede9fe22', border: '1px solid #ede9fe', borderRadius: 8, padding: '8px 12px' }}>
                <div style={{ fontSize: 11, color: '#7c3aed', fontWeight: 500, marginBottom: 3 }}>Dluží mi</div>
                <div style={{ fontSize: 15, fontWeight: 700, color: '#7c3aed' }}>{czk(theirDebt)}</div>
              </div>
            </>}
          </div>

          <div style={{ fontSize: 11, color: 'var(--muted)', marginBottom: 6, fontWeight: 500, flexShrink: 0 }}>Poslední transakce</div>
          <div style={{ flex: 1, overflowY: 'auto', minHeight: 0 }}>
            {last5tx.length === 0 ? (
              <div style={{ color: 'var(--muted)', fontSize: 13, textAlign: 'center', paddingTop: 12 }}>Žádné transakce</div>
            ) : last5tx.map(t => (
              <div key={t.id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '7px 0', borderBottom: '1px solid var(--border)' }}>
                <div>
                  <div style={{ fontSize: 15, color: 'var(--text)', fontWeight: 500 }}>{t.nazev}</div>
                  <div style={{ fontSize: 13, color: 'var(--muted)' }}>{t.datum ? new Date(t.datum).toLocaleDateString('cs-CZ') : '—'}</div>
                </div>
                <div style={{ fontSize: 15, fontWeight: 700, color: t.typ === 'prijem' ? '#10b981' : '#e53e3e' }}>
                  {t.typ === 'prijem' ? '+' : '-'}{czk(Number(t.castka))}
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Finance modal */}
      <Modal isOpen={addModal === 'finance'} onClose={() => setAddModal(null)} title="Nová transakce">
        <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
          <div><label style={labelStyle}>Typ</label>
            <PillGroup value={txForm.typ} onChange={val => { const typ = val as Transaction['typ']; setTxForm({ ...txForm, typ, status: typ === 'prijem' ? 'ceka' : typ === 'dluh' ? 'nesplaceno' : '', smer: typ === 'dluh' ? 'moje' : '' }) }} options={[{ value: 'prijem', label: 'Příjem', color: txTypColors.prijem }, { value: 'vydaj', label: 'Výdaj', color: txTypColors.vydaj }, { value: 'dluh', label: 'Dluh', color: txTypColors.dluh }, { value: 'fixni_naklad', label: 'Fixní náklad', color: txTypColors.fixni_naklad }]} />
          </div>
          {txForm.typ === 'prijem' && (
            <div>
              <label style={labelStyle}>Klient</label>
              <input style={{ ...inputStyle, borderColor: formErrors.klient ? '#e53e3e' : undefined }} value={txForm.klient} onChange={e => { setTxForm({ ...txForm, klient: e.target.value }); setFormErrors(p => ({ ...p, klient: '' })) }} autoFocus />
              {formErrors.klient && <div style={{ fontSize: 12, color: '#e53e3e', marginTop: 4 }}>{formErrors.klient}</div>}
            </div>
          )}
          {txForm.typ !== 'prijem' && (
            <div>
              <label style={labelStyle}>{txForm.typ === 'dluh' ? (
                <>
                  <span style={{ color: txForm.smer === 'moje' ? 'var(--text)' : 'var(--muted)', }}>Komu dlužím</span>
                  <span style={{ color: 'var(--muted)', margin: '0 4px' }}>/</span>
                  <span style={{ color: txForm.smer === 'mne' ? 'var(--text)' : 'var(--muted)' }}>Kdo mi dluží</span>
                </>
              ) : 'Název'}</label>
              <input placeholder={txForm.typ === 'dluh' ? (txForm.smer === 'moje' ? 'např. Honza, Novák...' : 'např. Petr, firma...') : ''} style={{ ...inputStyle, borderColor: formErrors.nazev ? '#e53e3e' : undefined }} value={txForm.nazev} onChange={e => { setTxForm({ ...txForm, nazev: e.target.value }); setFormErrors(p => ({ ...p, nazev: '' })) }} autoFocus />
              {formErrors.nazev && <div style={{ fontSize: 12, color: '#e53e3e', marginTop: 4 }}>{formErrors.nazev}</div>}
            </div>
          )}
          <div>
            <label style={labelStyle}>Částka (Kč)</label>
            <input type="number" style={{ ...inputStyle, borderColor: formErrors.castka ? '#e53e3e' : undefined }} value={txForm.castka} onChange={e => { setTxForm({ ...txForm, castka: e.target.value }); setFormErrors(p => ({ ...p, castka: '' })) }} />
            {formErrors.castka && <div style={{ fontSize: 12, color: '#e53e3e', marginTop: 4 }}>{formErrors.castka}</div>}
          </div>
          {txForm.typ !== 'fixni_naklad' && (
            <div><label style={labelStyle}>Datum</label><DatePicker value={txForm.datum} onChange={v => setTxForm({ ...txForm, datum: v })} /></div>
          )}
          {txForm.typ === 'vydaj' && (
            <div><label style={labelStyle}>Kategorie</label><input style={inputStyle} value={txForm.kategorie} onChange={e => setTxForm({ ...txForm, kategorie: e.target.value })} /></div>
          )}
          {(txForm.typ === 'prijem' || txForm.typ === 'vydaj') && (
            <div><label style={labelStyle}>Opakování</label>
              <PillGroup value={txForm.opakovani} onChange={val => setTxForm({ ...txForm, opakovani: val })} options={[{ value: 'jednorazovy', label: 'Jednorázový', color: opakovaniColors.jednorazovy }, { value: 'mesicni', label: 'Měsíční', color: opakovaniColors.mesicni }, { value: 'rocni', label: 'Roční', color: opakovaniColors.rocni }]} />
            </div>
          )}
          {txForm.typ === 'prijem' && (
            <div><label style={labelStyle}>Status</label>
              <PillGroup value={txForm.status} onChange={val => setTxForm({ ...txForm, status: val })} options={[{ value: 'zaplaceno', label: 'Zaplaceno', color: txStatusColors.zaplaceno }, { value: 'ceka', label: 'Čeká', color: txStatusColors.ceka }, { value: 'dluh', label: 'Dluh (dluží mi)', color: txStatusColors.dluh }]} />
            </div>
          )}
          {txForm.typ === 'dluh' && (
            <>
              <div><label style={labelStyle}>Typ dluhu</label>
                <PillGroup value={txForm.smer} onChange={val => setTxForm({ ...txForm, smer: val })} options={[{ value: 'moje', label: 'Dluhu já (komu)', color: smerColors.moje }, { value: 'mne', label: 'Dluží mi (kdo)', color: smerColors.mne }]} />
              </div>
              <div><label style={labelStyle}>Status</label>
                <PillGroup value={txForm.status} onChange={val => setTxForm({ ...txForm, status: val })} options={[{ value: 'nesplaceno', label: 'Nesplaceno', color: txStatusColors.nesplaceno }, { value: 'splaceno', label: 'Splaceno', color: txStatusColors.splaceno }]} />
              </div>
            </>
          )}
          <div style={{ display: 'flex', gap: 12, justifyContent: 'flex-end' }}>
            <button onClick={() => setAddModal(null)} style={{ background: 'transparent', border: '1px solid var(--border)', borderRadius: 8, padding: '10px 16px', color: 'var(--text)', cursor: 'pointer', fontSize: 14 }}>Zrušit</button>
            <button onClick={saveTransaction} disabled={saving} style={{ background: '#e53e3e', border: 'none', borderRadius: 8, padding: '10px 20px', color: 'white', cursor: 'pointer', fontSize: 14, fontWeight: 600, opacity: saving ? 0.6 : 1 }}>
              {saving ? 'Ukládám...' : 'Uložit'}
            </button>
          </div>
        </div>
      </Modal>

      {/* Task modal */}
      <Modal isOpen={addModal === 'ukol'} onClose={() => { setAddModal(null); setFormErrors({}); setAddingProjekt(false); setNewProjektName('') }} title="Nový úkol">
        <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
          <div>
            <label style={labelStyle}>Název</label>
            <input style={{ ...inputStyle, borderColor: formErrors.nazev ? '#e53e3e' : undefined }} value={taskForm.nazev} onChange={e => { setTaskForm({ ...taskForm, nazev: e.target.value }); setFormErrors({}) }} autoFocus />
            {formErrors.nazev && <div style={{ fontSize: 12, color: '#e53e3e', marginTop: 4 }}>{formErrors.nazev}</div>}
          </div>
          <div><label style={labelStyle}>Priorita</label>
            <PillGroup value={taskForm.priorita} onChange={val => setTaskForm({ ...taskForm, priorita: val })} options={[{ value: 'Low', label: 'Low', color: priorityColors.Low }, { value: 'Medium', label: 'Medium', color: priorityColors.Medium }, { value: 'High', label: 'High', color: priorityColors.High }]} />
          </div>
          <div><label style={labelStyle}>Deadline</label><DatePicker value={taskForm.deadline} onChange={v => setTaskForm({ ...taskForm, deadline: v })} /></div>
          <div><label style={labelStyle}>Status</label>
            <PillGroup value={taskForm.status} onChange={val => setTaskForm({ ...taskForm, status: val })} options={[{ value: 'Todo', label: 'Todo', color: taskStatusColors.Todo }, { value: 'In Progress', label: 'In Progress', color: taskStatusColors['In Progress'] }, { value: 'Done', label: 'Done', color: taskStatusColors.Done }]} />
          </div>
          <div>
            <label style={labelStyle}>Projekt</label>
            <div style={{ display: 'flex', gap: 8, alignItems: 'flex-start' }}>
              <div style={{ flex: 1 }}>
                <Select
                  value={taskForm.projekt || ''}
                  onChange={val => setTaskForm({ ...taskForm, projekt: val })}
                  options={[{ value: '', label: '(žádný)' }, ...projekty.map(p => ({ value: p.nazev, label: p.nazev }))]}
                />
              </div>
              <button type="button" onClick={() => setAddingProjekt(a => !a)} style={{ background: 'var(--border)', border: 'none', borderRadius: 8, padding: '10px 12px', color: 'var(--text)', cursor: 'pointer', fontSize: 13, fontWeight: 500, whiteSpace: 'nowrap', display: 'flex', alignItems: 'center', gap: 4 }}>
                <Plus size={14} /> Přidat projekt
              </button>
            </div>
            {addingProjekt && (
              <div style={{ display: 'flex', gap: 8, marginTop: 8 }}>
                <input
                  style={inputStyle}
                  placeholder="Název nového projektu"
                  value={newProjektName}
                  onChange={e => setNewProjektName(e.target.value)}
                  onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); addProjekt() } }}
                  autoFocus
                />
                <button type="button" onClick={addProjekt} style={{ background: '#e53e3e', border: 'none', borderRadius: 8, padding: '10px 16px', color: 'white', cursor: 'pointer', fontSize: 13, fontWeight: 600, whiteSpace: 'nowrap' }}>
                  Uložit
                </button>
              </div>
            )}
          </div>
          <div style={{ display: 'flex', gap: 12, justifyContent: 'flex-end' }}>
            <button onClick={() => setAddModal(null)} style={{ background: 'transparent', border: '1px solid var(--border)', borderRadius: 8, padding: '10px 16px', color: 'var(--text)', cursor: 'pointer', fontSize: 14 }}>Zrušit</button>
            <button onClick={saveTask} disabled={saving} style={{ background: '#e53e3e', border: 'none', borderRadius: 8, padding: '10px 20px', color: 'white', cursor: 'pointer', fontSize: 14, fontWeight: 600, opacity: saving ? 0.6 : 1 }}>
              {saving ? 'Ukládám...' : 'Uložit'}
            </button>
          </div>
        </div>
      </Modal>

      {/* Goal modal */}
      <Modal isOpen={addModal === 'goal'} onClose={() => { setAddModal(null); setFormErrors({}) }} title="Nový goal">
        <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
          <div>
            <label style={labelStyle}>Název</label>
            <input style={{ ...inputStyle, borderColor: formErrors.nazev ? '#e53e3e' : undefined }} value={goalForm.nazev} onChange={e => { setGoalForm({ ...goalForm, nazev: e.target.value }); setFormErrors({}) }} autoFocus />
            {formErrors.nazev && <div style={{ fontSize: 12, color: '#e53e3e', marginTop: 4 }}>{formErrors.nazev}</div>}
          </div>
          <div><label style={labelStyle}>Deadline</label><DatePicker value={goalForm.deadline} onChange={v => setGoalForm({ ...goalForm, deadline: v })} /></div>
          <div>
            <label style={labelStyle}>Typ sledování pokroku</label>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 8 }}>
              {(['manual', 'number', 'income'] as const).map(t => (
                <button key={t} type="button" onClick={() => setGoalForm({ ...goalForm, typ: t })} style={{
                  padding: '8px 6px', borderRadius: 8, fontSize: 12, fontWeight: 500, cursor: 'pointer',
                  border: `2px solid ${goalForm.typ === t ? '#e53e3e' : 'var(--border)'}`,
                  background: goalForm.typ === t ? '#e53e3e22' : 'transparent',
                  color: goalForm.typ === t ? '#e53e3e' : 'var(--muted)',
                }}>
                  <span style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 5 }}>
                    {t === 'manual' ? <Sliders size={12} /> : t === 'number' ? <Calculator size={12} /> : <Zap size={12} />}
                    {t === 'manual' ? 'Manuální %' : t === 'number' ? 'Číselný cíl' : 'Příjmy'}
                  </span>
                </button>
              ))}
            </div>
          </div>
          {goalForm.typ === 'manual' && (
            <div>
              <label style={labelStyle}>Pokrok: {goalForm.progress}%</label>
              <input type="range" min={0} max={100} value={goalForm.progress} onChange={e => setGoalForm({ ...goalForm, progress: Number(e.target.value) })} style={{ width: '100%', accentColor: '#e53e3e' }} />
            </div>
          )}
          {goalForm.typ === 'number' && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                <div><label style={labelStyle}>Aktuální hodnota</label><input type="number" style={inputStyle} placeholder="0" value={goalForm.current_value} onChange={e => setGoalForm({ ...goalForm, current_value: e.target.value })} /></div>
                <div><label style={labelStyle}>Cílová hodnota</label><input type="number" style={inputStyle} placeholder="100 000" value={goalForm.target_value} onChange={e => setGoalForm({ ...goalForm, target_value: e.target.value })} /></div>
              </div>
              {goalForm.current_value && goalForm.target_value && (() => {
                const pct = Math.min(100, Math.round(Number(goalForm.current_value) / Number(goalForm.target_value) * 100))
                return (
                  <div>
                    <div style={{ display: 'grid', gridTemplateColumns: '1fr auto 1fr', fontSize: 12, color: 'var(--muted)', marginBottom: 6, gap: 4 }}>
                      <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{czk(Number(goalForm.current_value))}</span>
                      <span style={{ color: '#e53e3e', fontWeight: 700, textAlign: 'center' }}>{pct}%</span>
                      <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', textAlign: 'right' }}>{czk(Number(goalForm.target_value))}</span>
                    </div>
                    <div style={{ height: 8, background: 'var(--border)', borderRadius: 4, overflow: 'hidden' }}>
                      <div style={{ height: '100%', width: `${pct}%`, background: '#e53e3e', borderRadius: 4, transition: 'width 0.3s' }} />
                    </div>
                  </div>
                )
              })()}
            </div>
          )}
          {goalForm.typ === 'income' && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              <div style={{ background: '#e53e3e11', border: '1px solid #e53e3e33', borderRadius: 8, padding: '10px 14px', fontSize: 13, color: '#e53e3e' }}>
                <span style={{ display: 'flex', alignItems: 'center', gap: 6 }}><Zap size={13} /> Progress se počítá automaticky z příjmů tohoto měsíce</span>
              </div>
              <div><label style={labelStyle}>Cílová částka (Kč)</label><input type="number" style={inputStyle} placeholder="100 000" value={goalForm.target_value} onChange={e => setGoalForm({ ...goalForm, target_value: e.target.value })} /></div>
            </div>
          )}
          <div>
            <label style={labelStyle}>Status</label>
            <PillGroup value={goalForm.status} onChange={val => setGoalForm({ ...goalForm, status: val as 'active' | 'completed' })} options={[{ value: 'active', label: 'Aktivní', color: goalStatusColors.active }, { value: 'completed', label: 'Splněno', color: goalStatusColors.completed }]} />
          </div>
          <div style={{ display: 'flex', gap: 12, justifyContent: 'flex-end' }}>
            <button onClick={() => setAddModal(null)} style={{ background: 'transparent', border: '1px solid var(--border)', borderRadius: 8, padding: '10px 16px', color: 'var(--text)', cursor: 'pointer', fontSize: 14 }}>Zrušit</button>
            <button onClick={saveGoal} disabled={saving} style={{ background: '#e53e3e', border: 'none', borderRadius: 8, padding: '10px 20px', color: 'white', cursor: 'pointer', fontSize: 14, fontWeight: 600, opacity: saving ? 0.6 : 1 }}>
              {saving ? 'Ukládám...' : 'Uložit'}
            </button>
          </div>
        </div>
      </Modal>

    </div>
  )
}
