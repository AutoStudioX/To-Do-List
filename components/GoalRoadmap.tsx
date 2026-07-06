'use client'
import { Goal, Milestone } from '@/lib/types'
import { Check } from 'lucide-react'

export default function GoalRoadmap({ goals, milestones }: { goals: Goal[], milestones: Milestone[] }) {
  if (goals.length === 0) {
    return (
      <div style={{ textAlign: 'center', color: 'var(--muted)', padding: '32px 0', fontSize: 14 }}>
        Žádné goaly zatím. Přidejte první goal na stránce Goaly.
      </div>
    )
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 24 }}>
      {goals.map(goal => {
        const goalMilestones = milestones
          .filter(m => m.goal_id === goal.id)
          .sort((a, b) => {
            if (!a.deadline) return 1
            if (!b.deadline) return -1
            return new Date(a.deadline).getTime() - new Date(b.deadline).getTime()
          })

        return (
          <div key={goal.id} style={{
            background: 'var(--card)',
            border: '1px solid var(--border)',
            borderRadius: 10,
            padding: '16px 20px',
            boxShadow: 'var(--shadow)',
          }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 16 }}>
              <span style={{ fontSize: 15, fontWeight: 600, color: 'var(--text)' }}>{goal.nazev}</span>
              <span style={{
                fontSize: 11, padding: '2px 8px', borderRadius: 20,
                background: goal.status === 'completed' ? '#16a34a22' : 'rgba(229,62,62,0.1)',
                color: goal.status === 'completed' ? '#16a34a' : '#e53e3e',
                border: `1px solid ${goal.status === 'completed' ? '#16a34a44' : 'rgba(229,62,62,0.3)'}`,
              }}>
                {goal.status === 'completed' ? 'Splněno' : 'Aktivní'}
              </span>
              {goal.deadline && (
                <span style={{ fontSize: 12, color: 'var(--muted)', marginLeft: 'auto' }}>
                  Cíl: {new Date(goal.deadline).toLocaleDateString('cs-CZ')}
                </span>
              )}
            </div>

            {goalMilestones.length === 0 ? (
              <div style={{ color: 'var(--muted)', fontSize: 13 }}>Žádné kroky</div>
            ) : (
              <div style={{ display: 'flex', alignItems: 'center', gap: 0, overflowX: 'auto', paddingBottom: 8 }}>
                {goalMilestones.map((milestone, idx) => {
                  const isDone = milestone.done
                  const dotColor = isDone ? '#10b981' : '#e53e3e'
                  return (
                    <div key={milestone.id} style={{ display: 'flex', alignItems: 'center', flexShrink: 0 }}>
                      {idx > 0 && (
                        <div style={{ width: 40, height: 2, background: goalMilestones[idx - 1].done ? '#10b981' : 'var(--border)' }} />
                      )}
                      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 6 }}>
                        <div style={{
                          width: 28, height: 28, borderRadius: '50%',
                          background: isDone ? '#10b981' : 'var(--card)',
                          border: `2px solid ${dotColor}`,
                          display: 'flex', alignItems: 'center', justifyContent: 'center',
                          flexShrink: 0,
                        }}>
                          {isDone && <Check size={14} color="white" strokeWidth={3} />}
                        </div>
                        <div style={{ textAlign: 'center', maxWidth: 80 }}>
                          <div style={{ fontSize: 11, color: 'var(--text)', fontWeight: isDone ? 500 : 400 }}>{milestone.nazev}</div>
                          {milestone.deadline && (
                            <div style={{ fontSize: 10, color: 'var(--muted)' }}>
                              {new Date(milestone.deadline).toLocaleDateString('cs-CZ', { day: 'numeric', month: 'short' })}
                            </div>
                          )}
                        </div>
                      </div>
                    </div>
                  )
                })}

                {goal.deadline && (
                  <div style={{ display: 'flex', alignItems: 'center', flexShrink: 0 }}>
                    <div style={{ width: 40, height: 2, background: goal.status === 'completed' ? '#10b981' : 'var(--border)' }} />
                    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 6 }}>
                      <div style={{
                        width: 34, height: 34, borderRadius: '50%',
                        background: goal.status === 'completed' ? '#10b981' : '#e53e3e',
                        display: 'flex', alignItems: 'center', justifyContent: 'center',
                        fontSize: 14, fontWeight: 700,
                        color: 'white',
                      }}>
                        🎯
                      </div>
                      <div style={{ textAlign: 'center', maxWidth: 80 }}>
                        <div style={{ fontSize: 11, color: '#e53e3e', fontWeight: 600 }}>Cíl</div>
                        <div style={{ fontSize: 10, color: 'var(--muted)' }}>
                          {new Date(goal.deadline).toLocaleDateString('cs-CZ', { day: 'numeric', month: 'short', year: 'numeric' })}
                        </div>
                      </div>
                    </div>
                  </div>
                )}
              </div>
            )}

            <div style={{ marginTop: 12 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12, color: 'var(--muted)', marginBottom: 4 }}>
                <span>Pokrok</span>
                <span>{goal.progress}%</span>
              </div>
              <div style={{ background: 'var(--progress-track)', borderRadius: 4, height: 6, overflow: 'hidden' }}>
                <div style={{ background: '#e53e3e', height: '100%', width: `${goal.progress}%`, borderRadius: 4, transition: 'width 0.5s ease' }} />
              </div>
            </div>
          </div>
        )
      })}
    </div>
  )
}
