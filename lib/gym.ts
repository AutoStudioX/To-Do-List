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

// 80 → "80", 82.5 → "82,5", 21.25 → "21,25" (cs decimal comma, no trailing zeros).
// Two decimals matter: the 1.25 kg step lands on quarters.
export function fmtWeight(w: number): string {
  const r = Math.round(w * 100) / 100
  const s = Number.isInteger(r) ? String(r) : String(r).replace(/(\.\d*?)0+$/, '$1')
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

// ---- Progression advice (read-only; the app suggests, the user decides) ----

export type Target = { sets: number; reps: number }
export type AdviceKind = 'increase' | 'hold' | 'stagnation'
export type Advice = { kind: AdviceKind; short: string; long: string; reason: string }

// One past session of a single exercise, oldest first.
export type ExSession = { date: string; sets: SetLike[] }

// Compound lifts that carry a full 2.5 kg jump well. Everything else — isolation
// work and dumbbell variants — gets the smaller step.
//
// NOTE: `exercises.muscle_group` currently stores the SPLIT (Push/Pull/Legs),
// not a muscle, so it cannot tell a big lift from a small one. The name is the
// only signal we actually have, and unknown names default to the smaller,
// safer step.
const BIG_LIFTS = [
  'dřep', 'squat', 'mrtvý tah', 'deadlift', 'bench', 'tlak nad hlavu',
  'leg press', 'shyby', 'přítahy', 'veslování', 'hip thrust', 'výpady', 'bradlech',
]

export function isBigLift(name: string): boolean {
  const n = name.toLowerCase()
  // A dumbbell variant is never treated as a big lift, whatever the movement.
  if (n.includes('jednoručk')) return false
  return BIG_LIFTS.some(k => n.includes(k))
}

/** Recommended jump: 2.5 kg for compound lifts, 1.25 kg for the rest. */
export function weightStepFor(name: string): number {
  return isBigLift(name) ? 2.5 : 1.25
}

const working = (s: SetLike[]) => s.filter(x => !x.is_warmup)
const maxWeight = (s: SetLike[]) => working(s).reduce((m, x) => Math.max(m, Number(x.weight_kg) || 0), 0)
const maxReps = (s: SetLike[]) => working(s).reduce((m, x) => Math.max(m, x.reps || 0), 0)

/** Target met = enough working sets AND every one of them hit the rep goal. */
export function targetMet(sets: SetLike[], target: Target): boolean {
  const w = working(sets)
  if (w.length < target.sets) return false
  return w.every(s => (s.reps || 0) >= target.reps)
}

/**
 * Advice for the next session of one exercise. `sessions` is that exercise's
 * history, oldest first, excluding the workout being logged right now.
 * Returns null when there is nothing trustworthy to say.
 */
export function buildAdvice(sessions: ExSession[], target: Target | null, exerciseName: string): Advice | null {
  if (!sessions.length) return null
  const last = sessions[sessions.length - 1]
  const lastMax = maxWeight(last.sets)

  // Stagnation beats everything else: three sessions with no gain in weight or
  // reps means "add weight" advice has already been ignored (or is not working).
  if (sessions.length >= 3) {
    const [a, b, c] = sessions.slice(-3)
    const flatWeight = maxWeight(c.sets) <= maxWeight(a.sets) && maxWeight(b.sets) <= maxWeight(a.sets)
    const flatReps = maxReps(c.sets) <= maxReps(a.sets) && maxReps(b.sets) <= maxReps(a.sets)
    if (flatWeight && flatReps && lastMax > 0) {
      const back = Math.round(lastMax * 0.9 * 4) / 4 // 10 % down, rounded to 0.25
      return {
        kind: 'stagnation',
        short: 'stagnace 3 tréninky — zkus zpět na ' + fmtWeight(back) + ' kg',
        long: 'Stagnace 3 tréninky — zkus snížit váhu o 10 % a jít znovu nahoru.',
        reason: `Za poslední tři tréninky se nezvedla váha (max ${fmtWeight(lastMax)} kg) ani počet opakování. Deset procent dolů je ${fmtWeight(back)} kg.`,
      }
    }
  }

  if (!target) return null

  if (targetMet(last.sets, target)) {
    const step = weightStepFor(exerciseName)
    const next = lastMax > 0 ? lastMax + step : null
    return {
      kind: 'increase',
      short: next ? `splnil jsi cíl → zkus ${fmtWeight(next)} kg` : 'splnil jsi cíl → zkus přidat váhu',
      long: next
        ? `Splnil jsi cíl ${target.sets}×${target.reps} ve všech sériích — zkus ${fmtWeight(next)} kg (+${fmtWeight(step)} kg).`
        : `Splnil jsi cíl ${target.sets}×${target.reps} ve všech sériích — zkus přidat váhu.`,
      reason: isBigLift(exerciseName)
        ? 'Velký komplexní cvik, proto celý krok +2,5 kg.'
        : 'Menší nebo jednoruční cvik, proto +1,25 kg. Když takový přírůstek nemáš čím složit, dej +2,5 kg.',
    }
  }

  return {
    kind: 'hold',
    short: lastMax > 0 ? `cíl zatím nesplněn → zůstaň na ${fmtWeight(lastMax)} kg` : 'cíl zatím nesplněn → zůstaň na stejné váze',
    long: `Cíl ${target.sets}×${target.reps} zatím nesplněn ve všech sériích — zůstaň na stejné váze.`,
    reason: 'Váhu má smysl přidat, až cíl vyjde ve všech pracovních sériích.',
  }
}
