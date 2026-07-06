'use client'
export default function CircleProgress({ label, value, max, color = '#e53e3e', sublabel, size = 100 }: {
  label: string; value: number; max: number; color?: string; sublabel?: string; size?: number
}) {
  const pct = Math.min(100, Math.round((value / max) * 100))
  const cx = size / 2
  const sw = Math.round(size * 0.067) // strokeWidth scales with size (≈8 at 120px, ≈10 at 150px)
  const r = size / 2 - sw / 2 - 2
  const circ = 2 * Math.PI * r
  const offset = circ - (pct / 100) * circ
  return (
    <div style={{ textAlign: 'center', display: 'flex', flexDirection: 'column', alignItems: 'center', width: '100%' }}>
      <div style={{ position: 'relative', width: size, height: size }}>
        <svg width={size} height={size} style={{ transform: 'rotate(-90deg)' }}>
          <circle cx={cx} cy={cx} r={r} fill="none" stroke="var(--progress-track)" strokeWidth={sw} />
          <circle cx={cx} cy={cx} r={r} fill="none" stroke={color} strokeWidth={sw}
            strokeDasharray={circ} strokeDashoffset={offset}
            strokeLinecap="round" style={{ transition: 'stroke-dashoffset 0.5s ease' }} />
        </svg>
        <div style={{
          position: 'absolute', top: '50%', left: '50%',
          transform: 'translate(-50%, -50%)',
          display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 2,
          width: size * 0.6, textAlign: 'center',
        }}>
          <span style={{ fontSize: Math.round(size * 0.18), fontWeight: 700, color: 'var(--text)', lineHeight: 1 }}>{pct}%</span>
          {sublabel && (
            <span style={{ fontSize: Math.round(size * 0.09), color: 'var(--muted)', lineHeight: 1.2, overflow: 'hidden', display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical' as const, wordBreak: 'break-word' }}>
              {sublabel}
            </span>
          )}
        </div>
      </div>
      <div style={{ marginTop: 8, color: 'var(--muted)', fontSize: 13, maxWidth: size + 20, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{label}</div>
      <div style={{ background: 'var(--progress-track)', borderRadius: 4, height: 6, marginTop: 6, overflow: 'hidden', width: '100%' }}>
        <div style={{ background: color, height: '100%', width: `${pct}%`, borderRadius: 4, transition: 'width 0.5s ease' }} />
      </div>
    </div>
  )
}
