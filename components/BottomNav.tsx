'use client'
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { LayoutDashboard, CheckSquare, TrendingUp, Target } from 'lucide-react'

const navItems = [
  { href: '/prehled', label: 'Přehled', icon: LayoutDashboard },
  { href: '/finance', label: 'Finance', icon: TrendingUp },
  { href: '/ukoly', label: 'Úkoly', icon: CheckSquare },
  { href: '/goaly', label: 'Goals', icon: Target },
]

export default function BottomNav() {
  const pathname = usePathname()

  return (
    <nav className="bottom-nav" style={{
      position: 'fixed', bottom: 0, left: 0, right: 0,
      background: 'var(--card)', borderTop: '1px solid var(--border)',
      padding: '8px 0 12px', justifyContent: 'space-around', alignItems: 'center',
      zIndex: 100,
    }}>
      {navItems.map(({ href, label, icon: Icon }) => {
        const isActive = pathname === href || pathname.startsWith(href + '/')
        return (
          <Link key={href} href={href} style={{
            display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 3,
            textDecoration: 'none', padding: '4px 12px',
            color: isActive ? '#e53e3e' : 'var(--muted)',
          }}>
            <Icon size={22} />
            <span style={{ fontSize: 10, fontWeight: isActive ? 600 : 400 }}>{label}</span>
          </Link>
        )
      })}
    </nav>
  )
}
