// Focus — časovač na soustředěnou práci s cílem.
//
// ZDROJ PRAVDY JE `started_at` V DATABÁZI, ne odpočet v prohlížeči. Interval
// v komponentě jen překresluje číslo; kolik zbývá, se vždycky dopočítá z časů.
// Proto focus doběhne správně, i když se appka mezitím zavře nebo uspí telefon.

export const FOCUS_PRESETS = [25, 45, 60, 90] as const
export const MAX_FOCUS_MIN = 480
export const PROGRESS_STEPS = [0, 25, 50, 75, 100] as const

export type FocusState = 'running' | 'paused' | 'finished' | 'done' | 'cancelled'

export type FocusSession = {
  id: string
  cil: string
  started_at: string
  duration_min: number
  progress: number
  stav: FocusState
  paused_at: string | null
  paused_sec: number
}

/** Stavy, které patří na obrazovku. Zbytek je uzavřený a uklizený z cesty. */
export const ACTIVE_STATES: FocusState[] = ['running', 'paused', 'finished']

export function isActive(stav: FocusState): boolean {
  return ACTIVE_STATES.includes(stav)
}

/**
 * Odpracované sekundy, bez pauz.
 *
 * V pauze se čas počítá jen do okamžiku pauznutí — jinak by pauza přes noc
 * focus „dopočítala" do konce.
 */
export function elapsedSec(f: Pick<FocusSession, 'started_at' | 'stav' | 'paused_at' | 'paused_sec'>, nowMs: number): number {
  const start = new Date(f.started_at).getTime()
  const upto = f.stav === 'paused' && f.paused_at ? new Date(f.paused_at).getTime() : nowMs
  return Math.max(0, Math.floor((upto - start) / 1000) - Math.max(0, f.paused_sec || 0))
}

export function remainingSec(f: Pick<FocusSession, 'started_at' | 'stav' | 'paused_at' | 'paused_sec' | 'duration_min'>, nowMs: number): number {
  return Math.max(0, f.duration_min * 60 - elapsedSec(f, nowMs))
}

/** Čas vypršel. V pauze nikdy — pauza focus nedožene. */
export function isExpired(f: Pick<FocusSession, 'started_at' | 'stav' | 'paused_at' | 'paused_sec' | 'duration_min'>, nowMs: number): boolean {
  return f.stav !== 'paused' && remainingSec(f, nowMs) <= 0
}

/** Kolik sekund přičíst k `paused_sec` při návratu z pauzy. */
export function pauseDebtSec(pausedAt: string | null, nowMs: number): number {
  if (!pausedAt) return 0
  return Math.max(0, Math.floor((nowMs - new Date(pausedAt).getTime()) / 1000))
}

/** 90 → "1:30:00", 25 → "25:00", zbytek "04:07". */
export function fmtClock(totalSec: number): string {
  const s = Math.max(0, Math.floor(totalSec))
  const h = Math.floor(s / 3600)
  const m = Math.floor((s % 3600) / 60)
  const sec = s % 60
  const pad = (n: number) => String(n).padStart(2, '0')
  return h > 0 ? `${h}:${pad(m)}:${pad(sec)}` : `${pad(m)}:${pad(sec)}`
}

/** "25 min" / "1 h 30 min" — pro předvolby a shrnutí. */
export function fmtLength(min: number): string {
  if (min < 60) return `${min} min`
  const h = Math.floor(min / 60)
  const m = min % 60
  return m === 0 ? `${h} h` : `${h} h ${m} min`
}

/** Ořez uživatelského vstupu na povolený rozsah. */
export function clampMinutes(v: number): number {
  if (!Number.isFinite(v)) return FOCUS_PRESETS[0]
  return Math.min(MAX_FOCUS_MIN, Math.max(1, Math.round(v)))
}

export function clampProgress(v: number): number {
  if (!Number.isFinite(v)) return 0
  return Math.min(100, Math.max(0, Math.round(v)))
}

/**
 * Na finální stav splnění se ptáme jen tehdy, když focus skončil a uživatel
 * není na stu procentech — na 100 % už není co doplňovat.
 */
export function needsFinalAnswer(f: Pick<FocusSession, 'stav' | 'progress'>): boolean {
  return f.stav === 'finished' && f.progress < 100
}
