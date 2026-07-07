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
    <div style={{
      minHeight: '100vh',
      display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
      gap: 32, padding: 16,
      background: 'radial-gradient(circle at 100% 0%, rgba(232,25,44,0.10) 0%, transparent 60%), #ffffff',
    }}>
      {/* App name */}
      <div style={{ textAlign: 'center' }}>
        <h1 style={{ fontSize: 30, fontWeight: 700, letterSpacing: '-0.025em', color: '#111827', margin: 0, lineHeight: 1.2 }}>
          To-Do <span style={{ color: '#E8192C' }}>List</span>
        </h1>
        <p style={{ fontSize: 14, color: '#9ca3af', margin: '4px 0 0' }}>Přihlaste se pro přístup k aplikaci</p>
      </div>

      {/* Card */}
      <div style={{
        background: '#ffffff', borderRadius: 20, padding: '24px 24px 24px 24px',
        width: '100%', maxWidth: 384,
        boxShadow: '0 4px 6px -1px rgba(0,0,0,0.1), 0 2px 4px -2px rgba(0,0,0,0.1)',
        border: '1px solid rgba(0,0,0,0.06)',
      }}>
        <div style={{ fontSize: 14, color: '#6b7280', fontWeight: 500, marginBottom: 8 }}>Přihlášení</div>
        <div style={{ padding: '0 0 24px' }}>
        <form onSubmit={handleLogin} style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
          <div>
            <label style={{ fontSize: 13, color: '#374151', display: 'block', marginBottom: 6, fontWeight: 600 }}>E-mail</label>
            <input
              type="email" value={email} onChange={e => setEmail(e.target.value)} required
              style={{ width: '100%', background: '#f9fafb', border: '1px solid #e5e7eb', borderRadius: 16, padding: '10px 14px', color: '#111827', fontSize: 14, outline: 'none', boxSizing: 'border-box' }}
            />
          </div>
          <div>
            <label style={{ fontSize: 13, color: '#374151', display: 'block', marginBottom: 6, fontWeight: 600 }}>Heslo</label>
            <input
              type="password" value={password} onChange={e => setPassword(e.target.value)} required
              style={{ width: '100%', background: '#f9fafb', border: '1px solid #e5e7eb', borderRadius: 16, padding: '10px 14px', color: '#111827', fontSize: 14, outline: 'none', boxSizing: 'border-box' }}
            />
          </div>
          {error && <p style={{ color: '#E8192C', fontSize: 13, margin: 0 }}>{error}</p>}
          <button
            type="submit" disabled={loading}
            style={{ background: '#E8192C', color: 'white', border: 'none', borderRadius: 16, padding: '11px 16px', fontSize: 14, fontWeight: 600, cursor: loading ? 'not-allowed' : 'pointer', opacity: loading ? 0.7 : 1, marginTop: 4 }}
          >
            {loading ? 'Přihlašování...' : 'Přihlásit se'}
          </button>
        </form>
        </div>
      </div>

      {/* Powered by AutoStudio */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
        <div style={{ width: 48, height: 48, borderRadius: '50%', background: '#e53e3e', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
          <Zap size={20} color="white" fill="white" strokeWidth={1.5} />
        </div>
        <div>
          <div style={{ fontSize: 12, color: '#9ca3af', lineHeight: 1.2 }}>powered by</div>
          <div style={{ fontSize: 18, fontWeight: 700, color: '#111111', lineHeight: 1.2 }}>
            Auto<span style={{ color: '#e53e3e' }}>Studio</span>
          </div>
        </div>
      </div>
    </div>
  )
}
