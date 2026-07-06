'use client'
export default function CircleProgress({ label, value, max, color = '#e53e3e', sublabel, size = 100 }: {
  label: string; value: number; max: number; color?: string; sublabel?: string; size?: number
}) {
  const pct = Math.min(100, Math.round((value / max) * 100))
  const cx = size / 2
  const r = size / 2 - 7
  const circ = 2 * Math.PI * r
  const offset = circ - (pct / 100) * circ
  return (
    <div style={{ textAlign: 'center', display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
      <div style={{ position: 'relative', width: size, height: size }}>
        <svg width={size} height={size} style={{ transform: 'rotate(-90deg)' }}>
          <circle cx={cx} cy={cx} r={r} fill="none" stroke="var(--progress-track)" strokeWidth={7} />
          <circle cx={cx} cy={cx} r={r} fill="none" stroke={color} strokeWidth={7}
            strokeDasharray={circ} strokeDashoffset={offset}
            strokeLinecap="round" style={{ transition: 'stroke-dashoffset 0.5s ease' }} />
        </svg>
        <div style={{
          position: 'absolute', top: '50%', left: '50%',
          transform: 'translate(-50%, -50%)',
          display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 1,
          width: size * 0.65, textAlign: 'center',
        }}>
          <span style={{ fontSize: size * 0.16, fontWeight: 700, color: 'var(--text)', lineHeight: 1 }}>{pct}%</span>
          {sublabel && (
            <span style={{ fontSize: size * 0.1, color: 'var(--muted)', lineHeight: 1.2, overflow: 'hidden', display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical' as const, wordBreak: 'break-word' }}>
              {sublabel}
            </span>
          )}
        </div>
      </div>
      <div style={{ marginTop: 6, color: 'var(--muted)', fontSize: 12, maxWidth: size + 20, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{label}</div>
      <div style={{ background: 'var(--progress-track)', borderRadius: 4, height: 4, marginTop: 5, overflow: 'hidden', width: size }}>
        <div style={{ background: color, height: '100%', width: `${pct}%`, borderRadius: 4, transition: 'width 0.5s ease' }} />
      </div>
    </div>
  )
}
