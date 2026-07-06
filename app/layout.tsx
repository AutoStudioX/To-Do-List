import type { Metadata } from 'next'
import './globals.css'
import { createClient } from '@/lib/supabase/server'
import Sidebar from '@/components/Sidebar'
import AuthGuard from '@/components/AuthGuard'
import { ThemeProvider } from '@/components/ThemeProvider'
import ThemeToggle from '@/components/ThemeToggle'

export const metadata: Metadata = {
  title: 'AutoStudio Dashboard',
  description: 'Personal productivity dashboard',
  manifest: '/manifest.json',
}

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="cs" suppressHydrationWarning>
      <head>
        <meta name="theme-color" content="#ffffff" />
        <link rel="apple-touch-icon" href="/icon-192.png" />
        <meta name="apple-mobile-web-app-capable" content="yes" />
        <meta name="apple-mobile-web-app-status-bar-style" content="default" />
        <script dangerouslySetInnerHTML={{ __html: `
          try {
            if (localStorage.getItem('theme') === 'dark') {
              document.documentElement.classList.add('dark');
            }
          } catch(e) {}
          if('serviceWorker' in navigator && location.hostname !== 'localhost') navigator.serviceWorker.register('/sw.js');
        `}} />
      </head>
      <body>
        <ThemeProvider>
          <LayoutInner>{children}</LayoutInner>
        </ThemeProvider>
      </body>
    </html>
  )
}

async function LayoutInner({ children }: { children: React.ReactNode }) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()

  if (!user) {
    return <AuthGuard>{children}</AuthGuard>
  }


  return (
    <div style={{ display: 'flex', height: '100vh', overflow: 'hidden' }}>
      <Sidebar />
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
        <header style={{
          height: 52,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'flex-end',
          padding: '0 24px',
          borderBottom: '1px solid var(--border)',
          background: 'var(--card)',
          flexShrink: 0,
        }}>
          <ThemeToggle />
        </header>
        <main style={{ flex: 1, overflowY: 'auto', padding: '24px' }}>
          {children}
        </main>
      </div>
    </div>
  )
}
