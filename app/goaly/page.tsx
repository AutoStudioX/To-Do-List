'use client'
import { useCallback, useEffect, useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { Goal, Milestone, Transaction } from '@/lib/types'
import Modal from '@/components/Modal'
import PillGroup from '@/components/PillGroup'
import { goalStatusColors } from '@/lib/badgeColors'
import DatePicker from '@/components/DatePicker'
import { Toast, useToast } from '@/components/Toast'
import { useConfirm } from '@/components/ConfirmDialog'
import { useLiveData } from '@/lib/useLiveData'
import { Plus, Trash2, Pencil, Check, Sliders, Calculator, Zap } from 'lucide-react'

const todayISO = () => { const d = new Date(); return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}` }

const inputStyle: React.CSSProperties = {
  width: '100%', background: 'var(--input-bg)', border: '1px solid var(--border)',
  borderRadius: 8, padding: '10px 14px', color: 'var(--text)', fontSize: 14, outline: 'none',
}
const labelStyle: React.CSSProperties = { fontSize: 13, color: 'var(--muted)', display: 'block', marginBottom: 6, fontWeight: 500 }

const czk = (n: number) => new Intl.NumberFormat('cs-CZ', { maximumFractionDigits: 0 }).format(n)

function computeProgress(goal: Goal, monthIncome: number): { pct: number; label: string } {
  const typ = goal.typ || 'manual'
  if (typ === 'manual') return { pct: goal.progress, label: `${goal.progress}%` }
  const current = typ === 'income' ? monthIncome : (goal.current_value ?? 0)
  const target = goal.target_value ?? 1
  const pct = Math.min(100, Math.round((current / target) * 100))
  return { pct, label: `${czk(current)} z ${czk(target)}` }
}

export default function GoalyPage() {
  const [goals, setGoals] = useState<Goal[]>([])
  const [milestones, setMilestones] = useState<Milestone[]>([])
  const [monthIncome, setMonthIncome] = useState(0)
  const [loading, setLoading] = useState(true)
  const [goalModal, setGoalModal] = useState(false)
  const [milestoneModal, setMilestoneModal] = useState(false)
  const [editGoal, setEditGoal] = useState<Goal | null>(null)
  const [milestoneGoalId, setMilestoneGoalId] = useState('')
  const [goalForm, setGoalForm] = useState({
    nazev: '', deadline: todayISO(), popis: '', progress: 0,
    status: 'active' as Goal['status'],
    typ: 'manual' as 'manual' | 'number' | 'income',
    current_value: '', target_value: '',
  })
  const [msForm, setMsForm] = useState({ nazev: '', deadline: todayISO() })
  const [saving, setSaving] = useState(false)
  const [goalError, setGoalError] = useState('')
  const [msError, setMsError] = useState('')
  const { toast, showToast, hideToast } = useToast()
  const { confirm, dialog: confirmDialog } = useConfirm()

  const load = useCallback(async () => {
    const supabase = createClient()
    try {
      const { data: { session } } = await supabase.auth.getSession()
      const user = session?.user
      if (!user) return
      const now = new Date()
      const monthStart = new Date(now.getFullYear(), now.getMonth(), 1).toISOString().split('T')[0]
      const monthEnd = new Date(now.getFullYear(), now.getMonth() + 1, 0).toISOString().split('T')[0]
      const [gr, mr, txr] = await Promise.all([
        supabase.from('goaly').select('*').eq('user_id', user.id).order('created_at', { ascending: false }),
        supabase.from('milniky').select('*').eq('user_id', user.id),
        supabase.from('transakce').select('castka').eq('user_id', user.id).eq('typ', 'prijem').eq('status', 'zaplaceno').gte('datum', monthStart).lte('datum', monthEnd),
      ])
      setGoals(gr.data || [])
      setMilestones(mr.data || [])
      const income = (txr.data || []).reduce((s: number, t: { castka: unknown }) => s + Number(t.castka), 0)
      setMonthIncome(income)
    } catch { } finally { setLoading(false) }
  }, [])

  useEffect(() => { load() }, [load])
  useLiveData(['goaly', 'milniky', 'transakce'], load)

  function openAddGoal() {
    setGoalForm({ nazev: '', deadline: todayISO(), popis: '', progress: 0, status: 'active', typ: 'manual', current_value: '', target_value: '' })
    setEditGoal(null); setGoalError(''); setGoalModal(true)
  }
  function openEditGoal(g: Goal) {
    setGoalForm({
      nazev: g.nazev, deadline: g.deadline || '', popis: g.popis || '',
      progress: g.progress, status: g.status,
      typ: (g.typ as 'manual' | 'number' | 'income') || 'manual',
      current_value: g.current_value != null ? String(g.current_value) : '',
      target_value: g.target_value != null ? String(g.target_value) : '',
    })
    setEditGoal(g); setGoalModal(true)
  }
  function openMilestone(goalId: string) {
    setMilestoneGoalId(goalId); setMsForm({ nazev: '', deadline: todayISO() }); setMsError(''); setMilestoneModal(true)
  }

  async function saveGoal() {
    if (!goalForm.nazev.trim()) { setGoalError('Název je povinný'); return }
    const supabase = createClient()
    setSaving(true)
    const { data: { session } } = await supabase.auth.getSession()
    const user = session?.user
    if (!user) { setSaving(false); return }

    let progress = goalForm.progress
    if (goalForm.typ === 'number' && goalForm.target_value) {
      const cur = Number(goalForm.current_value) || 0
      const tgt = Number(goalForm.target_value) || 1
      progress = Math.min(100, Math.round((cur / tgt) * 100))
    } else if (goalForm.typ === 'income' && goalForm.target_value) {
      progress = Math.min(100, Math.round((monthIncome / (Number(goalForm.target_value) || 1)) * 100))
    }

    const payload: Record<string, unknown> = {
      nazev: goalForm.nazev,
      deadline: goalForm.deadline || null,
      popis: goalForm.popis || null,
      progress,
      status: goalForm.status,
    }
    // Try with new columns; fall back to base payload if columns don't exist yet
    const extendedPayload = {
      ...payload,
      typ: goalForm.typ,
      current_value: goalForm.typ === 'number' ? (Number(goalForm.current_value) || null) : null,
      target_value: goalForm.typ !== 'manual' ? (Number(goalForm.target_value) || null) : null,
    }
    let error
    if (editGoal) {
      ;({ error } = await supabase.from('goaly').update(extendedPayload).eq('id', editGoal.id))
      if (error?.code === '42703') await supabase.from('goaly').update(payload).eq('id', editGoal.id)
    } else {
      ;({ error } = await supabase.from('goaly').insert({ ...extendedPayload, user_id: user.id }))
      if (error?.code === '42703') await supabase.from('goaly').insert({ ...payload, user_id: user.id })
    }
    setSaving(false); setGoalModal(false); setGoalError(''); load()
    showToast(editGoal ? 'Goal upraven' : 'Goal přidán')
  }

  async function saveMilestone() {
    if (!msForm.nazev.trim()) { setMsError('Název je povinný'); return }
    const supabase = createClient()
    setSaving(true)
    const { data: { session } } = await supabase.auth.getSession()
    const user = session?.user
    if (!user) { setSaving(false); return }
    await supabase.from('milniky').insert({ nazev: msForm.nazev, deadline: msForm.deadline || null, goal_id: milestoneGoalId, user_id: user.id, done: false })
    setSaving(false); setMilestoneModal(false); setMsError(''); load()
    showToast('Krok přidán')
  }

  async function toggleMilestone(m: Milestone) {
    await createClient().from('milniky').update({ done: !m.done }).eq('id', m.id)
    load()
  }

  async function deleteGoal(id: string) {
    if (!await confirm('Smazat goal?')) return
    await createClient().from('goaly').delete().eq('id', id)
    load(); showToast('Goal smazán')
  }

  async function deleteMilestone(id: string) {
    await createClient().from('milniky').delete().eq('id', id)
    load()
  }

  if (loading) return <div style={{ color: 'var(--muted)', padding: 24 }}>Načítání...</div>

  return (
    <div>
      {toast && <Toast message={toast.message} type={toast.type} onClose={hideToast} />}
      {confirmDialog}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 24 }}>
        <h1 style={{ fontSize: 26, fontWeight: 700, color: 'var(--text)' }}>Goaly</h1>
        <button onClick={openAddGoal} style={{ background: '#e53e3e', color: 'white', border: 'none', borderRadius: 10, padding: '10px 20px', fontSize: 14, fontWeight: 600, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 7, boxShadow: '0 4px 14px rgba(229,62,62,0.35)' }}>
          <Plus size={16} /> Přidat goal
        </button>
      </div>

      <div className="goal-grid" style={{ display: 'grid', gridTemplateColumns: `repeat(${Math.min(goals.length, 4)}, 1fr)`, gap: 20 }}>
        {goals.length === 0 ? (
          <div style={{ color: 'var(--muted)', padding: 24 }}>Žádné goaly. Přidejte první!</div>
        ) : goals.map(goal => {
          const goalMs = milestones.filter(m => m.goal_id === goal.id)
          const { pct, label } = computeProgress(goal, monthIncome)
          const typ = goal.typ || 'manual'
          return (
            <div key={goal.id} style={{ background: 'var(--card)', border: '1px solid var(--border)', borderRadius: 12, padding: 20, display: 'flex', flexDirection: 'column', gap: 12, boxShadow: 'var(--shadow)' }}>
              <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 8 }}>
                <div>
                  <h3 style={{ fontSize: 16, fontWeight: 600, margin: 0, color: 'var(--text)' }}>{goal.nazev}</h3>
                  {goal.deadline && (() => {
                    const overdue = new Date(goal.deadline) < new Date() && goal.status !== 'completed'
                    return <div style={{ fontSize: 12, color: overdue ? '#e53e3e' : 'var(--muted)', fontWeight: overdue ? 600 : 400, marginTop: 4 }}>Deadline: {new Date(goal.deadline).toLocaleDateString('cs-CZ')}{overdue ? ' ⚠' : ''}</div>
                  })()}
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 4, flexShrink: 0 }}>
                  <span style={{
                    fontSize: 11, padding: '2px 8px', borderRadius: 20,
                    background: goal.status === 'completed' ? '#d1fae5' : '#fee2e2',
                    color: goal.status === 'completed' ? '#059669' : '#e53e3e',
                    border: `1px solid ${goal.status === 'completed' ? '#a7f3d0' : '#fca5a5'}`,
                  }}>{goal.status === 'completed' ? 'Splněno' : 'Aktivní'}</span>
                  {typ !== 'manual' && (
                    <span style={{ fontSize: 10, padding: '2px 6px', borderRadius: 20, background: typ === 'income' ? '#e53e3e22' : '#e53e3e22', border: `1px solid ${typ === 'income' ? '#e53e3e' : '#e53e3e'}`, color: typ === 'income' ? '#e53e3e' : '#e53e3e', display: 'flex', alignItems: 'center', gap: 3, fontWeight: 600 }}>
                      {typ === 'income' ? <><Zap size={9} /> příjmy</> : <><Calculator size={9} /> číslo</>}
                    </span>
                  )}
                </div>
              </div>

              {goal.popis && <p style={{ fontSize: 13, color: 'var(--muted)', margin: 0 }}>{goal.popis}</p>}

              <div>
                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12, color: 'var(--muted)', marginBottom: 4 }}>
                  <span>{typ === 'income' ? 'Příjmy tento měsíc' : 'Pokrok'}</span>
                  <span style={{ fontWeight: 600, color: 'var(--text)' }}>{label}</span>
                </div>
                <div style={{ background: 'var(--progress-track)', borderRadius: 4, height: 8, overflow: 'hidden' }}>
                  <div style={{ background: '#e53e3e', height: '100%', width: `${pct}%`, borderRadius: 4, transition: 'width 0.3s' }} />
                </div>
                <div style={{ fontSize: 11, color: 'var(--muted)', marginTop: 3, textAlign: 'right' }}>{pct}%</div>
              </div>

              <div>
                <div style={{ fontSize: 12, color: 'var(--muted)', marginBottom: 8, fontWeight: 500 }}>Kroky ({goalMs.filter(m => m.done).length}/{goalMs.length})</div>
                {goalMs.map(m => (
                  <div key={m.id} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '4px 0' }}>
                    <button onClick={() => toggleMilestone(m)} style={{
                      width: 18, height: 18, borderRadius: 4, border: `2px solid ${m.done ? '#10b981' : 'var(--border)'}`,
                      background: m.done ? '#10b981' : 'transparent', cursor: 'pointer',
                      display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0,
                    }}>
                      {m.done && <Check size={10} color="white" strokeWidth={3} />}
                    </button>
                    <span style={{ fontSize: 13, color: m.done ? 'var(--muted)' : 'var(--text)', textDecoration: m.done ? 'line-through' : 'none', flex: 1 }}>{m.nazev}</span>
                    {m.deadline && <span style={{ fontSize: 11, color: 'var(--muted)' }}>{new Date(m.deadline).toLocaleDateString('cs-CZ')}</span>}
                    <button onClick={() => deleteMilestone(m.id)} style={{ background: 'transparent', border: 'none', color: '#e53e3e', cursor: 'pointer', padding: 2 }}>
                      <Trash2 size={12} />
                    </button>
                  </div>
                ))}
                <button onClick={() => openMilestone(goal.id)} style={{ background: 'transparent', border: '1px dashed var(--border)', borderRadius: 6, padding: '6px 10px', color: 'var(--muted)', cursor: 'pointer', fontSize: 12, marginTop: 8, display: 'flex', alignItems: 'center', gap: 4 }}>
                  <Plus size={12} /> Přidat krok
                </button>
              </div>

              <div style={{ display: 'flex', gap: 8, marginTop: 4 }}>
                <button onClick={() => openEditGoal(goal)} style={{ flex: 1, background: 'var(--border)', border: '1px solid var(--border)', borderRadius: 8, padding: '8px', color: 'var(--text)', cursor: 'pointer', fontSize: 13, fontWeight: 600, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 4 }}>
                  <Pencil size={13} /> Upravit
                </button>
                <button onClick={() => deleteGoal(goal.id)} style={{ flex: 1, background: 'transparent', border: '1px solid #fca5a5', borderRadius: 8, padding: '8px', color: '#e53e3e', cursor: 'pointer', fontSize: 13, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 4 }}>
                  <Trash2 size={13} /> Smazat
                </button>
              </div>
            </div>
          )
        })}
      </div>

      <Modal isOpen={goalModal} onClose={() => { setGoalModal(false); setGoalError('') }} title={editGoal ? 'Upravit goal' : 'Nový goal'}>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
          <div>
            <label style={labelStyle}>Název</label>
            <input style={{ ...inputStyle, borderColor: goalError ? '#e53e3e' : undefined }} value={goalForm.nazev} onChange={e => { setGoalForm({ ...goalForm, nazev: e.target.value }); setGoalError('') }} autoFocus />
            {goalError && <div style={{ fontSize: 12, color: '#e53e3e', marginTop: 4 }}>{goalError}</div>}
          </div>
          <div><label style={labelStyle}>Deadline</label><DatePicker value={goalForm.deadline} onChange={v => setGoalForm({ ...goalForm, deadline: v })} /></div>

          <div>
            <label style={labelStyle}>Typ sledování pokroku</label>
            <PillGroup
              value={goalForm.typ}
              onChange={t => setGoalForm({ ...goalForm, typ: t })}
              options={[
                { value: 'manual', label: 'Manuální %', icon: <Sliders size={14} /> },
                { value: 'number', label: 'Číselný cíl', icon: <Calculator size={14} /> },
                { value: 'income', label: 'Příjmy', icon: <Zap size={14} /> },
              ]}
            />
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
                <span style={{ display: 'flex', alignItems: 'center', gap: 6 }}><Zap size={13} /> Progress se počítá automaticky z příjmů tohoto měsíce — aktuálně <strong>{czk(monthIncome)} Kč</strong></span>
              </div>
              <div><label style={labelStyle}>Cílová částka (Kč)</label><input type="number" style={inputStyle} placeholder="100 000" value={goalForm.target_value} onChange={e => setGoalForm({ ...goalForm, target_value: e.target.value })} /></div>
              {goalForm.target_value && (
                <div style={{ fontSize: 12, color: '#e53e3e', fontWeight: 600 }}>
                  Aktuálně: {czk(monthIncome)} z {czk(Number(goalForm.target_value))} Kč ({Math.min(100, Math.round(monthIncome / Number(goalForm.target_value) * 100))}%)
                </div>
              )}
            </div>
          )}

          <div>
            <label style={labelStyle}>Status</label>
            <PillGroup value={goalForm.status} onChange={val => setGoalForm({ ...goalForm, status: val })} options={[{ value: 'active', label: 'Aktivní', color: goalStatusColors.active }, { value: 'completed', label: 'Splněno', color: goalStatusColors.completed }]} />
          </div>

          <div style={{ display: 'flex', gap: 12, justifyContent: 'flex-end' }}>
            <button onClick={() => setGoalModal(false)} style={{ background: 'transparent', border: '1px solid var(--border)', borderRadius: 8, padding: '10px 16px', color: 'var(--text)', cursor: 'pointer', fontSize: 14 }}>Zrušit</button>
            <button onClick={saveGoal} disabled={saving} style={{ background: '#e53e3e', border: 'none', borderRadius: 8, padding: '10px 20px', color: 'white', cursor: 'pointer', fontSize: 14, fontWeight: 600, opacity: saving ? 0.6 : 1 }}>
              {saving ? 'Ukládám...' : 'Uložit'}
            </button>
          </div>
        </div>
      </Modal>

      <Modal isOpen={milestoneModal} onClose={() => { setMilestoneModal(false); setMsError('') }} title="Přidat krok">
        <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
          <div>
            <label style={labelStyle}>Název</label>
            <input style={{ ...inputStyle, borderColor: msError ? '#e53e3e' : undefined }} value={msForm.nazev} onChange={e => { setMsForm({ ...msForm, nazev: e.target.value }); setMsError('') }} autoFocus />
            {msError && <div style={{ fontSize: 12, color: '#e53e3e', marginTop: 4 }}>{msError}</div>}
          </div>
          <div><label style={labelStyle}>Deadline</label><DatePicker value={msForm.deadline} onChange={v => setMsForm({ ...msForm, deadline: v })} /></div>
          <div style={{ display: 'flex', gap: 12, justifyContent: 'flex-end' }}>
            <button onClick={() => setMilestoneModal(false)} style={{ background: 'transparent', border: '1px solid var(--border)', borderRadius: 8, padding: '10px 16px', color: 'var(--text)', cursor: 'pointer', fontSize: 14 }}>Zrušit</button>
            <button onClick={saveMilestone} disabled={saving} style={{ background: '#e53e3e', border: 'none', borderRadius: 8, padding: '10px 16px', color: 'white', cursor: 'pointer', fontSize: 14, fontWeight: 600, opacity: saving ? 0.6 : 1 }}>
              {saving ? 'Ukládám...' : 'Přidat'}
            </button>
          </div>
        </div>
      </Modal>
    </div>
  )
}
