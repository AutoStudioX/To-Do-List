import { Zap } from 'lucide-react'
import LoginForm from './LoginForm'

export default function LoginPage() {
  return (
    <div className="flex min-h-screen flex-col" style={{ background: '#ffffff' }}>

      <div className="flex flex-1 flex-col items-center justify-center gap-8 p-4" style={{ paddingBottom: '20vh' }}>
        <div className="text-center">
          <p className="text-3xl font-bold tracking-tight" style={{ color: '#0a0a0a', fontFamily: 'system-ui, sans-serif' }}>
            To-Do{' '}
            <span style={{ color: '#E8192C' }}>List</span>
          </p>
          <p className="mt-1 text-sm" style={{ color: '#6b6b6b' }}>Přihlaste se pro přístup k aplikaci</p>
        </div>

        {/* Card */}
        <div className="w-full max-w-sm overflow-hidden" style={{
          borderRadius: 28,
          background: '#ffffff',
          boxShadow: '0 1px 2px 0 rgba(0,0,0,0.05)',
          outline: '1px solid rgba(0,0,0,0.06)',
        }}>
          {/* CardHeader */}
          <div className="px-4 pt-4 pb-2">
            <p className="text-sm font-medium" style={{ color: '#6b6b6b' }}>Přihlášení</p>
          </div>
          {/* CardContent */}
          <div className="px-4 pb-4">
            <LoginForm />
          </div>
        </div>

        {/* Powered by AutoStudio */}
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
      </div>
    </div>
  )
}
