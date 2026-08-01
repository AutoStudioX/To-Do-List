'use client'
import { useEffect, useState } from 'react'
import { X } from 'lucide-react'

// The overlay is sized to the VISUAL viewport, not the layout viewport.
// On iOS an open keyboard shrinks only the visual viewport — 100vh/92vh keep
// their full value, so a bottom sheet ends up underneath the keyboard.
function useVisualViewport(active: boolean) {
  const [vp, setVp] = useState<{ height: number; offsetTop: number } | null>(null)

  useEffect(() => {
    if (!active) return
    const vv = typeof window !== 'undefined' ? window.visualViewport : null
    if (!vv) return
    const sync = () => setVp({ height: vv.height, offsetTop: vv.offsetTop })
    sync()
    vv.addEventListener('resize', sync)
    vv.addEventListener('scroll', sync)
    return () => {
      vv.removeEventListener('resize', sync)
      vv.removeEventListener('scroll', sync)
    }
  }, [active])

  return vp
}

export default function Modal({ isOpen, onClose, title, children, bodyFill = false }: {
  isOpen: boolean
  onClose: () => void
  title: string
  children: React.ReactNode
  /** child manages its own scrolling and fills the body (sticky search + scrolling list) */
  bodyFill?: boolean
}) {
  const vp = useVisualViewport(isOpen)
  if (!isOpen) return null

  return (
    <div
      className="modal-overlay"
      onClick={onClose}
      style={{
        position: 'fixed', left: 0, right: 0, top: 0,
        // Follow the visual viewport so the sheet sits above the keyboard.
        height: vp ? vp.height : '100%',
        transform: vp ? `translateY(${vp.offsetTop}px)` : undefined,
        background: 'rgba(0,0,0,0.45)',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        zIndex: 1000,
      }}
    >
      <div
        className="modal-content"
        onClick={e => e.stopPropagation()}
        style={{
          background: 'var(--card)',
          border: '1px solid var(--border)',
          borderRadius: 12,
          padding: 24,
          minWidth: 400,
          maxWidth: 600,
          width: '90vw',
          // % of the overlay, which is already the visual viewport
          maxHeight: '85%',
          display: 'flex',
          flexDirection: 'column',
          minHeight: 0,
          position: 'relative',
          boxShadow: '0 20px 60px rgba(0,0,0,0.15)',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16, flexShrink: 0 }}>
          <h2 style={{ fontSize: 18, fontWeight: 700, margin: 0, color: 'var(--text)' }}>{title}</h2>
          <button
            onClick={onClose}
            style={{
              background: 'transparent', border: 'none', color: 'var(--muted)',
              cursor: 'pointer', padding: 8, borderRadius: 6,
              display: 'flex', alignItems: 'center', minHeight: 44, minWidth: 44, justifyContent: 'center',
            }}
          >
            <X size={20} />
          </button>
        </div>
        <div style={{
          flex: 1, minHeight: 0,
          overflowY: bodyFill ? 'hidden' : 'auto',
          display: bodyFill ? 'flex' : undefined,
          flexDirection: bodyFill ? 'column' : undefined,
        }}>
          {children}
        </div>
      </div>
    </div>
  )
}
