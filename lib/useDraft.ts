'use client'
import { useEffect, useRef } from 'react'

/**
 * Rozepsaný text přežije i přenačtení stránky.
 *
 * Uživatel může kdykoli obnovit stránku, zavřít záložku nebo mu spadne
 * prohlížeč. Nic z toho nesmí sebrat rozepsaný formulář — draft se proto při
 * každé změně ukládá do `localStorage` a při otevření se vrátí zpátky.
 *
 * Klíč MUSÍ nést identitu záznamu (`ukoly:new`, `hovor:<id>`, `poznamka:<datum>`),
 * jinak by se rozepsaný text vylil do cizího formuláře.
 *
 * Draft se maže po úspěšném uložení nebo po zahození — `zahod()`. Neuklízí se
 * při odchodu ze stránky: „odešel jsem pryč" není totéž co „uložil jsem to".
 */

const PREFIX = 'draft:'

function zapis(klic: string, hodnota: unknown) {
  try {
    localStorage.setItem(PREFIX + klic, JSON.stringify(hodnota))
  } catch {
    // Plné nebo zakázané úložiště (privátní režim): draft se neuloží, ale
    // formulář musí fungovat dál — proto se tu jen tiše pokračuje.
    console.warn('[draft] uložení se nepovedlo:', klic)
  }
}

function smaz(klic: string) {
  try { localStorage.removeItem(PREFIX + klic) } catch { console.warn('[draft] smazání se nepovedlo:', klic) }
}

export function nactiDraft<T>(klic: string): T | null {
  try {
    const s = localStorage.getItem(PREFIX + klic)
    return s ? (JSON.parse(s) as T) : null
  } catch {
    console.warn('[draft] načtení se nepovedlo:', klic)
    return null
  }
}

/**
 * @param klic     identita rozepsaného záznamu; `null` = neukládat (formulář zavřený)
 * @param hodnota  aktuální stav formuláře
 * @param obnov    dostane uložený draft při otevření
 * @param prazdne  co se považuje za „není co ukládat"
 */
export function useDraft<T>(
  klic: string | null,
  hodnota: T,
  obnov: (draft: T) => void,
  prazdne: (h: T) => boolean,
) {
  const obnovRef = useRef(obnov)
  obnovRef.current = obnov
  const prazdneRef = useRef(prazdne)
  prazdneRef.current = prazdne
  // Obnovit se smí jen jednou na otevření, jinak by uložený draft přepisoval
  // to, co uživatel zrovna píše.
  const obnoveno = useRef<string | null>(null)

  useEffect(() => {
    if (!klic || obnoveno.current === klic) return
    obnoveno.current = klic
    const draft = nactiDraft<T>(klic)
    if (draft !== null && !prazdneRef.current(draft)) obnovRef.current(draft)
  }, [klic])

  useEffect(() => {
    if (!klic || obnoveno.current !== klic) return
    if (prazdneRef.current(hodnota)) smaz(klic)
    else zapis(klic, hodnota)
  }, [klic, hodnota])

  // Zavřený formulář se smí příště obnovit znovu — draft v úložišti ZŮSTÁVÁ.
  useEffect(() => {
    if (klic) return
    obnoveno.current = null
  }, [klic])

  return {
    /** Uložil se / zahodil se → draft pryč. */
    zahod: () => { if (klic) smaz(klic) },
  }
}
