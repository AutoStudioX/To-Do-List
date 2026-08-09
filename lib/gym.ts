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

// Délka tréninku: 47 → "47 min", 117 → "1 h 47 min", 120 → "2 h".
// Celé hodiny se píšou bez "0 min" — "2 h 0 min" nikdo neříká.
export function fmtDuration(min: number | null | undefined): string {
  if (min == null || min < 0) return ''
  if (min < 60) return `${Math.round(min)} min`
  const h = Math.floor(min / 60)
  const m = Math.round(min % 60)
  return m === 0 ? `${h} h` : `${h} h ${m} min`
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

// Heaviest working set (by weight); at equal weight the one with more reps.
// null when none.
export function topSet(sets: SetLike[]): { weight_kg: number | null; reps: number | null } | null {
  let best: SetLike | null = null
  for (const s of sets) {
    if (s.is_warmup) continue
    if (!best) { best = s; continue }
    const w = Number(s.weight_kg) || 0, bw = Number(best.weight_kg) || 0
    if (w > bw || (w === bw && (s.reps || 0) > (best.reps || 0))) best = s
  }
  return best
}

// "85 × 6" from a single set; "" when null.
export function fmtSet(s: { weight_kg: number | null; reps: number | null } | null): string {
  if (!s) return ''
  const w = s.weight_kg == null ? 'vlastní' : `${fmtWeight(Number(s.weight_kg))}`
  return `${w} × ${s.reps ?? '?'}`
}

// ---- Porovnání série s minulým tréninkem ----

export type PrevSet = { weight_kg: number | null; reps: number | null }
export type SetBadge = { text: string; kind: 'pr' | 'up' | 'same' | 'down' }

/**
 * Odznak u potvrzené pracovní série: jak dopadla proti odpovídající sérii
 * minule. `prevMaxWeight` je nejvyšší váha, kterou měl tenhle cvik minule.
 *
 * PR = VÁHA, ne objem. Objemové PR (váha × opakování víc než nejlepší série
 * minule) svítilo i při poklesu váhy, když se přidala opakování, a nikdo
 * netušil, co „PR objem" znamená.
 *
 * Zhoršení se hlásí taky — je to fakt, ne chyba, takže tlumeně (`down`),
 * nikdy červeně.
 */
export function setBadge(weight: number, reps: number, prev: PrevSet[], workingIdx: number, prevMaxWeight: number): SetBadge | null {
  if (prevMaxWeight > 0 && weight > prevMaxWeight) return { text: 'PR váha', kind: 'pr' }
  const p = prev[workingIdx]
  if (!p) return null
  const pw = Number(p.weight_kg) || 0
  const pr = p.reps || 0
  if (weight === pw) {
    if (reps === pr) return { text: '= minule', kind: 'same' }
    return reps > pr
      ? { text: `+${reps - pr} rep`, kind: 'up' }
      : { text: `-${pr - reps} rep`, kind: 'down' }
  }
  return weight > pw
    ? { text: `+${fmtWeight(weight - pw)} kg`, kind: 'up' }
    : { text: `-${fmtWeight(pw - weight)} kg`, kind: 'down' }
}

/** Nejvyšší váha mezi pracovními sériemi minulého tréninku. 0 když žádné nejsou. */
export function maxPrevWeight(prev: PrevSet[]): number {
  return prev.reduce((m, p) => Math.max(m, Number(p.weight_kg) || 0), 0)
}

// ---- Progression advice (read-only; the app suggests, the user decides) ----

/** Per-exercise goal. The increment is computed, not configured. */
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

/** One-handed work: the jump lands on both sides, so it counts double. */
export function isOneHanded(name: string): boolean {
  const n = name.toLowerCase()
  return n.includes('jednoručk') || n.includes('dumbbell')
}

/**
 * Increment for the NEXT jump, ~2.5–5 % of the working weight rounded up to a
 * real plate step:
 *   ≤ 20 kg → 1.25 · 20–100 kg → 2.5 · > 100 kg → 5
 * One-handed exercises get half of that. The floor stays at 1.25 kg — half of
 * the smallest tier would be 0.625 kg, which nobody can actually load.
 */
export function stepForWeight(weight: number, exerciseName: string): number {
  const base = weight <= 20 ? 1.25 : weight <= 100 ? 2.5 : 5
  return isOneHanded(exerciseName) ? Math.max(1.25, base / 2) : base
}

const working = (s: SetLike[]) => s.filter(x => !x.is_warmup)
const maxWeight = (s: SetLike[]) => working(s).reduce((m, x) => Math.max(m, Number(x.weight_kg) || 0), 0)
const maxReps = (s: SetLike[]) => working(s).reduce((m, x) => Math.max(m, x.reps || 0), 0)

/**
 * Cíl se posuzuje podle TOP SÉRIE: dost pracovních sérií celkem a nejtěžší
 * z nich dala cílový počet opakování.
 *
 * PROČ NE „všechny série splnily opakování": při rampě 50×10 / 60×10 / 70×10
 * to platí vždycky, protože náběhové série jsou lehké — cíl by byl splněný
 * i ve chvíli, kdy se vrchol vůbec nezvedl. Náběh je náběh, rozhoduje vrchol.
 */
export function targetMet(sets: SetLike[], target: Target): boolean {
  const w = working(sets)
  if (w.length < target.sets) return false
  return (topSet(w)?.reps || 0) >= target.reps
}

/**
 * Advice for the next session of one exercise. `sessions` is that exercise's
 * history, oldest first, excluding the workout being logged right now.
 * Returns null when there is nothing trustworthy to say.
 */
export function buildAdvice(sessions: ExSession[], target: Target | null, exerciseName: string): Advice | null {
  if (!sessions.length) return null
  const last = sessions[sessions.length - 1]
  // Všechno se točí kolem TOP SÉRIE. Náběhové série rampy appka neřeší —
  // jsou to schody k vrcholu, ne cíl sám o sobě.
  const lastTop = topSet(working(last.sets))
  const lastMax = maxWeight(last.sets)
  const topReps = lastTop?.reps ?? 0

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
        short: `top série: stagnace 3 tréninky — zkus zpět na ${fmtWeight(back)} kg`,
        long: 'Top série stagnuje 3 tréninky — zkus snížit váhu o 10 % a jít znovu nahoru.',
        reason: `Za poslední tři tréninky se nezvedla top série (max ${fmtWeight(lastMax)} kg) ani počet opakování. Deset procent dolů je ${fmtWeight(back)} kg.`,
      }
    }
  }

  if (!target) return null

  if (targetMet(last.sets, target)) {
    // Derived from the weight actually lifted, so it scales as the lift grows.
    const step = stepForWeight(lastMax, exerciseName)
    const next = lastMax > 0 ? lastMax + step : null
    return {
      kind: 'increase',
      short: next ? `top série: zkus ${fmtWeight(next)} kg` : 'top série: zkus přidat váhu',
      long: next
        ? `Top série ${fmtWeight(lastMax)} kg × ${topReps} splnila cíl ${target.sets}×${target.reps} — zkus ${fmtWeight(next)} kg (+${fmtWeight(step)} kg).`
        : `Top série splnila cíl ${target.sets}×${target.reps} — zkus přidat váhu.`,
      reason: `Minule jsi na vrcholu dal ${fmtWeight(lastMax)} kg × ${topReps} a celkem ${working(last.sets).length} pracovních sérií. Náběhové série se neposuzují. Krok +${fmtWeight(step)} kg vychází z aktuální váhy${isOneHanded(exerciseName) ? ' a z toho, že jednoručka se přidává na obě strany' : ''}.`,
    }
  }

  return {
    kind: 'hold',
    short: lastMax > 0 ? `top série: zůstaň na ${fmtWeight(lastMax)} kg` : 'top série: zůstaň na stejné váze',
    long: `Top série zatím nesplnila cíl ${target.sets}×${target.reps} — zůstaň na stejné váze.`,
    reason: working(last.sets).length < target.sets
      ? `Minule jsi udělal ${working(last.sets).length} pracovních sérií z ${target.sets}. Váhu má smysl přidat, až jich bude dost a vrchol dá ${target.reps} opakování.`
      : `Top série minule dala ${topReps} opakování z cílových ${target.reps}. Váhu má smysl přidat, až vrchol vyjde celý.`,
  }
}
