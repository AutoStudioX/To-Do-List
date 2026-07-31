'use client'
import { useEffect, useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { LineChart, Line, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid } from 'recharts'
import { fmtWeight } from '@/lib/gym'

// Max working-set weight per workout date for one exercise.
export default function ExerciseChart({ exerciseId }: { exerciseId: string }) {
  const [data, setData] = useState<{ date: string; max: number }[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    let active = true
    ;(async () => {
      const supabase = createClient()
      const { data: rows } = await supabase
        .from('workout_sets')
        .select('weight_kg, is_warmup, workouts!inner(date)')
        .eq('exercise_id', exerciseId)
      if (!active) return
      const byDate = new Map<string, number>()
      for (const r of (rows || []) as { weight_kg: number | null; is_warmup: boolean; workouts: { date: string } }[]) {
        if (r.is_warmup || r.weight_kg == null) continue
        const d = r.workouts?.date
        if (!d) continue
        byDate.set(d, Math.max(byDate.get(d) ?? 0, Number(r.weight_kg)))
      }
      const arr = Array.from(byDate.entries())
        .sort((a, b) => a[0].localeCompare(b[0]))
        .map(([date, max]) => ({ date: new Date(date).toLocaleDateString('cs-CZ', { day: 'numeric', month: 'numeric' }), max }))
      setData(arr)
      setLoading(false)
    })()
    return () => { active = false }
  }, [exerciseId])

  if (loading) return <div style={{ color: 'var(--muted)', padding: 12 }}>Načítání…</div>
  if (data.length === 0) return <div style={{ color: 'var(--muted)', padding: 12, fontSize: 14 }}>Zatím žádná data. Zapiš pár sérií a graf naskočí.</div>

  return (
    <div>
      <div style={{ fontSize: 12, color: 'var(--muted)', marginBottom: 8 }}>Maximální váha v čase (kg)</div>
      <div style={{ width: '100%', height: 220 }}>
        <ResponsiveContainer>
          <LineChart data={data} margin={{ top: 8, right: 12, bottom: 0, left: -18 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" />
            <XAxis dataKey="date" tick={{ fontSize: 11, fill: 'var(--muted)' }} />
            <YAxis tick={{ fontSize: 11, fill: 'var(--muted)' }} width={40} />
            <Tooltip formatter={(v) => [`${fmtWeight(Number(v))} kg`, 'Max']} labelStyle={{ color: '#111' }} />
            <Line type="monotone" dataKey="max" stroke="#e53e3e" strokeWidth={2.5} dot={{ r: 3 }} />
          </LineChart>
        </ResponsiveContainer>
      </div>
    </div>
  )
}
