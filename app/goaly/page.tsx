'use client'
import { useEffect, useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { Goal, Milestone } from '@/lib/types'
import Modal from '@/components/Modal'
import { Plus, Trash2, Pencil, Check } from 'lucide-react'

const inputStyle: React.CSSProperties = {
  width: '100%', background: 'var(--input-bg)', border: '1px solid var(--border)',
  borderRadius: 8, padding: '10px 14px', color: 'var(--text)', fontSize: 14, outline: 'none',
}
const labelStyle: React.CSSProperties = { fontSize: 13, color: 'var(--muted)', display: 'block', marginBottom: 6, fontWeight: 500 }

export default function GoalyPage() {
  const [goals, setGoals] = useState<Goal[]>([])
  const [milestones, setMilestones] = useState<Milestone[]>([])
  const [loading, setLoading] = useState(false)
  const [goalModal, setGoalModal] = useState(false)
  const [milestoneModal, setMilestoneModal] = useState(false)
  const [editGoal, setEditGoal] = useState<Goal | null>(null)
  const [milestoneGoalId, setMilestoneGoalId] = useState<string>('')
  const [goalForm, setGoalForm] = useState({ nazev: '', deadline: '', popis: '', progress: 0, status: 'active' as Goal['status'] })
  const [msForm, setMsForm] = useState({ nazev: '', deadline: '' })
  const [saving, setSaving] = useState(false)
  const supabase = createClient()

  async function load() {
    try {
      const { data: { session } } = await supabase.auth.getSession()
      const user = session?.user
      if (!user) return
      const [gr, mr] = await Promise.all([
        supabase.from('goaly').select('*').eq('user_id', user.id).order('created_at', { ascending: false }),
        supabase.from('milniky').select('*').eq('user_id', user.id),
      ])
      setGoals(gr.data || [])
      setMilestones(mr.data || [])
    } catch {
      // ignore
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { load() }, [])

  function openAddGoal() {
    setGoalForm({ nazev: '', deadline: '', popis: '', progress: 0, status: 'active' })
    setEditGoal(null); setGoalModal(true)
  }
  function openEditGoal(g: Goal) {
    setGoalForm({ nazev: g.nazev, deadline: g.deadline || '', popis: g.popis || '', progress: g.progress, status: g.status })
    setEditGoal(g); setGoalModal(true)
  }
  function openMilestone(goalId: string) {
    setMilestoneGoalId(goalId); setMsForm({ nazev: '', deadline: '' }); setMilestoneModal(true)
  }

  async function saveGoal() {
    setSaving(true)
    const { data: { session } } = await supabase.auth.getSession()
    const user = session?.user
    if (!user) return
    const payload = { nazev: goalForm.nazev, deadline: goalForm.deadline || null, popis: goalForm.popis || null, progress: goalForm.progress, status: goalForm.status }
    if (editGoal) {
      await supabase.from('goaly').update(payload).eq('id', editGoal.id)
    } else {
      await supabase.from('goaly').insert({ ...payload, user_id: user.id })
    }
    setSaving(false); setGoalModal(false); load()
  }

  async function saveMilestone() {
    setSaving(true)
    const { data: { session } } = await supabase.auth.getSession()
    const user = session?.user
    if (!user) return
    await supabase.from('milniky').insert({ nazev: msForm.nazev, deadline: msForm.deadline || null, goal_id: milestoneGoalId, user_id: user.id, done: false })
    setSaving(false); setMilestoneModal(false); load()
  }

  async function toggleMilestone(m: Milestone) {
    await supabase.from('milniky').update({ done: !m.done }).eq('id', m.id)
    load()
  }

  async function deleteGoal(id: string) {
    if (!confirm('Smazat goal?')) return
    await supabase.from('goaly').delete().eq('id', id)
    load()
  }

  async function deleteMilestone(id: string) {
    await supabase.from('milniky').delete().eq('id', id)
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
          return (
            <div key={goal.id} style={{ background: 'var(--card)', border: '1px solid var(--border)', borderRadius: 12, padding: 20, display: 'flex', flexDirection: 'column', gap: 12, boxShadow: 'var(--shadow)' }}>
              <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 8 }}>
                <div>
                  <h3 style={{ fontSize: 16, fontWeight: 600, margin: 0, color: 'var(--text)' }}>{goal.nazev}</h3>
                  {goal.deadline && <div style={{ fontSize: 12, color: 'var(--muted)', marginTop: 4 }}>Deadline: {new Date(goal.deadline).toLocaleDateString('cs-CZ')}</div>}
                </div>
                <div style={{ display: 'flex', gap: 6, flexShrink: 0 }}>
                  <span style={{
                    fontSize: 11, padding: '2px 8px', borderRadius: 20,
                    background: goal.status === 'completed' ? '#d1fae5' : '#fee2e2',
                    color: goal.status === 'completed' ? '#059669' : '#e53e3e',
                    border: `1px solid ${goal.status === 'completed' ? '#a7f3d0' : '#fca5a5'}`,
                  }}>{goal.status === 'completed' ? 'Splněno' : 'Aktivní'}</span>
                </div>
              </div>

              {goal.popis && <p style={{ fontSize: 13, color: 'var(--muted)', margin: 0 }}>{goal.popis}</p>}

              <div>
                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12, color: 'var(--muted)', marginBottom: 4 }}>
                  <span>Pokrok</span><span>{goal.progress}%</span>
                </div>
                <div style={{ background: 'var(--progress-track)', borderRadius: 4, height: 8, overflow: 'hidden' }}>
                  <div style={{ background: '#e53e3e', height: '100%', width: `${goal.progress}%`, borderRadius: 4, transition: 'width 0.3s' }} />
                </div>
              </div>

              {/* Milestones */}
              <div>
                <div style={{ fontSize: 12, color: 'var(--muted)', marginBottom: 8, fontWeight: 500 }}>Milníky ({goalMs.filter(m => m.done).length}/{goalMs.length})</div>
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
                  <Plus size={12} /> Přidat milník
                </button>
              </div>

              <div style={{ display: 'flex', gap: 8, marginTop: 4 }}>
                <button onClick={() => openEditGoal(goal)} style={{ flex: 1, background: 'transparent', border: '1px solid var(--border)', borderRadius: 8, padding: '8px', color: 'var(--muted)', cursor: 'pointer', fontSize: 13, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 4 }}>
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
          <div><label style={labelStyle}>Název</label><input style={inputStyle} value={goalForm.nazev} onChange={e => setGoalForm({ ...goalForm, nazev: e.target.value })} /></div>
          <div><label style={labelStyle}>Deadline</label><input type="date" style={inputStyle} value={goalForm.deadline} onChange={e => setGoalForm({ ...goalForm, deadline: e.target.value })} /></div>
          <div><label style={labelStyle}>Popis</label><textarea style={{ ...inputStyle, resize: 'vertical', minHeight: 80 }} value={goalForm.popis} onChange={e => setGoalForm({ ...goalForm, popis: e.target.value })} /></div>
          <div>
            <label style={labelStyle}>Pokrok: {goalForm.progress}%</label>
            <input type="range" min={0} max={100} value={goalForm.progress} onChange={e => setGoalForm({ ...goalForm, progress: Number(e.target.value) })} style={{ width: '100%', accentColor: '#e53e3e' }} />
          </div>
          <div>
            <label style={labelStyle}>Status</label>
            <select style={{ ...inputStyle, cursor: 'pointer' }} value={goalForm.status} onChange={e => setGoalForm({ ...goalForm, status: e.target.value as Goal['status'] })}>
              <option value="active">Aktivní</option>
              <option value="completed">Splněno</option>
            </select>
          </div>
          <div style={{ display: 'flex', gap: 12, justifyContent: 'flex-end' }}>
            <button onClick={() => setGoalModal(false)} style={{ background: 'transparent', border: '1px solid var(--border)', borderRadius: 8, padding: '10px 16px', color: 'var(--text)', cursor: 'pointer', fontSize: 14 }}>Zrušit</button>
            <button onClick={saveGoal} disabled={saving || !goalForm.nazev} style={{ background: '#e53e3e', border: 'none', borderRadius: 8, padding: '10px 16px', color: 'white', cursor: 'pointer', fontSize: 14, fontWeight: 600, opacity: saving || !goalForm.nazev ? 0.6 : 1 }}>
              {saving ? 'Ukládám...' : 'Uložit'}
            </button>
          </div>
        </div>
      </Modal>

      <Modal isOpen={milestoneModal} onClose={() => setMilestoneModal(false)} title="Přidat milník">
        <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
          <div><label style={labelStyle}>Název</label><input style={inputStyle} value={msForm.nazev} onChange={e => setMsForm({ ...msForm, nazev: e.target.value })} /></div>
          <div><label style={labelStyle}>Deadline</label><input type="date" style={inputStyle} value={msForm.deadline} onChange={e => setMsForm({ ...msForm, deadline: e.target.value })} /></div>
          <div style={{ display: 'flex', gap: 12, justifyContent: 'flex-end' }}>
            <button onClick={() => setMilestoneModal(false)} style={{ background: 'transparent', border: '1px solid var(--border)', borderRadius: 8, padding: '10px 16px', color: 'var(--text)', cursor: 'pointer', fontSize: 14 }}>Zrušit</button>
            <button onClick={saveMilestone} disabled={saving || !msForm.nazev} style={{ background: '#e53e3e', border: 'none', borderRadius: 8, padding: '10px 16px', color: 'white', cursor: 'pointer', fontSize: 14, fontWeight: 600, opacity: saving || !msForm.nazev ? 0.6 : 1 }}>
              {saving ? 'Ukládám...' : 'Přidat'}
            </button>
          </div>
        </div>
      </Modal>
    </div>
  )
}
