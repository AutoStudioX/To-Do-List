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
    case 'Push': return '#e53e3e'
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
