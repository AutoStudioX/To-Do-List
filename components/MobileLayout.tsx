'use client'
import { useState } from 'react'
import Sidebar from './Sidebar'
import BottomNav from './BottomNav'
import ThemeToggle from './ThemeToggle'
import { Menu } from 'lucide-react'

export default function MobileLayout({ children }: { children: React.ReactNode }) {
  const [sidebarOpen, setSidebarOpen] = useState(false)

  return (
    <div style={{ display: 'flex', height: '100vh', overflow: 'hidden' }}>
      <Sidebar isOpen={sidebarOpen} onClose={() => setSidebarOpen(false)} />

      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
        <header style={{
          height: 52, display: 'flex', alignItems: 'center', justifyContent: 'space-between',
          padding: '0 16px', borderBottom: '1px solid var(--border)',
          background: 'var(--card)', flexShrink: 0,
        }}>
          <button className="mobile-only" onClick={() => setSidebarOpen(true)} style={{
            background: 'transparent', border: 'none', color: 'var(--text)',
            cursor: 'pointer', padding: 6, display: 'flex', alignItems: 'center',
          }}>
            <Menu size={22} />
          </button>
          <div className="desktop-only" />
          <ThemeToggle />
        </header>
        <main className="main-content" style={{ flex: 1, overflowY: 'auto', padding: '24px' }}>
          {children}
        </main>
        <BottomNav />
      </div>
    </div>
  )
}
