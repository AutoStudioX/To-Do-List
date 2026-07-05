'use client'
import { usePathname, useRouter } from 'next/navigation'
import Link from 'next/link'
import { LayoutDashboard, CheckSquare, Target, TrendingUp, Calendar, CreditCard, LogOut } from 'lucide-react'
import { createClient } from '@/lib/supabase/client'

const navItems = [
  { href: '/prehled', label: 'Přehled', icon: LayoutDashboard },
  { href: '/ukoly', label: 'Úkoly', icon: CheckSquare },
  { href: '/goaly', label: 'Goaly', icon: Target },
  { href: '/finance', label: 'Finance', icon: TrendingUp },
  { href: '/casovy-plan', label: 'Časový plán', icon: Calendar },
  { href: '/dluhy', label: 'Dluhy', icon: CreditCard },
]

export default function Sidebar() {
  const pathname = usePathname()
  const router = useRouter()
  const supabase = createClient()

  async function handleLogout() {
    await supabase.auth.signOut()
    router.push('/login')
    router.refresh()
  }

  return (
    <div style={{
      width: 220,
      background: '#1a1a1a',
      borderRight: '1px solid #2a2a2a',
      height: '100vh',
      display: 'flex',
      flexDirection: 'column',
      flexShrink: 0,
    }}>
      <div style={{ padding: '24px 16px 16px', borderBottom: '1px solid #2a2a2a' }}>
        <div style={{ fontSize: 18, fontWeight: 700, color: '#ffffff' }}>Dashboard</div>
        <div style={{ fontSize: 12, color: '#6b7280', marginTop: 2 }}>Osobní přehled</div>
      </div>

      <nav style={{ flex: 1, padding: '12px 8px', display: 'flex', flexDirection: 'column', gap: 4 }}>
        {navItems.map(({ href, label, icon: Icon }) => {
          const isActive = pathname === href || pathname.startsWith(href + '/')
          return (
            <Link key={href} href={href} style={{
              display: 'flex',
              alignItems: 'center',
              gap: 10,
              padding: '10px 12px',
              borderRadius: 8,
              textDecoration: 'none',
              fontSize: 14,
              fontWeight: isActive ? 600 : 400,
              color: isActive ? '#ffffff' : '#9ca3af',
              background: isActive ? '#3b82f6' : 'transparent',
              transition: 'background 0.15s, color 0.15s',
            }}
              onMouseEnter={e => { if (!isActive) (e.currentTarget as HTMLElement).style.background = '#2a2a2a' }}
              onMouseLeave={e => { if (!isActive) (e.currentTarget as HTMLElement).style.background = 'transparent' }}
            >
              <Icon size={16} />
              {label}
            </Link>
          )
        })}
      </nav>

      <div style={{ padding: '12px 8px', borderTop: '1px solid #2a2a2a' }}>
        <button onClick={handleLogout} style={{
          display: 'flex',
          alignItems: 'center',
          gap: 10,
          padding: '10px 12px',
          borderRadius: 8,
          border: 'none',
          background: 'transparent',
          color: '#6b7280',
          fontSize: 14,
          cursor: 'pointer',
          width: '100%',
          transition: 'background 0.15s, color 0.15s',
        }}
          onMouseEnter={e => { (e.currentTarget as HTMLElement).style.background = '#2a2a2a'; (e.currentTarget as HTMLElement).style.color = '#ef4444' }}
          onMouseLeave={e => { (e.currentTarget as HTMLElement).style.background = 'transparent'; (e.currentTarget as HTMLElement).style.color = '#6b7280' }}
        >
          <LogOut size={16} />
          Odhlásit se
        </button>
      </div>
    </div>
  )
}
