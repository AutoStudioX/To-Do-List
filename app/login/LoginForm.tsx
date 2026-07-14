'use client'
import { useActionState, useState } from 'react'
import { useFormStatus } from 'react-dom'
import { loginAction, type LoginState } from './actions'

function SubmitButton({ locked }: { locked: boolean }) {
  const { pending } = useFormStatus()
  const disabled = pending || locked
  return (
    <button
      type="submit"
      disabled={disabled}
      className="mt-2 h-8 w-full inline-flex items-center justify-center rounded-lg border border-transparent text-sm font-medium text-white transition-all"
      style={{ background: locked ? '#9ca3af' : '#e8192c', borderRadius: 16, opacity: disabled ? 0.6 : 1, cursor: disabled ? 'not-allowed' : 'pointer' }}
    >
      {locked ? 'Zamčeno' : pending ? 'Přihlašování...' : 'Přihlásit se'}
    </button>
  )
}

export default function LoginForm({ initialLocked = false, initialMessage = '' }: { initialLocked?: boolean; initialMessage?: string }) {
  const [state, formAction] = useActionState<LoginState, FormData>(loginAction, {})
  const [email, setEmail] = useState('')

  // Locked either from the server-side check on page load, or from the last submit.
  const locked = initialLocked || state.locked === true
  const message = state.error || (initialLocked ? initialMessage : '')

  const fieldStyle: React.CSSProperties = {
    borderRadius: 16,
    borderColor: '#e6e6e6',
    color: locked ? '#9ca3af' : '#0a0a0a',
    background: locked ? '#f3f4f6' : 'transparent',
    cursor: locked ? 'not-allowed' : 'text',
  }

  return (
    <form action={formAction} className="flex flex-col gap-4" aria-disabled={locked}>
      <fieldset disabled={locked} style={{ border: 'none', padding: 0, margin: 0, display: 'flex', flexDirection: 'column', gap: 16, opacity: locked ? 0.6 : 1 }}>
        <div className="flex flex-col gap-2">
          <label className="flex items-center gap-2 text-sm font-medium leading-none select-none" style={{ color: '#0a0a0a' }}>
            E-mail
          </label>
          <input
            name="email"
            type="email"
            required
            disabled={locked}
            value={email}
            onChange={e => setEmail(e.target.value)}
            autoComplete="email"
            className="h-8 w-full min-w-0 border bg-transparent px-2.5 py-1 text-sm outline-none transition-colors placeholder:text-[#9ca3af]"
            style={fieldStyle}
          />
        </div>
        <div className="flex flex-col gap-2">
          <label className="flex items-center gap-2 text-sm font-medium leading-none select-none" style={{ color: '#0a0a0a' }}>
            Heslo
          </label>
          <input
            name="password"
            type="password"
            required
            disabled={locked}
            autoComplete="current-password"
            className="h-8 w-full min-w-0 border bg-transparent px-2.5 py-1 text-sm outline-none transition-colors placeholder:text-[#9ca3af]"
            style={fieldStyle}
          />
        </div>
        {message && <p className="text-sm" style={{ color: '#e8192c' }}>{message}</p>}
        <SubmitButton locked={locked} />
      </fieldset>
    </form>
  )
}
