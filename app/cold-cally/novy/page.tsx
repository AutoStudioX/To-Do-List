'use client'
import Link from 'next/link'
import { ChevronLeft } from 'lucide-react'

// Krok 3 handoffu — obrazovka „Záznam hovoru". Zatím jen kostra, aby odkazy
// ze seznamu nevedly na 404; obsah přijde v dalším kroku.
export default function NovyHovorPage() {
  return (
    <div style={{ maxWidth: 880, margin: '0 auto', paddingBottom: 24 }}>
      <Link href="/cold-cally" style={{
        display: 'inline-flex', alignItems: 'center', gap: 6, height: 44,
        fontSize: 13.5, fontWeight: 500, color: 'var(--muted)', textDecoration: 'none',
      }}><ChevronLeft size={17} /> Cold cally</Link>
      <h1 style={{ margin: '0 0 8px', fontSize: 23, fontWeight: 700, letterSpacing: '-.015em', color: 'var(--text)' }}>
        Záznam hovoru
      </h1>
      <div style={{ fontSize: 13.5, color: 'var(--muted)' }}>Připravuje se v dalším kroku.</div>
    </div>
  )
}
