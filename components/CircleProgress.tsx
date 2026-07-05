'use client'
export default function CircleProgress({ label, value, max, color = '#3b82f6', unit = '%' }: {
  label: string; value: number; max: number; color?: string; unit?: string
}) {
  const pct = Math.min(100, Math.round((value / max) * 100))
  const r = 52
  const circ = 2 * Math.PI * r
  const offset = circ - (pct / 100) * circ
  return (
    <div style={{ textAlign: 'center' }}>
      <div style={{ position: 'relative', width: 120, height: 120, margin: '0 auto' }}>
        <svg width={120} height={120} style={{ transform: 'rotate(-90deg)' }}>
          <circle cx={60} cy={60} r={r} fill="none" stroke="#2a2a2a" strokeWidth={8} />
          <circle cx={60} cy={60} r={r} fill="none" stroke={color} strokeWidth={8}
            strokeDasharray={circ} strokeDashoffset={offset}
            strokeLinecap="round" style={{ transition: 'stroke-dashoffset 0.5s ease' }} />
        </svg>
        <div style={{
          position: 'absolute', top: '50%', left: '50%',
          transform: 'translate(-50%, -50%)',
          fontSize: 18, fontWeight: 700, color: '#ffffff'
        }}>
          {pct}%
        </div>
      </div>
      <div style={{ marginTop: 8, color: '#6b7280', fontSize: 13 }}>{label}</div>
      <div style={{ background: '#2a2a2a', borderRadius: 4, height: 6, marginTop: 6, overflow: 'hidden' }}>
        <div style={{ background: color, height: '100%', width: `${pct}%`, borderRadius: 4, transition: 'width 0.5s ease' }} />
      </div>
    </div>
  )
}
