'use client'
import { usePathname, useRouter } from 'next/navigation'
import Link from 'next/link'
import { LayoutDashboard, CheckSquare, TrendingUp, Target, LogOut, Zap, X } from 'lucide-react'
import { createClient } from '@/lib/supabase/client'

const navItems = [
  { href: '/prehled', label: 'Přehled', icon: LayoutDashboard },
  { href: '/finance', label: 'Finance', icon: TrendingUp },
  { href: '/ukoly', label: 'Úkoly', icon: CheckSquare },
  { href: '/goaly', label: 'Goals', icon: Target },
]

interface Props {
  isOpen?: boolean
  onClose?: () => void
}

export default function Sidebar({ isOpen, onClose }: Props) {
  const pathname = usePathname()
  const router = useRouter()
  const supabase = createClient()

  async function handleLogout() {
    await supabase.auth.signOut()
    router.push('/login')
    router.refresh()
  }

  const inner = (
    <div style={{
      width: 220, background: 'var(--sidebar-bg)', height: '100vh',
      display: 'flex', flexDirection: 'column', flexShrink: 0,
    }}>
      <div style={{ padding: '20px 16px 16px', borderBottom: '1px solid var(--border)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <div style={{ fontSize: 26, fontWeight: 800, letterSpacing: '-0.5px', lineHeight: 1 }}>
          <span style={{ color: 'var(--text)' }}>To-Do </span><span style={{ color: '#e53e3e' }}>List</span>
        </div>
        {onClose && (
          <button onClick={onClose} className="mobile-only" style={{ background: 'transparent', border: 'none', color: 'var(--muted)', cursor: 'pointer', padding: 4, display: 'flex' }}>
            <X size={20} />
          </button>
        )}
      </div>

      <nav style={{ flex: 1, padding: '12px 8px', display: 'flex', flexDirection: 'column', gap: 2 }}>
        {navItems.map(({ href, label, icon: Icon }) => {
          const isActive = pathname === href || pathname.startsWith(href + '/')
          return (
            <Link key={href} href={href} onClick={onClose} style={{
              display: 'flex', alignItems: 'center', gap: 10, padding: '9px 12px',
              borderRadius: 8, textDecoration: 'none', fontSize: 14,
              fontWeight: isActive ? 600 : 400,
              color: isActive ? 'var(--nav-active-text)' : 'var(--muted)',
              background: isActive ? 'var(--nav-active-bg)' : 'transparent',
              transition: 'background 0.15s, color 0.15s',
            }}
              onMouseEnter={e => { if (!isActive) { (e.currentTarget as HTMLElement).style.background = 'var(--nav-hover)'; (e.currentTarget as HTMLElement).style.color = 'var(--text)' } }}
              onMouseLeave={e => { if (!isActive) { (e.currentTarget as HTMLElement).style.background = 'transparent'; (e.currentTarget as HTMLElement).style.color = 'var(--muted)' } }}
            >
              <Icon size={16} />
              {label}
            </Link>
          )
        })}
      </nav>

      <div style={{ padding: '10px 14px', margin: '0 8px 8px', borderRadius: 10, background: 'transparent', display: 'flex', alignItems: 'center', gap: 12 }}>
        <div style={{ width: 38, height: 38, borderRadius: '50%', background: '#e53e3e', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
          <Zap size={18} color="white" fill="white" />
        </div>
        <div>
          <div style={{ fontSize: 11, color: 'var(--muted)', lineHeight: 1.3 }}>powered by</div>
          <div style={{ fontSize: 14, fontWeight: 700, lineHeight: 1.2 }}>
            <span style={{ color: 'var(--text)' }}>Auto</span><span style={{ color: '#e53e3e' }}>Studio</span>
          </div>
        </div>
      </div>

      <div style={{ padding: '12px 8px', borderTop: '1px solid var(--border)' }}>
        <button onClick={handleLogout} style={{
          display: 'flex', alignItems: 'center', gap: 10, padding: '9px 12px',
          borderRadius: 8, border: 'none', background: 'transparent', color: 'var(--muted)',
          fontSize: 14, cursor: 'pointer', width: '100%', transition: 'background 0.15s, color 0.15s',
        }}
          onMouseEnter={e => { (e.currentTarget as HTMLElement).style.background = 'var(--nav-hover)'; (e.currentTarget as HTMLElement).style.color = '#e53e3e' }}
          onMouseLeave={e => { (e.currentTarget as HTMLElement).style.background = 'transparent'; (e.currentTarget as HTMLElement).style.color = 'var(--muted)' }}
        >
          <LogOut size={16} />
          Odhlásit se
        </button>
      </div>
    </div>
  )

  return (
    <>
      {/* Desktop: normal flex item */}
      <div className="sidebar" style={{ borderRight: '1px solid var(--sidebar-border)', flexShrink: 0 }}>
        {inner}
      </div>

      {/* Mobile: fixed drawer */}
      {isOpen !== undefined && (
        <>
          {isOpen && <div onClick={onClose} style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', zIndex: 200 }} />}
          <div className="mobile-only" style={{
            position: 'fixed', top: 0, left: isOpen ? 0 : -240, height: '100vh',
            zIndex: 201, transition: 'left 0.25s ease',
            boxShadow: isOpen ? '4px 0 24px rgba(0,0,0,0.3)' : 'none',
            display: 'flex',
          }}>
            {inner}
          </div>
        </>
      )}
    </>
  )
}
