'use client'
import { useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { useRouter } from 'next/navigation'

export default function LoginPage() {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)
  const router = useRouter()
  const supabase = createClient()

  async function handleLogin(e: React.FormEvent) {
    e.preventDefault()
    setLoading(true)
    setError('')
    const { error } = await supabase.auth.signInWithPassword({ email, password })
    if (error) {
      setError(error.message)
      setLoading(false)
    } else {
      router.push('/prehled')
      router.refresh()
    }
  }

  return (
    <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'var(--bg)' }}>
      <div style={{ background: 'var(--card)', border: '1px solid var(--border)', borderRadius: 16, padding: 40, width: 380, boxShadow: '0 4px 24px rgba(0,0,0,0.08)' }}>
        {/* Brand */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 24 }}>
          <div style={{
            width: 40, height: 40, borderRadius: 10,
            background: '#e53e3e',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            fontSize: 18, fontWeight: 800, color: 'white',
          }}>A</div>
          <div>
            <div style={{ fontSize: 18, fontWeight: 700, color: 'var(--text)' }}>AutoStudio</div>
            <div style={{ fontSize: 12, color: 'var(--muted)' }}>Dashboard</div>
          </div>
        </div>

        <h1 style={{ fontSize: 22, fontWeight: 700, marginBottom: 6, color: 'var(--text)' }}>Přihlásit se</h1>
        <p style={{ color: 'var(--muted)', marginBottom: 24, fontSize: 14 }}>Přihlaste se ke svému účtu</p>

        <form onSubmit={handleLogin} style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
          <div>
            <label style={{ fontSize: 13, color: 'var(--muted)', display: 'block', marginBottom: 6, fontWeight: 500 }}>Email</label>
            <input type="email" value={email} onChange={e => setEmail(e.target.value)} required
              style={{ width: '100%', background: 'var(--input-bg)', border: '1px solid var(--border)', borderRadius: 8, padding: '10px 14px', color: 'var(--text)', fontSize: 14, outline: 'none' }} />
          </div>
          <div>
            <label style={{ fontSize: 13, color: 'var(--muted)', display: 'block', marginBottom: 6, fontWeight: 500 }}>Heslo</label>
            <input type="password" value={password} onChange={e => setPassword(e.target.value)} required
              style={{ width: '100%', background: 'var(--input-bg)', border: '1px solid var(--border)', borderRadius: 8, padding: '10px 14px', color: 'var(--text)', fontSize: 14, outline: 'none' }} />
          </div>
          {error && <p style={{ color: '#e53e3e', fontSize: 13 }}>{error}</p>}
          <button type="submit" disabled={loading}
            style={{ background: '#e53e3e', color: 'white', border: 'none', borderRadius: 8, padding: '12px', fontSize: 15, fontWeight: 600, cursor: loading ? 'not-allowed' : 'pointer', opacity: loading ? 0.7 : 1, marginTop: 8 }}>
            {loading ? 'Přihlašování...' : 'Přihlásit se'}
          </button>
        </form>
      </div>
    </div>
  )
}
