// Exact badge color triples pulled from the existing UI, reused for the
// selected state of PillGroup so buttons match their badges 1:1.
//   priorita   → app/ukoly filter pills + components/TaskRow
//   task status→ components/TaskRow status dots (bg/text from the shared palette)
//   typ / status/ směr → app/finance TypBadge & StatusBadge
//   opakování  → app/finance recurrence pills
//   goal status→ app/goaly / app/prehled goal badges
import type { PillColor } from '@/components/PillGroup'

export const priorityColors: Record<string, PillColor> = {
  High: { bg: '#fee2e2', text: '#c53030', border: '#e53e3e' },
  Medium: { bg: '#fef3c7', text: '#b45309', border: '#f59e0b' },
  Low: { bg: '#d1fae5', text: '#065f46', border: '#10b981' },
}

export const taskStatusColors: Record<string, PillColor> = {
  'Todo': { bg: '#f3f4f6', text: '#6b7280', border: '#9ca3af' },
  'In Progress': { bg: '#dbeafe', text: '#2563eb', border: '#3b82f6' },
  'Done': { bg: '#d1fae5', text: '#059669', border: '#10b981' },
}

export const txTypColors: Record<string, PillColor> = {
  prijem: { bg: '#d1fae5', text: '#059669', border: '#10b981' },
  vydaj: { bg: '#fee2e2', text: '#e53e3e', border: '#e53e3e' },
  dluh: { bg: '#ede9fe', text: '#7c3aed', border: '#7c3aed' },
  fixni_naklad: { bg: '#dbeafe', text: '#2563eb', border: '#3b82f6' },
}

export const txStatusColors: Record<string, PillColor> = {
  zaplaceno: { bg: '#d1fae5', text: '#059669', border: '#10b981' },
  ceka: { bg: '#fef3c7', text: '#d97706', border: '#f59e0b' },
  dluh: { bg: '#ede9fe', text: '#7c3aed', border: '#7c3aed' },
  splaceno: { bg: '#d1fae5', text: '#059669', border: '#10b981' },
  nesplaceno: { bg: '#fee2e2', text: '#e53e3e', border: '#e53e3e' },
}

export const smerColors: Record<string, PillColor> = {
  moje: { bg: '#fee2e2', text: '#e53e3e', border: '#e53e3e' },
  mne: { bg: '#d1fae5', text: '#059669', border: '#10b981' },
}

export const opakovaniColors: Record<string, PillColor> = {
  jednorazovy: { bg: '#f3f4f6', text: '#6b7280', border: '#9ca3af' },
  mesicni: { bg: '#dbeafe', text: '#2563eb', border: '#3b82f6' },
  rocni: { bg: '#fef3c7', text: '#d97706', border: '#f59e0b' },
}

export const goalStatusColors: Record<string, PillColor> = {
  active: { bg: '#fee2e2', text: '#e53e3e', border: '#e53e3e' },
  completed: { bg: '#d1fae5', text: '#059669', border: '#10b981' },
}
