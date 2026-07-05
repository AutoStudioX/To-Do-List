'use client'
import { useEffect, useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import CircleProgress from '@/components/CircleProgress'
import GoalRoadmap from '@/components/GoalRoadmap'
import { Task, Goal, Milestone, Income, Debt } from '@/lib/types'
import { CheckSquare, Calendar, TrendingUp, CreditCard } from 'lucide-react'

const czk = (n: number) => new Intl.NumberFormat('cs-CZ', { style: 'currency', currency: 'CZK', maximumFractionDigits: 0 }).format(n)

export default function PrehledPage() {
  const [tasks, setTasks] = useState<Task[]>([])
  const [goals, setGoals] = useState<Goal[]>([])
  const [milestones, setMilestones] = useState<Milestone[]>([])
  const [incomes, setIncomes] = useState<Income[]>([])
  const [debts, setDebts] = useState<Debt[]>([])
  const [loading, setLoading] = useState(true)
  const supabase = createClient()

  useEffect(() => {
    async function load() {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) return

      const [tasksRes, goalsRes, milestonesRes, incomesRes, debtsRes] = await Promise.all([
        supabase.from('ukoly').select('*').eq('user_id', user.id),
        supabase.from('goaly').select('*').eq('user_id', user.id),
        supabase.from('milniky').select('*').eq('user_id', user.id),
        supabase.from('prijmy').select('*').eq('user_id', user.id),
        supabase.from('dluhy').select('*').eq('user_id', user.id),
      ])

      setTasks(tasksRes.data || [])
      setGoals(goalsRes.data || [])
      setMilestones(milestonesRes.data || [])
      setIncomes(incomesRes.data || [])
      setDebts(debtsRes.data || [])
      setLoading(false)
    }
    load()
  }, [])

  const doneTasks = tasks.filter(t => t.status === 'Done').length
  const completedGoals = goals.filter(g => g.status === 'completed').length

  const now = new Date()
  const monthStart = new Date(now.getFullYear(), now.getMonth(), 1)
  const monthIncomes = incomes.filter(i => i.status === 'zaplaceno' && new Date(i.datum) >= monthStart)
  const monthTotal = monthIncomes.reduce((s, i) => s + Number(i.castka), 0)

  const myDebts = debts.filter(d => d.smer === 'moje' && d.status === 'nesplaceno')
  const myDebtTotal = myDebts.reduce((s, d) => s + Number(d.castka), 0)
  const paidDebts = debts.filter(d => d.smer === 'moje' && d.status === 'splaceno')
  const allMyDebtTotal = myDebtTotal + paidDebts.reduce((s, d) => s + Number(d.castka), 0)

  const openTasks = tasks.filter(t => t.status !== 'Done')
  const nextDeadline = openTasks
    .filter(t => t.deadline)
    .sort((a, b) => new Date(a.deadline!).getTime() - new Date(b.deadline!).getTime())[0]

  const lifetimeIncome = incomes.filter(i => i.status === 'zaplaceno').reduce((s, i) => s + Number(i.castka), 0)

  if (loading) {
    return <div style={{ color: '#6b7280', padding: 24 }}>Načítání...</div>
  }

  return (
    <div>
      <h1 style={{ fontSize: 26, fontWeight: 700, marginBottom: 24 }}>Přehled</h1>

      {/* Circle rings */}
      <div style={{
        display: 'grid',
        gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))',
        gap: 24,
        background: '#1a1a1a',
        border: '1px solid #2a2a2a',
        borderRadius: 12,
        padding: 24,
        marginBottom: 24,
      }}>
        <CircleProgress label="Úkoly splněny" value={doneTasks} max={Math.max(tasks.length, 1)} color="#3b82f6" />
        <CircleProgress label="Goaly splněny" value={completedGoals} max={Math.max(goals.length, 1)} color="#8b5cf6" />
        <CircleProgress label="Finance (1M cíl)" value={lifetimeIncome} max={1000000} color="#f59e0b" />
        <CircleProgress label="Dluhy splaceny" value={allMyDebtTotal - myDebtTotal} max={Math.max(allMyDebtTotal, 1)} color="#10b981" />
      </div>

      {/* Quick stats */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: 16, marginBottom: 32 }}>
        {[
          {
            icon: <CheckSquare size={20} color="#3b82f6" />,
            label: 'Otevřené úkoly',
            value: openTasks.length.toString(),
          },
          {
            icon: <Calendar size={20} color="#f59e0b" />,
            label: 'Nejbližší deadline',
            value: nextDeadline ? new Date(nextDeadline.deadline!).toLocaleDateString('cs-CZ') : 'Žádný',
          },
          {
            icon: <TrendingUp size={20} color="#10b981" />,
            label: 'Příjmy tento měsíc',
            value: czk(monthTotal),
          },
          {
            icon: <CreditCard size={20} color="#ef4444" />,
            label: 'Moje dluhy celkem',
            value: czk(myDebtTotal),
          },
        ].map((stat, i) => (
          <div key={i} style={{
            background: '#1a1a1a', border: '1px solid #2a2a2a', borderRadius: 10, padding: '16px 20px',
            display: 'flex', flexDirection: 'column', gap: 8,
          }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              {stat.icon}
              <span style={{ fontSize: 13, color: '#6b7280' }}>{stat.label}</span>
            </div>
            <div style={{ fontSize: 22, fontWeight: 700 }}>{stat.value}</div>
          </div>
        ))}
      </div>

      {/* Goal Roadmap */}
      <h2 style={{ fontSize: 18, fontWeight: 600, marginBottom: 16 }}>Roadmap goalů</h2>
      <GoalRoadmap goals={goals} milestones={milestones} />
    </div>
  )
}
