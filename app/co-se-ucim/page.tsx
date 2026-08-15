'use client'
// Krok 3 handoffu — obrazovka „Co se učím". Zatím kostra kvůli navigaci.
export default function CoSeUcimPage() {
  return (
    <div style={{ maxWidth: 720, margin: '0 auto', paddingBottom: 24 }}>
      <h1 style={{ margin: 0, fontSize: 23, fontWeight: 700, letterSpacing: '-.015em', color: 'var(--text)' }}>
        Co se učím
      </h1>
      <div style={{ marginTop: 5, fontSize: 13.5, color: 'var(--muted)' }}>Připravuje se v dalším kroku.</div>
    </div>
  )
}
