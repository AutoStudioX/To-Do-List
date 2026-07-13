'use client'
import { useActionState } from 'react'
import { useFormStatus } from 'react-dom'
import { loginAction, type LoginState } from './actions'

function SubmitButton() {
  const { pending } = useFormStatus()
  return (
    <button
      type="submit"
      disabled={pending}
      className="mt-2 h-8 w-full inline-flex items-center justify-center rounded-lg border border-transparent text-sm font-medium text-white transition-all"
      style={{ background: '#e8192c', borderRadius: 16, opacity: pending ? 0.7 : 1, cursor: pending ? 'not-allowed' : 'pointer' }}
    >
      {pending ? 'Přihlašování...' : 'Přihlásit se'}
    </button>
  )
}

export default function LoginForm() {
  const [state, formAction] = useActionState<LoginState, FormData>(loginAction, {})

  return (
    <form action={formAction} className="flex flex-col gap-4">
      <div className="flex flex-col gap-2">
        <label className="flex items-center gap-2 text-sm font-medium leading-none select-none" style={{ color: '#0a0a0a' }}>
          E-mail
        </label>
        <input
          name="email"
          type="email"
          required
          autoComplete="email"
          className="h-8 w-full min-w-0 border bg-transparent px-2.5 py-1 text-sm outline-none transition-colors placeholder:text-[#9ca3af]"
          style={{ borderRadius: 16, borderColor: '#e6e6e6', color: '#0a0a0a' }}
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
          autoComplete="current-password"
          className="h-8 w-full min-w-0 border bg-transparent px-2.5 py-1 text-sm outline-none transition-colors placeholder:text-[#9ca3af]"
          style={{ borderRadius: 16, borderColor: '#e6e6e6', color: '#0a0a0a' }}
        />
      </div>
      {state.error && <p className="text-sm" style={{ color: '#e8192c' }}>{state.error}</p>}
      <SubmitButton />
    </form>
  )
}
