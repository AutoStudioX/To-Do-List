'use client'
import { useEffect, useState } from 'react'
import { CheckCircle, XCircle, X } from 'lucide-react'

export type ToastType = 'success' | 'error'

interface ToastProps {
  message: string
  type: ToastType
  onClose: () => void
}

export function Toast({ message, type, onClose }: ToastProps) {
  useEffect(() => {
    const t = setTimeout(onClose, 3500)
    return () => clearTimeout(t)
  }, [onClose])

  return (
    <div style={{
      position: 'fixed', bottom: 24, right: 24, zIndex: 99999,
      background: 'var(--card)',
      border: `1px solid ${type === 'success' ? '#10b981' : '#e53e3e'}`,
      borderRadius: 12, padding: '12px 16px',
      display: 'flex', alignItems: 'center', gap: 10,
      boxShadow: '0 8px 32px rgba(0,0,0,0.18)',
      animation: 'toastIn 0.2s ease',
      maxWidth: 340, minWidth: 220,
    }}>
      {type === 'success'
        ? <CheckCircle size={18} color="#10b981" style={{ flexShrink: 0 }} />
        : <XCircle size={18} color="#e53e3e" style={{ flexShrink: 0 }} />
      }
      <span style={{ fontSize: 14, color: 'var(--text)', flex: 1 }}>{message}</span>
      <button onClick={onClose} style={{ background: 'transparent', border: 'none', cursor: 'pointer', padding: 2, color: 'var(--muted)', display: 'flex' }}>
        <X size={14} />
      </button>
      <style>{`@keyframes toastIn { from { opacity: 0; transform: translateY(8px) } to { opacity: 1; transform: translateY(0) } }`}</style>
    </div>
  )
}

export function useToast() {
  const [toast, setToast] = useState<{ message: string; type: ToastType } | null>(null)

  function showToast(message: string, type: ToastType = 'success') {
    setToast({ message, type })
  }

  function hideToast() {
    setToast(null)
  }

  return { toast, showToast, hideToast }
}
