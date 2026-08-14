import type { Metadata } from 'next'
import './globals.css'
import MobileLayout from '@/components/MobileLayout'
import { ThemeProvider } from '@/components/ThemeProvider'
import UpdateReloader from '@/components/UpdateReloader'

export const metadata: Metadata = {
  title: 'AutoStudio Dashboard',
  description: 'Personal productivity dashboard',
  manifest: '/manifest.json',
  // Ikony se NEUVÁDĚJÍ ručně: `app/icon.svg` a `app/apple-icon.png` jsou
  // konvence Next.js, ze kterých si odkazy i velikosti vygeneruje sám.
  //
  // Dřív tu byl ruční odkaz na `/icon.svg`, jenže ten se servíroval
  // z `public/icon.svg`, kde ležel ÚPLNĚ JINÝ obrázek (blesk) než v mobilní
  // appce z manifestu (checklist). Prohlížeč tak ukazoval jinou ikonu než
  // telefon. Ten soubor je pryč, aby se dvě pravdy neměly kde vzít.
}

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="cs" suppressHydrationWarning>
      <head>
        <meta name="theme-color" content="#ffffff" />
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
        <UpdateReloader />
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
