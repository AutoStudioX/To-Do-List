import { Zap } from 'lucide-react'

export default function AutoStudioLogo() {
  return (
    <div className="flex items-center gap-3">
      <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-full" style={{ backgroundColor: '#E8192C' }}>
        <Zap className="h-5 w-5" style={{ fill: 'white', stroke: 'white', strokeWidth: 1.5 }} />
      </div>
      <div>
        <p className="text-lg font-bold leading-none" style={{ color: 'var(--text)' }}>
          To-Do <span style={{ color: '#E8192C' }}>List</span>
        </p>
      </div>
    </div>
  )
}
