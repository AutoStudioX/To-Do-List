'use client'
import { useEffect, useState } from 'react'
import { createClient } from '@/lib/supabase/client'

type Row = { weight_kg: number | null; is_warmup: boolean; workouts: { date: string } | null }

// Tiny inline sparkline of max working-set weight per session — used in the
// active-workout side panel ("<cvik> · POKROK"). Read-only, no schema change.
export default function ExerciseSparkline({ exerciseId, height = 56 }: { exerciseId: string; height?: number }) {
  const [pts, setPts] = useState<number[]>([])

  useEffect(() => {
    let active = true
    ;(async () => {
      const supabase = createClient()
      const { data } = await supabase
        .from('workout_sets')
        .select('weight_kg, is_warmup, workouts!inner(date)')
        .eq('exercise_id', exerciseId)
      if (!active) return
      const byDate = new Map<string, number>()
      for (const r of (data || []) as Row[]) {
        if (r.is_warmup || r.weight_kg == null) continue
        const d = r.workouts?.date
        if (!d) continue
        byDate.set(d, Math.max(byDate.get(d) ?? 0, Number(r.weight_kg)))
      }
      setPts([...byDate.entries()].sort((a, b) => a[0].localeCompare(b[0])).map(e => e[1]).slice(-12))
    })()
    return () => { active = false }
  }, [exerciseId])

  if (pts.length < 2) {
    return <div style={{ height, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 11, color: 'var(--muted)' }}>Zatím málo dat</div>
  }

  const w = 100, h = 100
  const min = Math.min(...pts), max = Math.max(...pts)
  const span = max - min || 1
  const coords = pts.map((v, i) => [(i / (pts.length - 1)) * w, h - ((v - min) / span) * h * 0.85 - h * 0.075])
  const line = coords.map(([x, y], i) => `${i ? 'L' : 'M'}${x.toFixed(1)},${y.toFixed(1)}`).join(' ')
  const area = `${line} L${w},${h} L0,${h} Z`
  const lastPt = coords[coords.length - 1]

  return (
    <svg viewBox={`0 0 ${w} ${h}`} preserveAspectRatio="none" style={{ width: '100%', height, display: 'block' }}>
      <path d={area} fill="rgba(232,25,44,0.16)" />
      <path d={line} fill="none" stroke="#E8192C" strokeWidth={2.5} vectorEffect="non-scaling-stroke" strokeLinejoin="round" strokeLinecap="round" />
      <circle cx={lastPt[0]} cy={lastPt[1]} r={2.5} fill="#E8192C" vectorEffect="non-scaling-stroke" />
    </svg>
  )
}
