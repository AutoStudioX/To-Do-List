'use client'
import { DAY_LABELS } from '@/lib/habits'

/** Sytost 0→4 odvozená z akcentu, aby mřížka držela s motivem appky. */
export const LEVEL_BG = [
  'var(--progress-track)',
  'rgba(232,25,44,0.22)',
  'rgba(232,25,44,0.45)',
  'rgba(232,25,44,0.70)',
  'var(--accent)',
] as const

export function Legend({ min, max }: { min: string; max: string }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 12, color: 'var(--muted)' }}>
      <span>{min}</span>
      {LEVEL_BG.map((bg, i) => (
        <div key={i} style={{ width: 13, height: 13, borderRadius: 3, background: bg }} />
      ))}
      <span>{max}</span>
    </div>
  )
}

/**
 * Contribution graph: 53 sloupců × 7 řádků, plněno po sloupcích.
 *
 * `offset` je počet prázdných buněk před prvním dnem — musí vyjít ze
 * skutečného dne v týdnu, ne z konstanty. Prototyp má natvrdo 6, což sedělo
 * jen na jeho generovaná data; s reálným datem by mřížka ležela na špatných
 * řádcích.
 */
export default function YearGrid({
  levels, offset, cell, gap, radius, labels = false,
}: {
  /** `null` = den, kdy návyk neplatil — zůstane prázdný */
  levels: (number | null)[]
  offset: number
  cell: number
  gap: number
  radius: number
  labels?: boolean
}) {
  const total = 53 * 7
  const cells: (number | null)[] = [
    ...Array(offset).fill(null),
    ...levels,
  ].slice(0, total)
  while (cells.length < total) cells.push(null)

  const grid = (
    <div style={{
      display: 'grid', gridAutoFlow: 'column',
      gridTemplateColumns: `repeat(53, ${cell}px)`,
      gridTemplateRows: `repeat(7, ${cell}px)`,
      gap, justifyContent: labels ? undefined : 'center',
    }}>
      {cells.map((l, i) => (
        <div key={i} style={{ borderRadius: radius, background: l == null ? 'transparent' : LEVEL_BG[l] }} />
      ))}
    </div>
  )

  if (!labels) return grid

  return (
    <div style={{ display: 'flex', gap: 12, alignItems: 'flex-start', overflowX: 'auto' }}>
      <div style={{
        display: 'grid', gridTemplateRows: `repeat(7, ${cell}px)`, gap,
        fontSize: 10, color: 'var(--muted)', paddingTop: 1, flexShrink: 0,
      }}>
        {DAY_LABELS.map((d, i) => <span key={d}>{i % 2 === 0 ? d : ''}</span>)}
      </div>
      {grid}
    </div>
  )
}
