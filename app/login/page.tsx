import LoginForm from './LoginForm'
import { Zap } from 'lucide-react'
import { headers } from 'next/headers'
import { createClient } from '@/lib/supabase/server'

const LOCKED_MSG = 'Příliš mnoho pokusů, zkuste to za 15 minut'
const IP_BLOCKED_MSG = 'Přístup z této sítě byl zablokován. Kontaktujte správce.'

export default async function LoginPage() {
  // Server-side lock check on page load — keyed on the request IP, so a fresh
  // window / incognito tab on the same network also gets the disabled form.
  const h = await headers()
  const ip = (h.get('x-forwarded-for')?.split(',')[0].trim() || h.get('x-real-ip')?.trim() || 'unknown')
  let initialLocked = false
  let initialMessage = ''
  try {
    const supabase = await createClient()
    const { data } = await supabase.rpc('check_lock_state', { p_ip: ip })
    if (data?.locked) {
      initialLocked = true
      initialMessage = data.ip_blocked ? IP_BLOCKED_MSG : LOCKED_MSG
    }
  } catch {
    // If the RPC isn't available, fail open (form usable); the server action still enforces.
  }

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
            <LoginForm initialLocked={initialLocked} initialMessage={initialMessage} />
          </div>
        </div>

        {/* powered by AutoStudio — fixed colors (login bg is always white, so no theme vars) */}
        <div className="flex items-center gap-3">
          <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-full" style={{ backgroundColor: '#e53e3e' }}>
            <Zap className="h-5 w-5" style={{ fill: 'white', stroke: 'white', strokeWidth: 1.5 }} />
          </div>
          <div>
            <p className="text-xs leading-tight" style={{ color: '#6b6b6b' }}>powered by</p>
            <p className="text-lg font-bold leading-none">
              <span style={{ color: '#0a0a0a' }}>Auto</span><span style={{ color: '#e53e3e' }}>Studio</span>
            </p>
          </div>
        </div>
      </div>
    </div>
  )
}
