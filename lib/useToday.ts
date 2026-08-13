'use client'
import { useEffect, useRef, useState } from 'react'
import { dayKey } from '@/lib/habits'

/**
 * Dnešní datum, které se samo překlopí o půlnoci.
 *
 * `const today = dayKey(new Date())` v těle komponenty vypadá správně, ale
 * appka nechaná otevřená přes noc se nemá proč překreslit — datum na obrazovce
 * zamrzne na včerejšku. Stránka pak nabízí zápis do včerejška a štítky „Dnes"
 * lžou.
 *
 * Dvě spouště, obě volají totéž:
 *  - `visibilitychange` + `focus` — návrat na záložku po zamčeném telefonu;
 *    pokrývá i případ, kdy prohlížeč ve schované záložce časovače přiškrtí,
 *  - minutový časovač — pro appku, na kterou je vidět celou dobu.
 *
 * Časovač schválně NEHLÍDÁ `visibilityState`: ve schované záložce sice běží
 * nepřesně, ale i tak dorovná datum dřív, než se uživatel vrátí. Kontrola je
 * porovnání dvou řetězců, takže na tom nezáleží.
 *
 * `onChange` dostane nový a starý den — pro stránky, které kromě překreslení
 * musí ještě něco dorovnat (načíst okno dat, posunout zobrazený den).
 */
export function useToday(onChange?: (now: string, prev: string) => void): string {
  const [today, setToday] = useState(() => dayKey(new Date()))
  const ref = useRef(today)
  // Callback se drží v refu, aby se posluchači nepřevěšovali při každém
  // renderu — jinak by se interval pořád rušil a zakládal znovu.
  const cb = useRef(onChange)
  cb.current = onChange

  useEffect(() => {
    const check = () => {
      const now = dayKey(new Date())
      const prev = ref.current
      if (now === prev) return
      ref.current = now
      setToday(now)
      cb.current?.(now, prev)
    }
    const t = setInterval(check, 60_000)
    document.addEventListener('visibilitychange', check)
    window.addEventListener('focus', check)
    return () => {
      clearInterval(t)
      document.removeEventListener('visibilitychange', check)
      window.removeEventListener('focus', check)
    }
  }, [])

  return today
}
