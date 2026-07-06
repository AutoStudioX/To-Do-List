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
      background: 'var(--sidebar-bg)',
      borderRight: '1px solid var(--sidebar-border)',
      height: '100vh',
      display: 'flex',
      flexDirection: 'column',
      flexShrink: 0,
    }}>
      {/* AutoStudio brand */}
      <div style={{ padding: '20px 16px 16px', borderBottom: '1px solid var(--border)' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <div style={{
            width: 34, height: 34, borderRadius: 8,
            background: '#e53e3e',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            fontSize: 15, fontWeight: 800, color: 'white', flexShrink: 0,
            letterSpacing: '-0.5px',
          }}>A</div>
          <div>
            <div style={{ fontSize: 15, fontWeight: 700, color: 'var(--text)', lineHeight: 1.2 }}>AutoStudio</div>
            <div style={{ fontSize: 11, color: 'var(--muted)', marginTop: 1 }}>Dashboard</div>
          </div>
        </div>
      </div>

      <nav style={{ flex: 1, padding: '12px 8px', display: 'flex', flexDirection: 'column', gap: 2 }}>
        {navItems.map(({ href, label, icon: Icon }) => {
          const isActive = pathname === href || pathname.startsWith(href + '/')
          return (
            <Link key={href} href={href} style={{
              display: 'flex',
              alignItems: 'center',
              gap: 10,
              padding: '9px 12px',
              borderRadius: 8,
              textDecoration: 'none',
              fontSize: 14,
              fontWeight: isActive ? 600 : 400,
              color: isActive ? 'var(--nav-active-text)' : 'var(--muted)',
              background: isActive ? 'var(--nav-active-bg)' : 'transparent',
              transition: 'background 0.15s, color 0.15s',
            }}
              onMouseEnter={e => {
                if (!isActive) {
                  (e.currentTarget as HTMLElement).style.background = 'var(--nav-hover)'
                  ;(e.currentTarget as HTMLElement).style.color = 'var(--text)'
                }
              }}
              onMouseLeave={e => {
                if (!isActive) {
                  (e.currentTarget as HTMLElement).style.background = 'transparent'
                  ;(e.currentTarget as HTMLElement).style.color = 'var(--muted)'
                }
              }}
            >
              <Icon size={16} />
              {label}
            </Link>
          )
        })}
      </nav>

      <div style={{ padding: '12px 8px', borderTop: '1px solid var(--border)' }}>
        <button onClick={handleLogout} style={{
          display: 'flex',
          alignItems: 'center',
          gap: 10,
          padding: '9px 12px',
          borderRadius: 8,
          border: 'none',
          background: 'transparent',
          color: 'var(--muted)',
          fontSize: 14,
          cursor: 'pointer',
          width: '100%',
          transition: 'background 0.15s, color 0.15s',
        }}
          onMouseEnter={e => {
            ;(e.currentTarget as HTMLElement).style.background = 'var(--nav-hover)'
            ;(e.currentTarget as HTMLElement).style.color = '#e53e3e'
          }}
          onMouseLeave={e => {
            ;(e.currentTarget as HTMLElement).style.background = 'transparent'
            ;(e.currentTarget as HTMLElement).style.color = 'var(--muted)'
          }}
        >
          <LogOut size={16} />
          Odhlásit se
        </button>
      </div>
    </div>
  )
}
