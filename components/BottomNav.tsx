'use client'
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { LayoutDashboard, CheckSquare, TrendingUp, Target, Dumbbell, Crosshair, Flame, Phone } from 'lucide-react'

const navItems = [
  { href: '/prehled', label: 'Přehled', icon: LayoutDashboard },
  { href: '/finance', label: 'Finance', icon: TrendingUp },
  { href: '/ukoly', label: 'Úkoly', icon: CheckSquare },
  { href: '/focus', label: 'Focus', icon: Crosshair },
  { href: '/habits', label: 'Habits', icon: Flame },
  { href: '/trenink', label: 'Trénink', icon: Dumbbell },
  { href: '/goaly', label: 'Goals', icon: Target },
  // „Co se učím" ve spodní navigaci není schválně — je to čtecí obrazovka,
  // ne denní navigace, a osm položek se na 390px už nevejde. Vede na ni
  // tlačítko v hlavičce sekce.
  // Osmá položka: „Cold cally" se na 390px ořízlo na „Cold c…", proto tu má
  // kratší popisek. V postranním panelu i v hlavičce sekce zůstává plný název.
  { href: '/cold-cally', label: 'Hovory', icon: Phone },
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
          // Se sedmi položkami už `padding: 0 12px` na 390px přetékalo o 8 px
          // a „Goals" se ořízlo. Položky se teď dělí o šířku rovným dílem
          // a smrsknou se, místo aby vytlačily poslední z obrazovky.
          <Link key={href} href={href} style={{
            flex: 1, minWidth: 0,
            display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 3,
            textDecoration: 'none', padding: '4px 2px',
            color: isActive ? '#E8192C' : 'var(--muted)',
          }}>
            <Icon size={22} />
            <span style={{
              fontSize: 10, fontWeight: isActive ? 600 : 400,
              maxWidth: '100%', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
            }}>{label}</span>
          </Link>
        )
      })}
    </nav>
  )
}
