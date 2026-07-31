import type { SplitType } from '@/lib/types'

export const SPLITS: SplitType[] = ['Push', 'Pull', 'Legs']
export const WEIGHT_STEP = 2.5
export const REP_STEP = 1

// Next split by rotation Push → Pull → Legs → Push, based on the last workout.
// Custom split names aren't in the rotation → fall through to Push as the suggestion.
export function nextSplit(lastSplit: string | null | undefined): SplitType {
  if (!lastSplit) return 'Push'
  const i = SPLITS.indexOf(lastSplit as SplitType)
  if (i === -1) return 'Push'
  return SPLITS[(i + 1) % SPLITS.length]
}

// Badge color for a split — the three defaults keep their colors, custom = purple.
export function splitColor(s?: string | null): string {
  switch (s) {
    case 'Push': return '#E8192C'
    case 'Pull': return '#2563eb'
    case 'Legs': return '#059669'
    default: return '#7c3aed'
  }
}

// "80 kg × 8, 80 × 7, 75 × 8" from a list of working sets (warm-ups excluded upstream).
export function formatPrevious(sets: { weight_kg: number | null; reps: number | null }[]): string {
  if (!sets.length) return ''
  return sets
    .map((s, i) => {
      const w = s.weight_kg == null ? '?' : fmtWeight(s.weight_kg)
      const r = s.reps == null ? '?' : s.reps
      return i === 0 ? `${w} kg × ${r}` : `${w} × ${r}`
    })
    .join(', ')
}

// 80 → "80", 82.5 → "82,5" (cs decimal comma, no trailing .0)
export function fmtWeight(w: number): string {
  const s = Number.isInteger(w) ? String(w) : w.toFixed(1)
  return s.replace('.', ',')
}

// ---- Derived, read-only metrics (no schema change; all computed from sets) ----

export type SetLike = { weight_kg: number | null; reps: number | null; is_warmup: boolean }

// Monday 00:00 local of the week containing `d`.
export function startOfWeek(d: Date): Date {
  const x = new Date(d.getFullYear(), d.getMonth(), d.getDate())
  const dow = (x.getDay() + 6) % 7 // Mon=0
  x.setDate(x.getDate() - dow)
  return x
}

// Tonnage of the working sets (warm-ups excluded): Σ weight × reps.
export function volume(sets: SetLike[]): number {
  return sets.reduce((sum, s) => s.is_warmup ? sum : sum + (Number(s.weight_kg) || 0) * (s.reps || 0), 0)
}

// "12,4 t" for ≥1000 kg, otherwise "820 kg".
export function fmtTonnage(kg: number): string {
  if (kg >= 1000) return `${fmtWeight(Math.round(kg / 100) / 10)} t`
  return `${Math.round(kg)} kg`
}

// Rounded percentage delta a vs b; null when there is no baseline.
export function pctDelta(current: number, previous: number): number | null {
  if (!previous) return null
  return Math.round(((current - previous) / previous) * 100)
}

// Epley 1RM estimate from the best working set. 0 when none.
export function epley1RM(sets: SetLike[]): number {
  let best = 0
  for (const s of sets) {
    if (s.is_warmup || !s.weight_kg || !s.reps) continue
    const e = Number(s.weight_kg) * (1 + s.reps / 30)
    if (e > best) best = e
  }
  return Math.round(best)
}

// Heaviest working set (by weight). null when none.
export function topSet(sets: SetLike[]): { weight_kg: number | null; reps: number | null } | null {
  let best: SetLike | null = null
  for (const s of sets) {
    if (s.is_warmup) continue
    if (!best || (Number(s.weight_kg) || 0) > (Number(best.weight_kg) || 0)) best = s
  }
  return best
}

// "85 × 6" from a single set; "" when null.
export function fmtSet(s: { weight_kg: number | null; reps: number | null } | null): string {
  if (!s) return ''
  const w = s.weight_kg == null ? 'vlastní' : `${fmtWeight(Number(s.weight_kg))}`
  return `${w} × ${s.reps ?? '?'}`
}
