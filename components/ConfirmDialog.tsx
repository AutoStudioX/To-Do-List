'use client'
import { useEffect, useRef, useState } from 'react'
import { useOverlayClose } from '@/lib/useOverlayClose'

interface Props {
  message: string
  confirmLabel?: string
  onConfirm: () => void
  onCancel: () => void
}

export function ConfirmDialog({ message, confirmLabel = 'Smazat', onConfirm, onCancel }: Props) {
  const confirmRef = useRef<HTMLButtonElement>(null)
  // Stejné pravidlo jako u Modalu: zavřít jen když klik mimo i začal mimo.
  const overlay = useOverlayClose(onCancel)

  // Esc closes; the destructive button takes focus so Enter confirms.
  useEffect(() => {
    confirmRef.current?.focus()
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') { e.stopPropagation(); onCancel() } }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onCancel])

  return (
    <div style={{
      position: 'fixed', inset: 0, zIndex: 99998,
      background: 'rgba(0,0,0,0.5)',
      display: 'flex', alignItems: 'center', justifyContent: 'center',
    }} {...overlay}>
      <div style={{
        background: 'var(--card)', border: '1px solid var(--border)',
        borderRadius: 14, padding: '24px 28px', minWidth: 300, maxWidth: 400,
        boxShadow: '0 16px 48px rgba(0,0,0,0.3)',
      }}>
        <div style={{ fontSize: 15, color: 'var(--text)', marginBottom: 20, fontWeight: 500 }}>{message}</div>
        <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end' }}>
          <button onClick={onCancel} style={{
            background: 'transparent', border: '1px solid var(--border)',
            borderRadius: 8, padding: '8px 18px', color: 'var(--text)',
            cursor: 'pointer', fontSize: 14,
          }}>Zrušit</button>
          <button ref={confirmRef} onClick={onConfirm} style={{
            background: '#E8192C', border: 'none',
            borderRadius: 8, padding: '8px 18px', color: 'white',
            cursor: 'pointer', fontSize: 14, fontWeight: 600,
          }}>{confirmLabel}</button>
        </div>
      </div>
    </div>
  )
}

export function useConfirm() {
  const [state, setState] = useState<{ message: string; confirmLabel?: string; resolve: (v: boolean) => void } | null>(null)

  function confirm(message: string, confirmLabel?: string): Promise<boolean> {
    return new Promise(resolve => setState({ message, confirmLabel, resolve }))
  }

  function handleConfirm() { state?.resolve(true); setState(null) }
  function handleCancel() { state?.resolve(false); setState(null) }

  const dialog = state ? (
    <ConfirmDialog message={state.message} confirmLabel={state.confirmLabel} onConfirm={handleConfirm} onCancel={handleCancel} />
  ) : null

  return { confirm, dialog }
}
