// Export tréninkových dat do JEDNÉ PLOCHÉ TABULKY.
//
// Jeden řádek = jedna série, sloupce tréninku se opakují. Vnořená struktura by
// se sice nedublovala, ale nejde otevřít v Excelu ani vložit do chatu — a přesně
// k tomu tenhle export je. JSON má stejné řádky jako CSV, jen jako pole objektů.

export type ExportRange = 'all' | '3m' | '1m'

export const RANGE_LABEL: Record<ExportRange, string> = {
  all: 'Vše',
  '3m': 'Poslední 3 měsíce',
  '1m': 'Poslední měsíc',
}

export type ExportWorkout = {
  id: string
  date: string
  split_type: string | null
  duration_min: number | null
  other_gym?: boolean
  auto_finished?: boolean
}

export type ExportSet = {
  workout_id: string
  exercise_id: string
  order_index: number
  weight_kg: number | null
  reps: number | null
  is_warmup: boolean
  to_failure?: boolean
  created_at?: string
}

export type ExportRow = {
  datum: string
  split: string
  delka_min: number | ''
  jina_posilovna: string
  auto_ukonceni: string
  cvik: string
  poradi_cviku: number | ''
  serie: number | ''
  vaha_kg: number | ''
  opakovani: number | ''
  warm_up: string
  do_selhani: string
  cas_zapisu: string
}

/** Sloupce v pořadí, v jakém jdou do CSV i do JSON. */
export const EXPORT_COLUMNS: (keyof ExportRow)[] = [
  'datum', 'split', 'delka_min', 'jina_posilovna', 'auto_ukonceni',
  'cvik', 'poradi_cviku', 'serie', 'vaha_kg', 'opakovani',
  'warm_up', 'do_selhani', 'cas_zapisu',
]

const yesNo = (v: unknown) => (v ? 'ano' : 'ne')

/**
 * Nejstarší datum, které do rozsahu ještě patří. null = bez omezení.
 *
 * Den se ořezává na poslední den cílového měsíce: `setMonth` by z 31. května
 * mínus tři měsíce udělal 3. března (31. února neexistuje a Date to přetočí).
 */
export function rangeStart(range: ExportRange, today: Date): string | null {
  if (range === 'all') return null
  const back = range === '3m' ? 3 : 1
  const y = today.getFullYear()
  const m = today.getMonth() - back
  const lastDay = new Date(y, m + 1, 0).getDate()
  const d = new Date(y, m, Math.min(today.getDate(), lastDay))
  const p = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`
}

/**
 * Sloučí tréninky a série do plochých řádků, seřazených od nejnovějšího
 * tréninku. Trénink bez jediné série se objeví taky — jako řádek se
 * sloupci tréninku a prázdnými sloupci série; jinak by z exportu zmizel.
 */
export function buildExportRows(
  workouts: ExportWorkout[],
  sets: ExportSet[],
  exerciseNames: Map<string, string>,
): ExportRow[] {
  const byWorkout = new Map<string, ExportSet[]>()
  for (const s of sets) {
    const g = byWorkout.get(s.workout_id) || []
    g.push(s)
    byWorkout.set(s.workout_id, g)
  }

  const sorted = [...workouts].sort((a, b) => b.date.localeCompare(a.date))
  const rows: ExportRow[] = []

  for (const w of sorted) {
    const base = {
      datum: w.date,
      split: w.split_type ?? '',
      delka_min: w.duration_min ?? ('' as const),
      jina_posilovna: yesNo(w.other_gym),
      auto_ukonceni: yesNo(w.auto_finished),
    }
    const mine = (byWorkout.get(w.id) || []).slice().sort((a, b) => {
      if (a.order_index !== b.order_index) return a.order_index - b.order_index
      return (a.created_at || '').localeCompare(b.created_at || '')
    })
    if (!mine.length) {
      rows.push({ ...base, cvik: '', poradi_cviku: '', serie: '', vaha_kg: '', opakovani: '', warm_up: '', do_selhani: '', cas_zapisu: '' })
      continue
    }
    // Číslo série se počítá v rámci cviku a warm-upy se nečíslují — v tabulce
    // se pak dá filtrovat „serie = 1" a dostaneš první pracovní sérii.
    const seen = new Map<string, number>()
    for (const s of mine) {
      const n = s.is_warmup ? '' : (seen.set(s.exercise_id, (seen.get(s.exercise_id) || 0) + 1), seen.get(s.exercise_id)!)
      rows.push({
        ...base,
        cvik: exerciseNames.get(s.exercise_id) ?? s.exercise_id,
        poradi_cviku: s.order_index + 1,
        serie: n,
        vaha_kg: s.weight_kg == null ? '' : Number(s.weight_kg),
        opakovani: s.reps ?? '',
        warm_up: yesNo(s.is_warmup),
        do_selhani: yesNo(s.to_failure),
        cas_zapisu: s.created_at ?? '',
      })
    }
  }
  return rows
}

/**
 * CSV se středníkem a BOM: česká verze Excelu čte čárku jako oddělovač desetin,
 * takže s čárkou by se sloupce rozsypaly, a bez BOM zobrazí háčky rozbitě.
 * Čísla se píšou s desetinnou čárkou, aby s nimi Excel uměl počítat.
 */
export function toCSV(rows: ExportRow[]): string {
  const esc = (v: string | number): string => {
    if (typeof v === 'number') return String(v).replace('.', ',')
    return /[";\n]/.test(v) ? `"${v.replace(/"/g, '""')}"` : v
  }
  const head = EXPORT_COLUMNS.join(';')
  const body = rows.map(r => EXPORT_COLUMNS.map(c => esc(r[c])).join(';'))
  return '﻿' + [head, ...body].join('\r\n') + '\r\n'
}

export function toJSON(rows: ExportRow[]): string {
  return JSON.stringify(rows, null, 2)
}

/** trenink-2026-08-09-vse.csv */
export function exportFilename(range: ExportRange, ext: 'csv' | 'json', today: Date): string {
  const p = (n: number) => String(n).padStart(2, '0')
  const stamp = `${today.getFullYear()}-${p(today.getMonth() + 1)}-${p(today.getDate())}`
  const suffix = range === 'all' ? 'vse' : range === '3m' ? '3-mesice' : '1-mesic'
  return `trenink-${stamp}-${suffix}.${ext}`
}
