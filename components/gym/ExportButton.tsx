'use client'
import { useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import Modal from '@/components/Modal'
import { Toast, useToast } from '@/components/Toast'
import { Download, FileSpreadsheet, FileJson } from 'lucide-react'
import {
  buildExportRows, toCSV, toJSON, rangeStart, exportFilename, RANGE_LABEL,
  type ExportRange, type ExportWorkout, type ExportSet,
} from '@/lib/gymExport'

const RANGES: ExportRange[] = ['all', '3m', '1m']

/**
 * Stažení tréninkových dat jako jedna plochá tabulka. Nenápadné tlačítko —
 * export není každodenní akce, nemá si brát prostor.
 */
export default function ExportButton({ compact = false }: { compact?: boolean }) {
  const [open, setOpen] = useState(false)
  const [range, setRange] = useState<ExportRange>('all')
  const [busy, setBusy] = useState<'csv' | 'json' | null>(null)
  const { toast, showToast, hideToast } = useToast()

  async function run(format: 'csv' | 'json') {
    setBusy(format)
    try {
      const supabase = createClient()
      const { data: { session } } = await supabase.auth.getSession()
      const user = session?.user
      if (!user) { showToast('Export selhal: nejsi přihlášený', 'error'); return }

      const from = rangeStart(range, new Date())
      let q = supabase.from('workouts').select('*').eq('user_id', user.id)
      if (from) q = q.gte('date', from)
      const { data: ws, error: wErr } = await q.order('date', { ascending: false })
      if (wErr) { showToast(`Export selhal: ${wErr.message}`, 'error'); return }

      const workouts = (ws || []) as ExportWorkout[]
      if (!workouts.length) { showToast('V tomhle rozsahu nejsou žádné tréninky', 'error'); return }

      const [{ data: sets, error: sErr }, { data: cat, error: cErr }] = await Promise.all([
        supabase.from('workout_sets').select('*').in('workout_id', workouts.map(w => w.id)),
        supabase.from('exercises').select('id, name').or(`user_id.is.null,user_id.eq.${user.id}`),
      ])
      if (sErr || cErr) { showToast(`Export selhal: ${(sErr || cErr)!.message}`, 'error'); return }

      const names = new Map(((cat || []) as { id: string; name: string }[]).map(e => [e.id, e.name]))
      const rows = buildExportRows(workouts, (sets || []) as ExportSet[], names)
      const body = format === 'csv' ? toCSV(rows) : toJSON(rows)
      const mime = format === 'csv' ? 'text/csv;charset=utf-8' : 'application/json;charset=utf-8'

      const url = URL.createObjectURL(new Blob([body], { type: mime }))
      const a = document.createElement('a')
      a.href = url
      a.download = exportFilename(range, format, new Date())
      document.body.appendChild(a)
      a.click()
      a.remove()
      URL.revokeObjectURL(url)

      showToast(`Staženo ${rows.length} řádků (${workouts.length} tréninků)`)
      setOpen(false)
    } catch (e) {
      showToast(`Export selhal: ${e instanceof Error ? e.message : String(e)}`, 'error')
    } finally {
      setBusy(null)
    }
  }

  const fmtBtn = (format: 'csv' | 'json', label: string, hint: string, Icon: typeof FileSpreadsheet) => (
    <button
      onClick={() => run(format)}
      disabled={busy !== null}
      style={{
        flex: 1, minHeight: 88, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 6,
        borderRadius: 14, border: '1px solid var(--border)', background: 'var(--input-bg)', color: 'var(--text)',
        cursor: busy ? 'default' : 'pointer', opacity: busy && busy !== format ? 0.5 : 1, touchAction: 'manipulation', padding: 10,
      }}>
      <Icon size={22} color="#E8192C" />
      <span style={{ fontSize: 15, fontWeight: 700 }}>{busy === format ? 'Připravuji…' : label}</span>
      <span style={{ fontSize: 11, color: 'var(--muted)', textAlign: 'center' }}>{hint}</span>
    </button>
  )

  return (
    <>
      <button
        onClick={() => setOpen(true)}
        aria-label="Exportovat tréninková data"
        style={{
          minHeight: 44, display: 'flex', alignItems: 'center', gap: 7, padding: compact ? '0 10px' : '0 12px',
          borderRadius: 10, border: '1px solid var(--border)', background: 'transparent', color: 'var(--muted)',
          fontSize: 13, fontWeight: 600, cursor: 'pointer', touchAction: 'manipulation', flexShrink: 0,
        }}>
        <Download size={16} />{!compact && 'Export'}
      </button>

      <Modal isOpen={open} onClose={() => setOpen(false)} title="Export tréninků">
        <div style={{ fontSize: 13, color: 'var(--muted)', marginBottom: 14, lineHeight: 1.5 }}>
          Jedna plochá tabulka — řádek na sérii, sloupce tréninku se opakují. Otevřeš v Excelu nebo vložíš do chatu.
        </div>

        <div style={{ fontSize: 11, letterSpacing: 0.5, color: 'var(--muted)', fontWeight: 700, marginBottom: 8 }}>ROZSAH</div>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, minmax(0,1fr))', gap: 8, marginBottom: 18 }}>
          {RANGES.map(r => {
            const on = range === r
            return (
              <button key={r} onClick={() => setRange(r)} style={{
                minHeight: 44, borderRadius: 12, fontSize: 13, fontWeight: 600, cursor: 'pointer', touchAction: 'manipulation',
                border: `1px solid ${on ? '#E8192C' : 'var(--border)'}`,
                background: on ? '#E8192C' : 'var(--input-bg)',
                color: on ? '#fff' : 'var(--text)', padding: '0 6px',
              }}>{RANGE_LABEL[r]}</button>
            )
          })}
        </div>

        <div style={{ fontSize: 11, letterSpacing: 0.5, color: 'var(--muted)', fontWeight: 700, marginBottom: 8 }}>FORMÁT</div>
        <div style={{ display: 'flex', gap: 10 }}>
          {fmtBtn('csv', 'CSV', 'Excel, Tabulky', FileSpreadsheet)}
          {fmtBtn('json', 'JSON', 'Pro další zpracování', FileJson)}
        </div>
      </Modal>

      {toast && <Toast message={toast.message} type={toast.type} onClose={hideToast} />}
    </>
  )
}
