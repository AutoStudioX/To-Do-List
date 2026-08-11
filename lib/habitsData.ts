import type { SupabaseClient } from '@supabase/supabase-js'
import { lastDays, trainingValues, type Habit } from '@/lib/habits'

/** Okno, ze kterého čtou Přehled i Detail. */
export const WINDOW_DAYS = 365

export type HabitWindow = {
  habits: Habit[]
  /** dny okna, nejstarší → dnešek */
  days: string[]
  /** hodnoty návyku po dnech okna, ve stejném pořadí jako `days` */
  byHabit: Record<string, number[]>
}

/**
 * Jedno načtení pro obě obrazovky. Návyk se `zdroj = 'trenink'` se dopočítá
 * z `workouts` — do `habit_entries` se pro něj nikdy nezapisuje, takže se
 * nemá co rozejít.
 */
export async function loadWindow(supabase: SupabaseClient, userId: string): Promise<HabitWindow> {
  const days = lastDays(WINDOW_DAYS)
  const from = days[0]

  const [{ data: hs, error: hErr }, { data: es, error: eErr }, { data: ws }] = await Promise.all([
    supabase.from('habits').select('*').eq('user_id', userId).eq('archivovany', false).order('poradi'),
    supabase.from('habit_entries').select('habit_id, datum, hodnota').eq('user_id', userId).gte('datum', from),
    supabase.from('workouts').select('date').eq('user_id', userId).gte('date', from),
  ])
  if (hErr) throw new Error(hErr.message)
  if (eErr) throw new Error(eErr.message)

  const habits = (hs || []) as Habit[]
  const perDay: Record<string, Record<string, number>> = {}
  for (const e of (es || []) as { habit_id: string; datum: string; hodnota: number }[]) {
    ;(perDay[e.habit_id] ||= {})[e.datum] = Number(e.hodnota)
  }
  const workoutDays = new Set(((ws || []) as { date: string }[]).map(w => w.date))

  const byHabit: Record<string, number[]> = {}
  for (const h of habits) {
    const map = h.zdroj === 'trenink' ? trainingValues(days, workoutDays) : (perDay[h.id] || {})
    byHabit[h.id] = days.map(d => map[d] ?? 0)
  }
  return { habits, days, byHabit }
}

/** Poslední `n` dnů okna — Přehled si tak vyřízne 7 / 30 / 365. */
export function slice(w: HabitWindow, n: number): { days: string[]; byHabit: Record<string, number[]> } {
  const start = Math.max(0, w.days.length - n)
  const out: Record<string, number[]> = {}
  for (const id of Object.keys(w.byHabit)) out[id] = w.byHabit[id].slice(start)
  return { days: w.days.slice(start), byHabit: out }
}
