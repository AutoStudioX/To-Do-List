'use client'
import { useState } from 'react'

interface Props {
  message: string
  onConfirm: () => void
  onCancel: () => void
}

export function ConfirmDialog({ message, onConfirm, onCancel }: Props) {
  return (
    <div style={{
      position: 'fixed', inset: 0, zIndex: 99998,
      background: 'rgba(0,0,0,0.5)',
      display: 'flex', alignItems: 'center', justifyContent: 'center',
    }} onClick={onCancel}>
      <div style={{
        background: 'var(--card)', border: '1px solid var(--border)',
        borderRadius: 14, padding: '24px 28px', minWidth: 300, maxWidth: 400,
        boxShadow: '0 16px 48px rgba(0,0,0,0.3)',
      }} onClick={e => e.stopPropagation()}>
        <div style={{ fontSize: 15, color: 'var(--text)', marginBottom: 20, fontWeight: 500 }}>{message}</div>
        <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end' }}>
          <button onClick={onCancel} style={{
            background: 'transparent', border: '1px solid var(--border)',
            borderRadius: 8, padding: '8px 18px', color: 'var(--text)',
            cursor: 'pointer', fontSize: 14,
          }}>Zrušit</button>
          <button onClick={onConfirm} style={{
            background: '#e53e3e', border: 'none',
            borderRadius: 8, padding: '8px 18px', color: 'white',
            cursor: 'pointer', fontSize: 14, fontWeight: 600,
          }}>Smazat</button>
        </div>
      </div>
    </div>
  )
}

export function useConfirm() {
  const [state, setState] = useState<{ message: string; resolve: (v: boolean) => void } | null>(null)

  function confirm(message: string): Promise<boolean> {
    return new Promise(resolve => setState({ message, resolve }))
  }

  function handleConfirm() { state?.resolve(true); setState(null) }
  function handleCancel() { state?.resolve(false); setState(null) }

  const dialog = state ? (
    <ConfirmDialog message={state.message} onConfirm={handleConfirm} onCancel={handleCancel} />
  ) : null

  return { confirm, dialog }
}
