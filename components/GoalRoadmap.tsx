'use client'
import { Goal, Milestone } from '@/lib/types'
import { Check } from 'lucide-react'

export default function GoalRoadmap({ goals, milestones }: { goals: Goal[], milestones: Milestone[] }) {
  if (goals.length === 0) {
    return (
      <div style={{ textAlign: 'center', color: '#6b7280', padding: '32px 0', fontSize: 14 }}>
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

        const allPoints = [...goalMilestones]

        return (
          <div key={goal.id} style={{
            background: '#1a1a1a',
            border: '1px solid #2a2a2a',
            borderRadius: 10,
            padding: '16px 20px',
          }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 16 }}>
              <span style={{ fontSize: 15, fontWeight: 600 }}>{goal.nazev}</span>
              <span style={{
                fontSize: 11, padding: '2px 8px', borderRadius: 20,
                background: goal.status === 'completed' ? '#16a34a22' : '#3b82f622',
                color: goal.status === 'completed' ? '#4ade80' : '#60a5fa',
                border: `1px solid ${goal.status === 'completed' ? '#16a34a44' : '#3b82f644'}`,
              }}>
                {goal.status === 'completed' ? 'Splněno' : 'Aktivní'}
              </span>
              {goal.deadline && (
                <span style={{ fontSize: 12, color: '#6b7280', marginLeft: 'auto' }}>
                  Cíl: {new Date(goal.deadline).toLocaleDateString('cs-CZ')}
                </span>
              )}
            </div>

            {allPoints.length === 0 ? (
              <div style={{ color: '#6b7280', fontSize: 13 }}>Žádné milníky</div>
            ) : (
              <div style={{ display: 'flex', alignItems: 'center', gap: 0, overflowX: 'auto', paddingBottom: 8 }}>
                {allPoints.map((milestone, idx) => {
                  const isDone = milestone.done
                  const dotColor = isDone ? '#4ade80' : '#3b82f6'
                  const lineColor = isDone ? '#4ade80' : '#2a2a2a'
                  return (
                    <div key={milestone.id} style={{ display: 'flex', alignItems: 'center', flexShrink: 0 }}>
                      {idx > 0 && (
                        <div style={{ width: 40, height: 2, background: allPoints[idx - 1].done ? '#4ade80' : '#2a2a2a' }} />
                      )}
                      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 6 }}>
                        <div style={{
                          width: 28, height: 28, borderRadius: '50%',
                          background: isDone ? '#4ade80' : '#1a1a1a',
                          border: `2px solid ${dotColor}`,
                          display: 'flex', alignItems: 'center', justifyContent: 'center',
                          boxShadow: isDone ? '0 0 8px #4ade8044' : '0 0 8px #3b82f644',
                          animation: !isDone ? 'pulse 2s infinite' : 'none',
                          flexShrink: 0,
                        }}>
                          {isDone && <Check size={14} color="#0f0f0f" strokeWidth={3} />}
                        </div>
                        <div style={{ textAlign: 'center', maxWidth: 80 }}>
                          <div style={{ fontSize: 11, color: '#ffffff', fontWeight: isDone ? 500 : 400 }}>{milestone.nazev}</div>
                          {milestone.deadline && (
                            <div style={{ fontSize: 10, color: '#6b7280' }}>
                              {new Date(milestone.deadline).toLocaleDateString('cs-CZ', { day: 'numeric', month: 'short' })}
                            </div>
                          )}
                        </div>
                      </div>
                    </div>
                  )
                })}

                {/* Goal endpoint */}
                {goal.deadline && (
                  <div style={{ display: 'flex', alignItems: 'center', flexShrink: 0 }}>
                    <div style={{ width: 40, height: 2, background: goal.status === 'completed' ? '#4ade80' : '#2a2a2a' }} />
                    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 6 }}>
                      <div style={{
                        width: 34, height: 34, borderRadius: '50%',
                        background: goal.status === 'completed' ? '#4ade80' : '#3b82f6',
                        display: 'flex', alignItems: 'center', justifyContent: 'center',
                        fontSize: 14, fontWeight: 700,
                        color: '#0f0f0f',
                      }}>
                        🎯
                      </div>
                      <div style={{ textAlign: 'center', maxWidth: 80 }}>
                        <div style={{ fontSize: 11, color: '#60a5fa', fontWeight: 600 }}>Cíl</div>
                        <div style={{ fontSize: 10, color: '#6b7280' }}>
                          {new Date(goal.deadline).toLocaleDateString('cs-CZ', { day: 'numeric', month: 'short', year: 'numeric' })}
                        </div>
                      </div>
                    </div>
                  </div>
                )}
              </div>
            )}

            {/* Progress bar */}
            <div style={{ marginTop: 12 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12, color: '#6b7280', marginBottom: 4 }}>
                <span>Pokrok</span>
                <span>{goal.progress}%</span>
              </div>
              <div style={{ background: '#2a2a2a', borderRadius: 4, height: 6, overflow: 'hidden' }}>
                <div style={{ background: '#3b82f6', height: '100%', width: `${goal.progress}%`, borderRadius: 4, transition: 'width 0.5s ease' }} />
              </div>
            </div>
          </div>
        )
      })}
      <style>{`
        @keyframes pulse {
          0%, 100% { box-shadow: 0 0 8px #3b82f644; }
          50% { box-shadow: 0 0 16px #3b82f688; }
        }
      `}</style>
    </div>
  )
}
