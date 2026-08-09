import type { SupabaseClient } from '@supabase/supabase-js'

/** Bez potvrzené série tak dlouho → trénink se sám ukončí. */
export const IDLE_LIMIT_MIN = 45

/**
 * Rezerva za poslední sérii (dokončení, odpočinek, sbalení). Jen pro texty v UI —
 * počítá se v databázi, `public.workout_tail()` v migraci 0010 je zdroj pravdy.
 * Deset minut je kalibrováno na trénink Pull 4. 8. 2026, kde mezi poslední sérií
 * a ručním ukončením uběhlo 9,8 min.
 */
export const TAIL_MIN = 10

/**
 * Projde všechny běžící tréninky uživatele a ukončí ty, ve kterých se
 * IDLE_LIMIT_MIN minut nic nepotvrdilo. Délka se počítá do poslední série,
 * ne do teď — viz migrace 0010.
 *
 * Volá se PŘI NAČTENÍ stránky, ne časovačem: appka je zavřená přesně v tu
 * chvíli, kdy by časovač měl spustit. Kontrola tak doběhne i po týdnu.
 */
export async function autoFinishStale(supabase: SupabaseClient): Promise<{ closed: string[]; error: string | null }> {
  const { data, error } = await supabase.rpc('auto_finish_stale_workouts', { idle_minutes: IDLE_LIMIT_MIN })
  if (error) {
    // PGRST202 = funkce v databázi není, protože migrace 0010 ještě neproběhla.
    // Tohle není chyba uživatelovy akce a hlásit ji při každém načtení stránky
    // by znamenalo červený toast pořád dokola — appka jede dál bez úklidu.
    if (error.code === 'PGRST202') return { closed: [], error: null }
    return { closed: [], error: error.message }
  }
  return { closed: ((data || []) as { workout_id: string }[]).map(r => r.workout_id), error: null }
}
