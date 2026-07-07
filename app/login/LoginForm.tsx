'use client'
import { useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { useRouter } from 'next/navigation'

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
    <form onSubmit={handleLogin} className="flex flex-col gap-4">
      <div className="flex flex-col gap-2">
        <label className="flex items-center gap-2 text-sm font-medium leading-none select-none" style={{ color: '#0a0a0a' }}>
          E-mail
        </label>
        <input
          type="email"
          value={email}
          onChange={e => setEmail(e.target.value)}
          required
          className="h-8 w-full min-w-0 border bg-transparent px-2.5 py-1 text-sm outline-none transition-colors placeholder:text-[#9ca3af]"
          style={{ borderRadius: 16, borderColor: '#e6e6e6', color: '#0a0a0a' }}
        />
      </div>
      <div className="flex flex-col gap-2">
        <label className="flex items-center gap-2 text-sm font-medium leading-none select-none" style={{ color: '#0a0a0a' }}>
          Heslo
        </label>
        <input
          type="password"
          value={password}
          onChange={e => setPassword(e.target.value)}
          required
          className="h-8 w-full min-w-0 border bg-transparent px-2.5 py-1 text-sm outline-none transition-colors placeholder:text-[#9ca3af]"
          style={{ borderRadius: 16, borderColor: '#e6e6e6', color: '#0a0a0a' }}
        />
      </div>
      {error && <p className="text-sm" style={{ color: '#e8192c' }}>{error}</p>}
      <button
        type="submit"
        disabled={loading}
        className="mt-2 h-8 w-full inline-flex items-center justify-center rounded-lg border border-transparent text-sm font-medium text-white transition-all"
        style={{ background: '#e8192c', borderRadius: 16, opacity: loading ? 0.7 : 1, cursor: loading ? 'not-allowed' : 'pointer' }}
      >
        {loading ? 'Přihlašování...' : 'Přihlásit se'}
      </button>
    </form>
  )
}
