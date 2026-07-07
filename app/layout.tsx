import type { Metadata } from 'next'
import './globals.css'
import MobileLayout from '@/components/MobileLayout'
import { ThemeProvider } from '@/components/ThemeProvider'

export const metadata: Metadata = {
  title: 'AutoStudio Dashboard',
  description: 'Personal productivity dashboard',
  manifest: '/manifest.json',
  icons: {
    icon: { url: '/icon.svg', type: 'image/svg+xml' },
    apple: { url: '/icon.svg', type: 'image/svg+xml' },
  },
}

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="cs" suppressHydrationWarning>
      <head>
        <meta name="theme-color" content="#ffffff" />
        <link rel="apple-touch-icon" sizes="180x180" href="/apple-touch-icon.png" />
        <meta name="apple-mobile-web-app-capable" content="yes" />
        <meta name="mobile-web-app-capable" content="yes" />
        <meta name="apple-mobile-web-app-status-bar-style" content="black-translucent" />
        <meta name="apple-mobile-web-app-title" content="To-Do List" />
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

function LayoutInner({ children }: { children: React.ReactNode }) {
  return <MobileLayout>{children}</MobileLayout>
}
