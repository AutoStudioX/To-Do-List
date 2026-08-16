'use client'
import { useEffect } from 'react'

/** Po osmi hodinách bez obnovení je stránka stará dost na to, aby se dala načíst znovu. */
const MAX_STARI_MS = 8 * 60 * 60 * 1000

/**
 * Jediné místo, kde se appka přenačte sama — a i to jen ve chvíli, kdy u toho
 * nikdo nepracuje.
 *
 * PODMÍNKA JSOU DVĚ VĚCI NARÁZ:
 *   1. dokument běží bez obnovení víc než osm hodin,
 *   2. uživatel se PRÁVĚ VRACÍ na záložku (`visibilitychange` → visible).
 *
 * Žádný časovač, žádné hlídání nové verze, žádná lišta s upozorněním. Dřív tu
 * byl `UpdateReloader`, který kontroloval hash skriptů a při změně přenačetl
 * kdykoli — i uprostřed psaní, takže rozepsaný text zmizel. Nová verze se teď
 * normálně načte tím, že uživatel sám obnoví stránku nebo se do appky vrátí
 * později; tohle řeší jen ten případ, kdy záložka visí otevřená přes noc.
 *
 * Stáří se bere z `performance.timeOrigin`, tedy od vzniku dokumentu — ne od
 * připojení komponenty, které by se u klientské navigace počítalo znovu.
 */
export default function StaleReloader() {
  useEffect(() => {
    const vznikDokumentu = performance.timeOrigin || Date.now()

    const priNavratu = () => {
      if (document.visibilityState !== 'visible') return
      if (Date.now() - vznikDokumentu < MAX_STARI_MS) return
      location.reload()
    }

    document.addEventListener('visibilitychange', priNavratu)
    return () => document.removeEventListener('visibilitychange', priNavratu)
  }, [])

  return null
}
