'use client'
import { useEffect, useMemo, useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { LineChart, Line, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid } from 'recharts'
import { fmtWeight, epley1RM, volume, fmtTonnage, type SetLike } from '@/lib/gym'

type Row = { weight_kg: number | null; reps: number | null; is_warmup: boolean; workouts: { date: string } | null }
type Session = { date: string; label: string; maxW: number; vol: number; sets: SetLike[] }
type Range = '8t' | '6m' | 'vse'

const relLabel = (iso: string) => {
  const d = new Date(iso); const t = new Date(); t.setHours(0, 0, 0, 0)
  const diff = Math.round((t.getTime() - new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime()) / 86400000)
  if (diff === 0) return 'Dnes'
  if (diff === 1) return 'Včera'
  return d.toLocaleDateString('cs-CZ', { day: 'numeric', month: 'numeric' })
}

// Progress chart + stats + set history for one exercise.
export default function ExerciseChart({ exerciseId, exerciseName, muscleGroup }: { exerciseId: string; exerciseName?: string; muscleGroup?: string | null }) {
  const [sessions, setSessions] = useState<Session[]>([])
  const [loading, setLoading] = useState(true)
  const [range, setRange] = useState<Range>('vse')

  useEffect(() => {
    let active = true
    ;(async () => {
      const supabase = createClient()
      const { data: rows } = await supabase
        .from('workout_sets')
        .select('weight_kg, is_warmup, reps, workouts!inner(date)')
        .eq('exercise_id', exerciseId)
      if (!active) return
      const byDate = new Map<string, SetLike[]>()
      for (const r of (rows || []) as Row[]) {
        const d = r.workouts?.date
        if (!d) continue
        const g = byDate.get(d) || []; g.push({ weight_kg: r.weight_kg, reps: r.reps, is_warmup: r.is_warmup }); byDate.set(d, g)
      }
      const arr: Session[] = [...byDate.entries()]
        .sort((a, b) => a[0].localeCompare(b[0]))
        .map(([date, sets]) => {
          const working = sets.filter(s => !s.is_warmup)
          const maxW = working.reduce((m, s) => Math.max(m, Number(s.weight_kg) || 0), 0)
          return { date, label: relLabel(date), maxW, vol: volume(sets), sets: working }
        })
        .filter(s => s.maxW > 0)
      setSessions(arr)
      setLoading(false)
    })()
    return () => { active = false }
  }, [exerciseId])

  const filtered = useMemo(() => {
    if (range === 'vse') return sessions
    const cutoff = Date.now() - (range === '8t' ? 56 : 182) * 86400000
    return sessions.filter(s => new Date(s.date).getTime() >= cutoff)
  }, [sessions, range])

  const stats = useMemo(() => {
    if (!sessions.length) return null
    const all = sessions.flatMap(s => s.sets)
    const oneRM = epley1RM(all)
    const maxW = Math.max(...sessions.map(s => s.maxW))
    const avgVol = sessions.reduce((sum, s) => sum + s.vol, 0) / sessions.length
    // Δ max weight over the last 8 weeks.
    const cutoff = Date.now() - 56 * 86400000
    const recent = sessions.filter(s => new Date(s.date).getTime() >= cutoff)
    const delta8 = recent.length >= 2 ? recent[recent.length - 1].maxW - recent[0].maxW : null
    const bestVolDate = sessions.reduce((b, s) => (s.vol > b.vol ? s : b), sessions[0]).date
    return { oneRM, maxW, avgVol, delta8, bestVolDate }
  }, [sessions])

  if (loading) return <div style={{ color: 'var(--muted)', padding: 12 }}>Načítání…</div>
  if (!sessions.length) return <div style={{ color: 'var(--muted)', padding: 12, fontSize: 14 }}>Zatím žádná data. Zapiš pár sérií a graf naskočí.</div>

  const chartData = filtered.map(s => ({ label: s.label, max: s.maxW }))

  return (
    <div>
      {(exerciseName || muscleGroup) && (
        <div style={{ fontSize: 12, color: 'var(--muted)', marginBottom: 12 }}>
          {muscleGroup ? `${muscleGroup} · ` : ''}{sessions.length} tréninků
        </div>
      )}

      {/* Stat tiles */}
      {stats && (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, minmax(0,1fr))', gap: 8, marginBottom: 14 }}>
          <Tile label="1RM ODHAD" value={stats.oneRM ? `${stats.oneRM} kg` : '—'} />
          <Tile label="MAX VÁHA" value={stats.maxW ? `${fmtWeight(stats.maxW)} kg` : '—'} />
          <Tile label="ZA 8 TÝDNŮ" value={stats.delta8 == null ? '—' : `${stats.delta8 >= 0 ? '+' : ''}${fmtWeight(stats.delta8)} kg`} accent={stats.delta8 != null && stats.delta8 > 0} />
          <Tile label="OBJEM / TRÉNINK" value={stats.avgVol ? fmtTonnage(stats.avgVol) : '—'} />
        </div>
      )}

      {/* Range tabs */}
      <div style={{ display: 'flex', gap: 6, marginBottom: 8 }}>
        {([['8t', '8 týdnů'], ['6m', '6 měsíců'], ['vse', 'Vše']] as const).map(([k, lbl]) => {
          const active = range === k
          return (
            <button key={k} onClick={() => setRange(k)} style={{
              minHeight: 32, padding: '0 12px', borderRadius: 999, fontSize: 12, fontWeight: 600, cursor: 'pointer',
              border: `1px solid ${active ? '#E8192C' : 'var(--border)'}`, background: active ? '#E8192C' : 'transparent', color: active ? '#fff' : 'var(--muted)',
            }}>{lbl}</button>
          )
        })}
      </div>

      <div style={{ fontSize: 11, letterSpacing: 0.5, color: 'var(--muted)', fontWeight: 700, marginBottom: 6 }}>MAX VÁHA V ČASE (KG)</div>
      <div style={{ width: '100%', height: 200 }}>
        <ResponsiveContainer>
          <LineChart data={chartData} margin={{ top: 8, right: 12, bottom: 0, left: -18 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" />
            <XAxis dataKey="label" tick={{ fontSize: 11, fill: 'var(--muted)' }} />
            <YAxis tick={{ fontSize: 11, fill: 'var(--muted)' }} width={40} />
            <Tooltip formatter={(v) => [`${fmtWeight(Number(v))} kg`, 'Max']} labelStyle={{ color: '#111' }} />
            <Line type="monotone" dataKey="max" stroke="#E8192C" strokeWidth={2.5} dot={{ r: 3 }} />
          </LineChart>
        </ResponsiveContainer>
      </div>

      {/* Set history */}
      <div style={{ fontSize: 11, letterSpacing: 0.5, color: 'var(--muted)', fontWeight: 700, margin: '16px 0 8px' }}>HISTORIE SÉRIÍ</div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
        {[...sessions].reverse().slice(0, 8).map(s => (
          <div key={s.date} style={{ display: 'flex', alignItems: 'center', gap: 10, background: 'var(--input-bg)', border: '1px solid var(--border)', borderRadius: 12, padding: '10px 12px' }}>
            <div style={{ minWidth: 62 }}>
              <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--text)' }}>{s.label}</div>
              {stats?.bestVolDate === s.date && <div style={{ fontSize: 10, fontWeight: 700, color: '#E8192C' }}>PR OBJEM</div>}
            </div>
            <div style={{ flex: 1, fontSize: 13, color: 'var(--muted)' }}>
              {s.sets.map(x => `${x.weight_kg == null ? 'vlastní' : fmtWeight(Number(x.weight_kg))} × ${x.reps ?? '?'}`).join(', ')}
            </div>
            <div style={{ fontSize: 12, color: 'var(--muted)', flexShrink: 0 }}>{fmtTonnage(s.vol)}</div>
          </div>
        ))}
      </div>
    </div>
  )
}

function Tile({ label, value, accent }: { label: string; value: string; accent?: boolean }) {
  return (
    <div style={{ background: 'var(--input-bg)', border: '1px solid var(--border)', borderRadius: 12, padding: '10px 12px' }}>
      <div style={{ fontSize: 10, letterSpacing: 0.5, color: 'var(--muted)', fontWeight: 700 }}>{label}</div>
      <div style={{ fontSize: 18, fontWeight: 800, color: accent ? '#10b981' : 'var(--text)', marginTop: 3 }}>{value}</div>
    </div>
  )
}
