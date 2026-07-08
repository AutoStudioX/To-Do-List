'use client'
import { useState } from 'react'
import { usePathname } from 'next/navigation'
import Sidebar from './Sidebar'
import BottomNav from './BottomNav'
import ThemeToggle from './ThemeToggle'
import { Menu, Zap } from 'lucide-react'
import VoiceAgent from './VoiceAgent'

export default function MobileLayout({ children }: { children: React.ReactNode }) {
  const [sidebarOpen, setSidebarOpen] = useState(false)
  const pathname = usePathname()

  if (pathname === '/login' || pathname.startsWith('/auth')) {
    return <>{children}</>
  }

  return (
    <div style={{ display: 'flex', height: '100dvh', overflow: 'hidden' }}>
      <Sidebar isOpen={sidebarOpen} onClose={() => setSidebarOpen(false)} />

      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
        <header style={{
          height: 52, display: 'flex', alignItems: 'center', justifyContent: 'space-between',
          padding: '0 16px', borderBottom: '1px solid var(--border)',
          background: 'var(--card)', flexShrink: 0, position: 'relative',
        }}>
          <button className="mobile-only" onClick={() => setSidebarOpen(true)} style={{
            background: 'transparent', border: 'none', color: 'var(--text)',
            cursor: 'pointer', padding: 6, display: 'flex', alignItems: 'center',
          }}>
            <Menu size={22} />
          </button>
          <div className="mobile-only" style={{
            display: 'flex', alignItems: 'center', gap: 6,
            position: 'absolute', left: '50%', top: '50%', transform: 'translate(-50%, -50%)',
          }}>
            <div style={{ width: 28, height: 28, borderRadius: '50%', background: '#e53e3e', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <Zap size={14} color="white" fill="white" strokeWidth={1.5} />
            </div>
            <span style={{ fontSize: 14, fontWeight: 700, color: 'var(--text)' }}>To-Do <span style={{ color: '#e53e3e' }}>List</span></span>
          </div>
          <div className="desktop-only" />
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, position: 'relative' }}>
            <VoiceAgent />
            <ThemeToggle />
          </div>
        </header>
        <main className="main-content" style={{ flex: 1, overflowY: 'auto', padding: '24px' }}>
          {children}
        </main>
        <BottomNav />
      </div>
    </div>
  )
}
