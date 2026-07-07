import LoginForm from './LoginForm'
import AutoStudioLogo from '@/components/AutoStudioLogo'

export default function LoginPage() {
  return (
    <div className="flex min-h-screen flex-col" style={{ background: '#ffffff' }}>

      <div className="flex flex-1 flex-col items-center justify-center gap-8 p-4">
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
          <div className="px-4 pt-4 pb-5">
            <p className="text-sm font-medium" style={{ color: '#6b6b6b' }}>Přihlášení</p>
          </div>
          {/* CardContent */}
          <div className="px-4 pb-4">
            <LoginForm />
          </div>
        </div>

        <AutoStudioLogo />
      </div>
    </div>
  )
}
