'use client'
import { useCallback, useEffect, useMemo, useState } from 'react'
import { useParams, useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import type { Exercise } from '@/lib/types'
import { ComposedChart, Bar, Line, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid } from 'recharts'
import { fmtWeight, epley1RM, volume, fmtTonnage, type SetLike } from '@/lib/gym'
import { ChevronLeft } from 'lucide-react'

type Row = { weight_kg: number | null; reps: number | null; is_warmup: boolean; workouts: { date: string } | null }
type Session = { date: string; label: string; maxW: number; vol: number; sets: SetLike[] }
type Range = '8t' | '6m' | 'vse'

const RANGES: [Range, string][] = [['8t', '8 týdnů'], ['6m', '6 měsíců'], ['vse', 'Vše']]

const relLabel = (iso: string) => {
  const d = new Date(iso); const t = new Date(); t.setHours(0, 0, 0, 0)
  const diff = Math.round((t.getTime() - new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime()) / 86400000)
  if (diff === 0) return 'Dnes'
  if (diff === 1) return 'Včera'
  return d.toLocaleDateString('cs-CZ', { day: 'numeric', month: 'numeric' })
}

export default function ExerciseDetailPage() {
  const router = useRouter()
  const { id } = useParams<{ id: string }>()
  const [exercise, setExercise] = useState<Exercise | null>(null)
  const [sessions, setSessions] = useState<Session[]>([])
  const [loading, setLoading] = useState(true)
  const [range, setRange] = useState<Range>('vse')
  const [showAll, setShowAll] = useState(false)
  const [isMobile, setIsMobile] = useState(false)

  useEffect(() => {
    const check = () => setIsMobile(window.innerWidth <= 768)
    check()
    window.addEventListener('resize', check)
    return () => window.removeEventListener('resize', check)
  }, [])

  const load = useCallback(async () => {
    const supabase = createClient()
    const [{ data: ex }, { data: rows }] = await Promise.all([
      supabase.from('exercises').select('*').eq('id', id).single(),
      supabase.from('workout_sets').select('weight_kg, reps, is_warmup, workouts!inner(date)').eq('exercise_id', id),
    ])
    setExercise((ex as Exercise) ?? null)
    const byDate = new Map<string, SetLike[]>()
    for (const r of (rows || []) as Row[]) {
      const d = r.workouts?.date
      if (!d) continue
      const g = byDate.get(d) || []; g.push({ weight_kg: r.weight_kg, reps: r.reps, is_warmup: r.is_warmup }); byDate.set(d, g)
    }
    setSessions([...byDate.entries()]
      .sort((a, b) => a[0].localeCompare(b[0]))
      .map(([date, sets]) => {
        const working = sets.filter(s => !s.is_warmup)
        return { date, label: relLabel(date), maxW: working.reduce((m, s) => Math.max(m, Number(s.weight_kg) || 0), 0), vol: volume(sets), sets: working }
      })
      .filter(s => s.sets.length > 0))
    setLoading(false)
  }, [id])

  useEffect(() => { load() }, [load])

  const filtered = useMemo(() => {
    if (range === 'vse') return sessions
    const cutoff = Date.now() - (range === '8t' ? 56 : 182) * 86400000
    return sessions.filter(s => new Date(s.date).getTime() >= cutoff)
  }, [sessions, range])

  const stats = useMemo(() => {
    if (!sessions.length) return null
    const all = sessions.flatMap(s => s.sets)
    const maxW = Math.max(...sessions.map(s => s.maxW))
    const avgVol = sessions.reduce((sum, s) => sum + s.vol, 0) / sessions.length
    const cutoff = Date.now() - 56 * 86400000
    const recent = sessions.filter(s => new Date(s.date).getTime() >= cutoff)
    const delta8 = recent.length >= 2 ? recent[recent.length - 1].maxW - recent[0].maxW : null
    const bestVolDate = sessions.reduce((b, s) => (s.vol > b.vol ? s : b), sessions[0]).date
    return { oneRM: epley1RM(all), maxW, avgVol, delta8, bestVolDate }
  }, [sessions])

  if (loading) return <div style={{ color: 'var(--muted)', padding: 24 }}>Načítání…</div>
  if (!exercise) return <div style={{ color: 'var(--muted)', padding: 24 }}>Cvik nenalezen.</div>

  const chartData = filtered.map(s => ({ label: s.label, max: s.maxW, vol: s.vol }))
  const historyDesc = [...sessions].reverse()
  const shown = showAll ? historyDesc : historyDesc.slice(0, 4)

  const tiles = stats && (
    <div style={{ display: 'grid', gridTemplateColumns: isMobile ? 'repeat(2, minmax(0,1fr))' : 'repeat(4, minmax(0,1fr))', gap: 12 }}>
      {[
        { label: '1RM EST.', value: stats.oneRM ? String(stats.oneRM) : '—', unit: stats.oneRM ? 'kg' : '', accent: false },
        { label: 'MAX VÁHA', value: stats.maxW ? fmtWeight(stats.maxW) : '—', unit: stats.maxW ? 'kg' : '', accent: false },
        { label: 'ZA 8 TÝDNŮ', value: stats.delta8 == null ? '—' : `${stats.delta8 >= 0 ? '+' : ''}${fmtWeight(stats.delta8)}`, unit: stats.delta8 == null ? '' : 'kg', accent: stats.delta8 != null && stats.delta8 > 0 },
        { label: 'OBJEM / TRÉNINK', value: stats.avgVol ? fmtTonnage(stats.avgVol).replace(/\s*(t|kg)$/, '') : '—', unit: stats.avgVol ? (stats.avgVol >= 1000 ? 't' : 'kg') : '', accent: false },
      ].map(t => (
        <div key={t.label} style={{ background: 'var(--card)', border: '1px solid var(--border)', borderRadius: 16, padding: '14px 16px', boxShadow: 'var(--shadow)', minWidth: 0 }}>
          <div style={{ fontSize: 11, fontWeight: 800, letterSpacing: 0.6, color: 'var(--muted)' }}>{t.label}</div>
          <div style={{ fontSize: isMobile ? 24 : 30, fontWeight: 800, color: t.accent ? '#10b981' : 'var(--text)', lineHeight: 1.15, marginTop: 4, overflow: 'hidden', textOverflow: 'ellipsis' }}>
            {t.value}{t.unit && <span style={{ fontSize: isMobile ? 13 : 15, fontWeight: 700, marginLeft: 3, color: 'var(--muted)' }}>{t.unit}</span>}
          </div>
        </div>
      ))}
    </div>
  )

  const chartCard = (
    <div style={{ background: 'var(--card)', border: '1px solid var(--border)', borderRadius: 20, padding: 16, boxShadow: 'var(--shadow)' }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, marginBottom: 10, flexWrap: 'wrap' }}>
        <div style={{ fontSize: 11, fontWeight: 800, letterSpacing: 0.6, color: 'var(--muted)' }}>MAX VÁHA V ČASE</div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
          <span style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12, color: 'var(--muted)' }}>
            <span style={{ width: 16, height: 3, borderRadius: 2, background: '#E8192C' }} /> max váha (kg)
          </span>
          <span style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12, color: 'var(--muted)' }}>
            <span style={{ width: 10, height: 10, borderRadius: 2, background: 'var(--muted)', opacity: 0.35 }} /> objem
          </span>
        </div>
      </div>
      {chartData.length === 0 ? (
        <div style={{ height: isMobile ? 220 : 320, display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--muted)', fontSize: 14 }}>V tomto období žádná data.</div>
      ) : (
        <div style={{ width: '100%', height: isMobile ? 240 : 340 }}>
          <ResponsiveContainer>
            <ComposedChart data={chartData} margin={{ top: 10, right: 8, bottom: 0, left: -8 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" vertical={false} />
              <XAxis dataKey="label" tick={{ fontSize: 11, fill: 'var(--muted)' }} axisLine={false} tickLine={false} />
              <YAxis yAxisId="w" tick={{ fontSize: 11, fill: 'var(--muted)' }} width={40} axisLine={false} tickLine={false} domain={[(min: number) => Math.floor(min - 6), (max: number) => Math.ceil(max + 4)]} />
              <YAxis yAxisId="v" orientation="right" hide domain={[0, (d: number) => d * 2.4]} />
              <Tooltip
                contentStyle={{ background: 'var(--card)', border: '1px solid var(--border)', borderRadius: 10, fontSize: 12 }}
                labelStyle={{ color: 'var(--text)', fontWeight: 700 }}
                formatter={(v, name) => name === 'vol' ? [fmtTonnage(Number(v)), 'Objem'] : [`${fmtWeight(Number(v))} kg`, 'Max váha']}
              />
              <Bar yAxisId="v" dataKey="vol" fill="var(--muted)" fillOpacity={0.22} radius={[4, 4, 0, 0]} maxBarSize={38} isAnimationActive={false} />
              <Line yAxisId="w" type="monotone" dataKey="max" stroke="#E8192C" strokeWidth={2.5} isAnimationActive={false}
                dot={(p) => {
                  const last = p.index === chartData.length - 1
                  return <circle key={p.index} cx={p.cx} cy={p.cy} r={last ? 6 : 4} fill="#E8192C" stroke="var(--card)" strokeWidth={last ? 2 : 0} />
                }}
                activeDot={{ r: 6 }} />
            </ComposedChart>
          </ResponsiveContainer>
        </div>
      )}
    </div>
  )

  const history = (
    <div>
      <div style={{ fontSize: 12, fontWeight: 800, letterSpacing: 0.8, color: 'var(--muted)', marginBottom: 10 }}>HISTORIE SÉRIÍ</div>
      {shown.length === 0 ? (
        <div style={{ background: 'var(--card)', border: '1px solid var(--border)', borderRadius: 16, padding: 20, textAlign: 'center', color: 'var(--muted)', fontSize: 14 }}>Zatím žádná data. Zapiš pár sérií a naskočí to tady.</div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          {shown.map(s => {
            const isPR = stats?.bestVolDate === s.date
            const isToday = s.label === 'Dnes' // current session gets the green frame
            return (
              <div key={s.date} style={{ background: 'var(--card)', border: `1px solid ${isToday ? 'rgba(16,185,129,0.45)' : 'var(--border)'}`, borderRadius: 16, padding: 14, boxShadow: 'var(--shadow)' }}>
                <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', gap: 10, marginBottom: 10 }}>
                  <span style={{ fontSize: 15, fontWeight: 700, color: 'var(--text)' }}>{s.label}</span>
                  {isPR
                    ? <span style={{ fontSize: 11, fontWeight: 800, letterSpacing: 0.4, color: '#10b981' }}>PR OBJEM</span>
                    : <span style={{ fontSize: 12, color: 'var(--muted)' }}>{fmtTonnage(s.vol)}</span>}
                </div>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                  {s.sets.map((x, i) => (
                    <span key={i} style={{ fontSize: 14, color: 'var(--text)', background: 'var(--input-bg)', borderRadius: 8, padding: '5px 10px' }}>
                      {x.weight_kg == null ? 'vlastní' : fmtWeight(Number(x.weight_kg))} × {x.reps ?? '?'}
                    </span>
                  ))}
                </div>
              </div>
            )
          })}
        </div>
      )}
      {historyDesc.length > 4 && !showAll && (
        <button onClick={() => setShowAll(true)} style={{ marginTop: 10, width: '100%', minHeight: 48, background: 'transparent', border: '1px solid var(--border)', borderRadius: 16, color: 'var(--text)', fontSize: 14, fontWeight: 600, cursor: 'pointer', touchAction: 'manipulation' }}>
          Zobrazit všech {historyDesc.length} tréninků
        </button>
      )}
    </div>
  )

  return (
    <div style={{ maxWidth: 1440, margin: '0 auto', paddingBottom: 24 }}>
      {/* Header — on mobile the range pills drop to their own full-width row */}
      <div style={{ display: 'flex', flexDirection: isMobile ? 'column' : 'row', alignItems: isMobile ? 'stretch' : 'center', gap: isMobile ? 12 : 12, marginBottom: 18 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, minWidth: 0, flex: 1 }}>
          <button onClick={() => router.back()} aria-label="Zpět" style={{ minWidth: 44, minHeight: 44, display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'var(--card)', border: '1px solid var(--border)', borderRadius: 12, color: 'var(--text)', cursor: 'pointer', flexShrink: 0 }}><ChevronLeft size={22} /></button>
          <div style={{ minWidth: 0 }}>
            <h1 style={{ fontSize: isMobile ? 22 : 26, fontWeight: 800, color: 'var(--text)', margin: 0, lineHeight: 1.15, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{exercise.name}</h1>
            <div style={{ fontSize: 13, color: 'var(--muted)', marginTop: 2, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
              {[exercise.muscle_group, sessions.length ? `${sessions.length} tréninků` : null].filter(Boolean).join(' · ') || '—'}
            </div>
          </div>
        </div>
        <div style={{ display: 'flex', gap: 6, flexShrink: 0 }}>
          {RANGES.map(([k, lbl]) => {
            const isActive = range === k
            return (
              <button key={k} onClick={() => setRange(k)} style={{
                flex: isMobile ? 1 : undefined, minHeight: 44, padding: '0 14px', borderRadius: 999, fontSize: 13, fontWeight: 600, cursor: 'pointer', touchAction: 'manipulation',
                border: `1px solid ${isActive ? '#E8192C' : 'var(--border)'}`, background: isActive ? '#E8192C' : 'transparent', color: isActive ? '#fff' : 'var(--muted)',
              }}>{lbl}</button>
            )
          })}
        </div>
      </div>

      {isMobile ? (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
          {tiles}
          {chartCard}
          {history}
        </div>
      ) : (
        <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0,1fr) 400px', gap: 24, alignItems: 'start' }}>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
            {tiles}
            {chartCard}
          </div>
          {history}
        </div>
      )}
    </div>
  )
}
