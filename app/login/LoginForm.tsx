'use client'
import { useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { useRouter } from 'next/navigation'
import { Zap } from 'lucide-react'

export default function LoginForm() {
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
    try {
      const { error } = await supabase.auth.signInWithPassword({ email, password })
      if (error) {
        setError(error.message)
      } else {
        router.push('/prehled')
        router.refresh()
      }
    } catch {
      setError('Nepodařilo se připojit k serveru. Zkontrolujte připojení k internetu.')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div style={{ minHeight: '100vh', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', background: '#ffffff' }}>
      {/* Title */}
      <div style={{ marginBottom: 24, textAlign: 'center' }}>
        <h1 style={{ fontSize: 28, fontWeight: 700, color: '#111', margin: 0 }}>
          To-Do <span style={{ color: '#e53e3e' }}>List</span>
        </h1>
        <p style={{ fontSize: 13, color: '#9ca3af', marginTop: 6 }}>Přihlaste se pro přístup k aplikaci</p>
      </div>

      {/* Card */}
      <div style={{ background: '#ffffff', border: '1px solid #e5e7eb', borderRadius: 14, padding: '32px 36px', width: 360, boxShadow: '0 2px 16px rgba(0,0,0,0.07)' }}>
        <div style={{ fontSize: 13, color: '#6b7280', marginBottom: 16, fontWeight: 500 }}>Přihlášení</div>
        <form onSubmit={handleLogin} style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
          <div>
            <label style={{ fontSize: 13, color: '#374151', display: 'block', marginBottom: 5, fontWeight: 500 }}>E-mail</label>
            <input type="email" value={email} onChange={e => setEmail(e.target.value)} required
              style={{ width: '100%', background: '#f3f4f6', border: '1px solid #e5e7eb', borderRadius: 8, padding: '9px 13px', color: '#111', fontSize: 14, outline: 'none', boxSizing: 'border-box' }} />
          </div>
          <div>
            <label style={{ fontSize: 13, color: '#374151', display: 'block', marginBottom: 5, fontWeight: 500 }}>Heslo</label>
            <input type="password" value={password} onChange={e => setPassword(e.target.value)} required
              style={{ width: '100%', background: '#f3f4f6', border: '1px solid #e5e7eb', borderRadius: 8, padding: '9px 13px', color: '#111', fontSize: 14, outline: 'none', boxSizing: 'border-box' }} />
          </div>
          {error && <p style={{ color: '#e53e3e', fontSize: 13, margin: 0 }}>{error}</p>}
          <button type="submit" disabled={loading}
            style={{ background: '#e53e3e', color: 'white', border: 'none', borderRadius: 8, padding: '11px', fontSize: 14, fontWeight: 600, cursor: loading ? 'not-allowed' : 'pointer', opacity: loading ? 0.7 : 1, marginTop: 4 }}>
            {loading ? 'Přihlašování...' : 'Přihlásit se'}
          </button>
        </form>
      </div>

      {/* Powered by */}
      <div style={{ marginTop: 28, display: 'flex', alignItems: 'center', gap: 12 }}>
        <div style={{ width: 48, height: 48, borderRadius: '50%', background: '#e53e3e', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
          <Zap size={22} color="white" fill="white" />
        </div>
        <div>
          <div style={{ fontSize: 13, color: '#6b7280', marginBottom: -2, lineHeight: 1 }}>powered by</div>
          <div style={{ fontSize: 17, fontWeight: 700, color: '#111' }}>Auto<span style={{ color: '#e53e3e' }}>Studio</span></div>
        </div>
      </div>
    </div>
  )
}
