'use client'
import { useEffect, useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import CircleProgress from '@/components/CircleProgress'
import GoalRoadmap from '@/components/GoalRoadmap'
import { Task, Goal, Milestone, Transaction } from '@/lib/types'
import { CheckSquare, Calendar, TrendingUp, CreditCard } from 'lucide-react'

const czk = (n: number) => new Intl.NumberFormat('cs-CZ', { style: 'currency', currency: 'CZK', maximumFractionDigits: 0 }).format(n)

export default function PrehledPage() {
  const [tasks, setTasks] = useState<Task[]>([])
  const [goals, setGoals] = useState<Goal[]>([])
  const [milestones, setMilestones] = useState<Milestone[]>([])
  const [transactions, setTransactions] = useState<Transaction[]>([])
  const [loading, setLoading] = useState(false)

  useEffect(() => {
    const supabase = createClient()
    async function load() {
      try {
        const { data: { session } } = await supabase.auth.getSession()
        const user = session?.user
        if (!user) return

        const [tasksRes, goalsRes, milestonesRes, trRes] = await Promise.all([
          supabase.from('ukoly').select('*').eq('user_id', user.id),
          supabase.from('goaly').select('*').eq('user_id', user.id),
          supabase.from('milniky').select('*').eq('user_id', user.id),
          supabase.from('transakce').select('*').eq('user_id', user.id),
        ])

        setTasks(tasksRes.data || [])
        setGoals(goalsRes.data || [])
        setMilestones(milestonesRes.data || [])
        setTransactions(trRes.data || [])
      } catch {
        // network or auth error — show empty state
      } finally {
        setLoading(false)
      }
    }
    load()
  }, [])

  const doneTasks = tasks.filter(t => t.status === 'Done').length
  const completedGoals = goals.filter(g => g.status === 'completed').length

  const now = new Date()
  const monthStart = new Date(now.getFullYear(), now.getMonth(), 1)

  const prijmy = transactions.filter(t => t.typ === 'prijem')
  const dluhyTx = transactions.filter(t => t.typ === 'dluh')

  const monthTotal = prijmy.filter(i => i.status === 'zaplaceno' && i.datum && new Date(i.datum) >= monthStart).reduce((s, i) => s + Number(i.castka), 0)
  const lifetimeIncome = prijmy.filter(i => i.status === 'zaplaceno').reduce((s, i) => s + Number(i.castka), 0)

  const myDebtTotal = dluhyTx.filter(d => d.smer === 'moje' && d.status === 'nesplaceno').reduce((s, d) => s + Number(d.castka), 0)
  const allMyDebtTotal = dluhyTx.filter(d => d.smer === 'moje').reduce((s, d) => s + Number(d.castka), 0)
  const paidDebtTotal = allMyDebtTotal - myDebtTotal

  const openTasks = tasks.filter(t => t.status !== 'Done')
  const nextDeadline = openTasks
    .filter(t => t.deadline)
    .sort((a, b) => new Date(a.deadline!).getTime() - new Date(b.deadline!).getTime())[0]

  if (loading) {
    return <div style={{ color: 'var(--muted)', padding: 24 }}>Načítání...</div>
  }

  return (
    <div>
      <h1 style={{ fontSize: 26, fontWeight: 700, marginBottom: 24, color: 'var(--text)' }}>Přehled</h1>

      {/* Circle rings */}
      <div style={{
        display: 'grid',
        gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))',
        gap: 24,
        background: 'var(--card)',
        border: '1px solid var(--border)',
        borderRadius: 12,
        padding: 24,
        marginBottom: 24,
        boxShadow: 'var(--shadow)',
      }}>
        <CircleProgress label="Úkoly splněny" value={doneTasks} max={Math.max(tasks.length, 1)} color="#e53e3e" />
        <CircleProgress label="Goaly splněny" value={completedGoals} max={Math.max(goals.length, 1)} color="#8b5cf6" />
        <CircleProgress label="Finance (1M cíl)" value={lifetimeIncome} max={1000000} color="#f59e0b" />
        <CircleProgress label="Dluhy splaceny" value={paidDebtTotal} max={Math.max(allMyDebtTotal, 1)} color="#10b981" />
      </div>

      {/* Quick stats */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: 16, marginBottom: 32 }}>
        {[
          { icon: <CheckSquare size={20} color="#e53e3e" />, label: 'Otevřené úkoly', value: openTasks.length.toString() },
          { icon: <Calendar size={20} color="#f59e0b" />, label: 'Nejbližší deadline', value: nextDeadline ? new Date(nextDeadline.deadline!).toLocaleDateString('cs-CZ') : 'Žádný' },
          { icon: <TrendingUp size={20} color="#10b981" />, label: 'Příjmy tento měsíc', value: czk(monthTotal) },
          { icon: <CreditCard size={20} color="#e53e3e" />, label: 'Moje dluhy celkem', value: czk(myDebtTotal) },
        ].map((stat, i) => (
          <div key={i} style={{
            background: 'var(--card)', border: '1px solid var(--border)', borderRadius: 10, padding: '16px 20px',
            display: 'flex', flexDirection: 'column', gap: 8, boxShadow: 'var(--shadow)',
          }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              {stat.icon}
              <span style={{ fontSize: 13, color: 'var(--muted)' }}>{stat.label}</span>
            </div>
            <div style={{ fontSize: 22, fontWeight: 700, color: 'var(--text)' }}>{stat.value}</div>
          </div>
        ))}
      </div>

      {/* Goal Roadmap */}
      <h2 style={{ fontSize: 18, fontWeight: 600, marginBottom: 16, color: 'var(--text)' }}>Roadmap goalů</h2>
      <GoalRoadmap goals={goals} milestones={milestones} />
    </div>
  )
}
