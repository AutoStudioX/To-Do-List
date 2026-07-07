import { Zap } from 'lucide-react'

export default function AutoStudioLogo() {
  return (
    <div className="flex items-center gap-3">
      <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-full" style={{ backgroundColor: '#e53e3e' }}>
        <Zap className="h-5 w-5" style={{ fill: 'white', stroke: 'white', strokeWidth: 1.5 }} />
      </div>
      <div>
        <p className="text-xs leading-none mb-0.5" style={{ color: '#9ca3af' }}>powered by</p>
        <p className="text-lg font-bold leading-none" style={{ color: '#111111' }}>
          Auto<span style={{ color: '#e53e3e' }}>Studio</span>
        </p>
      </div>
    </div>
  )
}
