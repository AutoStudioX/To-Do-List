// Shared helpers for task deadline time (deadline_time, a local wall-clock `time`).

// "08:00:00" | "08:00" | null → "8:00" (no leading zero on hours), or '' if empty.
export function formatTime(t?: string | null): string {
  if (!t) return ''
  const [h, m] = t.slice(0, 5).split(':')
  if (h === undefined || m === undefined) return ''
  return `${parseInt(h, 10)}:${m}`
}

// " v 8:00" when a time is set, otherwise '' — appended after the date.
export function timeSuffix(t?: string | null): string {
  const f = formatTime(t)
  return f ? ` v ${f}` : ''
}

// Sort key that orders by date, then by time within the same day, with
// time-less tasks after timed ones. No deadline sorts last.
export function deadlineSortKey(deadline?: string | null, deadline_time?: string | null): string {
  if (!deadline) return '~' // tilde > digits → no-deadline last
  return `${deadline}T${(deadline_time ? deadline_time.slice(0, 5) : '99:99')}`
}
