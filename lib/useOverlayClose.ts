'use client'
import { useRef } from 'react'

/**
 * Zavření modálu klikem mimo — jen když klik MIMO začal i skončil.
 *
 * `onClick` na překryvu je past: `click` se doručí nejbližšímu společnému
 * předkovi místa stisku a místa puštění. Když se tedy stiskne uvnitř modálu
 * a pustí venku — což je každé tažení posuvníku i výběr textu, kterému ujede
 * prst nebo myš — cílem `click`u je překryv a modál se zavře uprostřed práce.
 *
 * Proto se rozhoduje ze dvou událostí: `pointerdown` si zapamatuje, jestli
 * stisk padl na překryv (`target === currentTarget` znamená „na překryv, ne na
 * jeho potomka"), a `pointerup` zavře jen tehdy, když i puštění padlo tam.
 *
 * `pointerup` (ne `click`) proto, že `click` se po tažení ven vůbec nemusí
 * doručit tam, kam bychom čekali — a nechceme se na jeho pravidla spoléhat.
 */
export function useOverlayClose(onClose: () => void) {
  const startedOutside = useRef(false)

  return {
    onPointerDown: (e: React.PointerEvent) => {
      startedOutside.current = e.target === e.currentTarget
    },
    onPointerUp: (e: React.PointerEvent) => {
      const outside = startedOutside.current && e.target === e.currentTarget
      startedOutside.current = false
      if (outside) onClose()
    },
    // Zrušené gesto (scroll prstem, ztráta pointeru) nesmí nechat příznak
    // viset — další puštění na překryvu by pak zavřelo modál bez stisku.
    onPointerCancel: () => { startedOutside.current = false },
  }
}
