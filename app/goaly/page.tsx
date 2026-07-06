'use client'
import { useCallback, useEffect, useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { Goal, Milestone, Transaction } from '@/lib/types'
import Modal from '@/components/Modal'
import DatePicker from '@/components/DatePicker'
import { Plus, Trash2, Pencil, Check, Sliders, Hash, Zap } from 'lucide-react'

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
    nazev: '', deadline: '', popis: '', progress: 0,
    status: 'active' as Goal['status'],
    typ: 'manual' as 'manual' | 'number' | 'income',
    current_value: '', target_value: '',
  })
  const [msForm, setMsForm] = useState({ nazev: '', deadline: '' })
  const [saving, setSaving] = useState(false)

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
      const income = (txr.data || [] as Pick<Transaction,'castka'>[]).reduce((s, t) => s + Number(t.castka), 0)
      setMonthIncome(income)
    } catch { } finally { setLoading(false) }
  }, [])

  useEffect(() => { load() }, [load])

  function openAddGoal() {
    setGoalForm({ nazev: '', deadline: '', popis: '', progress: 0, status: 'active', typ: 'manual', current_value: '', target_value: '' })
    setEditGoal(null); setGoalModal(true)
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
    setMilestoneGoalId(goalId); setMsForm({ nazev: '', deadline: '' }); setMilestoneModal(true)
  }

  async function saveGoal() {
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
    setSaving(false); setGoalModal(false); load()
  }

  async function saveMilestone() {
    const supabase = createClient()
    setSaving(true)
    const { data: { session } } = await supabase.auth.getSession()
    const user = session?.user
    if (!user) { setSaving(false); return }
    await supabase.from('milniky').insert({ nazev: msForm.nazev, deadline: msForm.deadline || null, goal_id: milestoneGoalId, user_id: user.id, done: false })
    setSaving(false); setMilestoneModal(false); load()
  }

  async function toggleMilestone(m: Milestone) {
    await createClient().from('milniky').update({ done: !m.done }).eq('id', m.id)
    load()
  }

  async function deleteGoal(id: string) {
    if (!confirm('Smazat goal?')) return
    await createClient().from('goaly').delete().eq('id', id)
    load()
  }

  async function deleteMilestone(id: string) {
    await createClient().from('milniky').delete().eq('id', id)
    load()
  }

  if (loading) return <div style={{ color: 'var(--muted)', padding: 24 }}>Načítání...</div>

  return (
    <div>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 24 }}>
        <h1 style={{ fontSize: 26, fontWeight: 700, color: 'var(--text)' }}>Goaly</h1>
        <button onClick={openAddGoal} style={{ background: '#e53e3e', color: 'white', border: 'none', borderRadius: 8, padding: '10px 16px', fontSize: 14, fontWeight: 600, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 6 }}>
          <Plus size={16} /> Přidat goal
        </button>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(320px, 1fr))', gap: 20 }}>
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
                  {goal.deadline && <div style={{ fontSize: 12, color: 'var(--muted)', marginTop: 4 }}>Deadline: {new Date(goal.deadline).toLocaleDateString('cs-CZ')}</div>}
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 4, flexShrink: 0 }}>
                  <span style={{
                    fontSize: 11, padding: '2px 8px', borderRadius: 20,
                    background: goal.status === 'completed' ? '#d1fae5' : '#ede9fe',
                    color: goal.status === 'completed' ? '#059669' : '#8b5cf6',
                    border: `1px solid ${goal.status === 'completed' ? '#a7f3d0' : '#c4b5fd'}`,
                  }}>{goal.status === 'completed' ? 'Splněno' : 'Aktivní'}</span>
                  {typ !== 'manual' && (
                    <span style={{ fontSize: 11, padding: '3px 8px', borderRadius: 20, background: typ === 'income' ? '#8b5cf622' : '#3b82f622', border: `1px solid ${typ === 'income' ? '#8b5cf6' : '#3b82f6'}`, color: typ === 'income' ? '#8b5cf6' : '#3b82f6', display: 'flex', alignItems: 'center', gap: 3, fontWeight: 600 }}>
                      {typ === 'income' ? <><Zap size={10} /> příjmy</> : <><Hash size={10} /> číslo</>}
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
                  <div style={{ background: '#8b5cf6', height: '100%', width: `${pct}%`, borderRadius: 4, transition: 'width 0.3s' }} />
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

      <Modal isOpen={goalModal} onClose={() => setGoalModal(false)} title={editGoal ? 'Upravit goal' : 'Nový goal'}>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
          <div><label style={labelStyle}>Název</label><input style={inputStyle} value={goalForm.nazev} onChange={e => setGoalForm({ ...goalForm, nazev: e.target.value })} autoFocus /></div>
          <div><label style={labelStyle}>Deadline</label><DatePicker value={goalForm.deadline} onChange={v => setGoalForm({ ...goalForm, deadline: v })} /></div>
          <div><label style={labelStyle}>Popis</label><textarea style={{ ...inputStyle, resize: 'vertical', minHeight: 60 }} value={goalForm.popis} onChange={e => setGoalForm({ ...goalForm, popis: e.target.value })} /></div>

          <div>
            <label style={labelStyle}>Typ sledování pokroku</label>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 8 }}>
              {(['manual', 'number', 'income'] as const).map(t => (
                <button key={t} type="button" onClick={() => setGoalForm({ ...goalForm, typ: t })} style={{
                  padding: '8px 6px', borderRadius: 8, fontSize: 12, fontWeight: 500, cursor: 'pointer',
                  border: `2px solid ${goalForm.typ === t ? '#8b5cf6' : 'var(--border)'}`,
                  background: goalForm.typ === t ? '#8b5cf622' : 'transparent',
                  color: goalForm.typ === t ? '#8b5cf6' : 'var(--muted)',
                }}>
                  <span style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 5 }}>
                    {t === 'manual' ? <Sliders size={12} /> : t === 'number' ? <Hash size={12} /> : <Zap size={12} />}
                    {t === 'manual' ? 'Manuální %' : t === 'number' ? 'Číselný cíl' : 'Příjmy'}
                  </span>
                </button>
              ))}
            </div>
          </div>

          {goalForm.typ === 'manual' && (
            <div>
              <label style={labelStyle}>Pokrok: {goalForm.progress}%</label>
              <input type="range" min={0} max={100} value={goalForm.progress} onChange={e => setGoalForm({ ...goalForm, progress: Number(e.target.value) })} style={{ width: '100%', accentColor: '#8b5cf6' }} />
            </div>
          )}

          {goalForm.typ === 'number' && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                <div><label style={labelStyle}>Aktuální hodnota</label><input type="number" style={inputStyle} placeholder="0" value={goalForm.current_value} onChange={e => setGoalForm({ ...goalForm, current_value: e.target.value })} /></div>
                <div><label style={labelStyle}>Cílová hodnota</label><input type="number" style={inputStyle} placeholder="100 000" value={goalForm.target_value} onChange={e => setGoalForm({ ...goalForm, target_value: e.target.value })} /></div>
              </div>
              {goalForm.current_value && goalForm.target_value && (
                <div style={{ fontSize: 12, color: '#8b5cf6', fontWeight: 600 }}>
                  Pokrok: {czk(Number(goalForm.current_value))} z {czk(Number(goalForm.target_value))} ({Math.min(100, Math.round(Number(goalForm.current_value) / Number(goalForm.target_value) * 100))}%)
                </div>
              )}
            </div>
          )}

          {goalForm.typ === 'income' && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              <div style={{ background: '#8b5cf611', border: '1px solid #8b5cf633', borderRadius: 8, padding: '10px 14px', fontSize: 13, color: '#8b5cf6' }}>
                <span style={{ display: 'flex', alignItems: 'center', gap: 6 }}><Zap size={13} /> Progress se počítá automaticky z příjmů tohoto měsíce — aktuálně <strong>{czk(monthIncome)} Kč</strong></span>
              </div>
              <div><label style={labelStyle}>Cílová částka (Kč)</label><input type="number" style={inputStyle} placeholder="100 000" value={goalForm.target_value} onChange={e => setGoalForm({ ...goalForm, target_value: e.target.value })} /></div>
              {goalForm.target_value && (
                <div style={{ fontSize: 12, color: '#8b5cf6', fontWeight: 600 }}>
                  Aktuálně: {czk(monthIncome)} z {czk(Number(goalForm.target_value))} Kč ({Math.min(100, Math.round(monthIncome / Number(goalForm.target_value) * 100))}%)
                </div>
              )}
            </div>
          )}

          <div>
            <label style={labelStyle}>Status</label>
            <select style={{ ...inputStyle, cursor: 'pointer' }} value={goalForm.status} onChange={e => setGoalForm({ ...goalForm, status: e.target.value as Goal['status'] })}>
              <option value="active">Aktivní</option>
              <option value="completed">Splněno</option>
            </select>
          </div>

          <div style={{ display: 'flex', gap: 12, justifyContent: 'flex-end' }}>
            <button onClick={() => setGoalModal(false)} style={{ background: 'transparent', border: '1px solid var(--border)', borderRadius: 8, padding: '10px 16px', color: 'var(--text)', cursor: 'pointer', fontSize: 14 }}>Zrušit</button>
            <button onClick={saveGoal} disabled={saving || !goalForm.nazev} style={{ background: '#8b5cf6', border: 'none', borderRadius: 8, padding: '10px 16px', color: 'white', cursor: 'pointer', fontSize: 14, fontWeight: 600, opacity: saving || !goalForm.nazev ? 0.6 : 1 }}>
              {saving ? 'Ukládám...' : 'Uložit'}
            </button>
          </div>
        </div>
      </Modal>

      <Modal isOpen={milestoneModal} onClose={() => setMilestoneModal(false)} title="Přidat krok">
        <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
          <div><label style={labelStyle}>Název</label><input style={inputStyle} value={msForm.nazev} onChange={e => setMsForm({ ...msForm, nazev: e.target.value })} autoFocus /></div>
          <div><label style={labelStyle}>Deadline</label><DatePicker value={msForm.deadline} onChange={v => setMsForm({ ...msForm, deadline: v })} /></div>
          <div style={{ display: 'flex', gap: 12, justifyContent: 'flex-end' }}>
            <button onClick={() => setMilestoneModal(false)} style={{ background: 'transparent', border: '1px solid var(--border)', borderRadius: 8, padding: '10px 16px', color: 'var(--text)', cursor: 'pointer', fontSize: 14 }}>Zrušit</button>
            <button onClick={saveMilestone} disabled={saving || !msForm.nazev} style={{ background: '#8b5cf6', border: 'none', borderRadius: 8, padding: '10px 16px', color: 'white', cursor: 'pointer', fontSize: 14, fontWeight: 600, opacity: saving || !msForm.nazev ? 0.6 : 1 }}>
              {saving ? 'Ukládám...' : 'Přidat'}
            </button>
          </div>
        </div>
      </Modal>
    </div>
  )
}
