'use client'
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { Task, Projekt } from '@/lib/types'
import Modal from '@/components/Modal'
import Select from '@/components/Select'
import PillGroup from '@/components/PillGroup'
import { priorityColors, taskStatusColors } from '@/lib/badgeColors'
import DatePicker from '@/components/DatePicker'
import { Toast, useToast } from '@/components/Toast'
import { useConfirm } from '@/components/ConfirmDialog'
import TaskRow from '@/components/TaskRow'
import { useLiveData } from '@/lib/useLiveData'
import { Plus, Search, X } from 'lucide-react'

// Below this many visible rows we skip the windowing machinery entirely — plain render is simpler and fast enough.
const VIRTUALIZE_THRESHOLD = 15
const ESTIMATED_ROW_HEIGHT = 96
const OVERSCAN_PX = 600

const inputStyle: React.CSSProperties = {
  width: '100%', background: 'var(--input-bg)', border: '1px solid var(--border)',
  borderRadius: 8, padding: '10px 14px', color: 'var(--text)', fontSize: 14, outline: 'none',
}
const labelStyle: React.CSSProperties = { fontSize: 13, color: 'var(--muted)', display: 'block', marginBottom: 6, fontWeight: 500 }
const todayISO = () => { const d = new Date(); return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}` }
const emptyForm = { nazev: '', priorita: 'Medium' as Task['priorita'], deadline: todayISO(), status: 'Todo' as Task['status'], projekt: '' }

export default function UkolyPage() {
  const [tasks, setTasks] = useState<Task[]>([])
  const [projekty, setProjekty] = useState<Projekt[]>([])
  const [loading, setLoading] = useState(false)
  const [modalOpen, setModalOpen] = useState(false)
  const [editTask, setEditTask] = useState<Task | null>(null)
  const [form, setForm] = useState(emptyForm)
  const [filterStatus, setFilterStatus] = useState('All')
  const [filterPriority, setFilterPriority] = useState('All')
  const [projektSearch, setProjektSearch] = useState('')
  const [hideDoneFromPill, setHideDoneFromPill] = useState(false)
  const [saving, setSaving] = useState(false)
  const [expandedId, setExpandedId] = useState<string | null>(null)
  const [formError, setFormError] = useState('')
  const [addingProjekt, setAddingProjekt] = useState(false)
  const [newProjektName, setNewProjektName] = useState('')
  const { toast, showToast, hideToast } = useToast()
  const { confirm, dialog: confirmDialog } = useConfirm()
  const backfillRef = useRef(false)

  const load = useCallback(async () => {
    const supabase = createClient()
    try {
      const { data: { session } } = await supabase.auth.getSession()
      const user = session?.user
      if (!user) return
      const [{ data: taskData }, { data: projektData }] = await Promise.all([
        supabase.from('ukoly').select('*').eq('user_id', user.id).order('created_at', { ascending: false }),
        supabase.from('projekty').select('*').eq('user_id', user.id).order('created_at', { ascending: true }),
      ])
      setTasks(taskData || [])

      // De-dupe any project rows that already exist (case-insensitive), keep the earliest
      const seen = new Map<string, Projekt>()
      const dupeIds: string[] = []
      for (const p of projektData || []) {
        const key = p.nazev.toLowerCase()
        if (seen.has(key)) dupeIds.push(p.id)
        else seen.set(key, p)
      }
      if (dupeIds.length > 0) {
        await supabase.from('projekty').delete().in('id', dupeIds)
      }
      let cleanProjekty = Array.from(seen.values())

      // Backfill: pull in any project names already used on tasks but not yet saved in projekty (once per mount)
      if (!backfillRef.current) {
        backfillRef.current = true
        const existingNames = new Set(cleanProjekty.map((p: Projekt) => p.nazev.toLowerCase()))
        const missing = Array.from(new Set(
          ((taskData || []) as Task[]).map(t => t.projekt).filter((p): p is string => !!p && !existingNames.has(p.toLowerCase()))
        ))
        if (missing.length > 0) {
          const { data: inserted } = await supabase.from('projekty').insert(missing.map(nazev => ({ user_id: user.id, nazev }))).select()
          cleanProjekty = [...cleanProjekty, ...(inserted || [])]
        }
      }

      // Prune: a project only exists as long as at least one task uses it.
      // Any projekt row not referenced by a task gets deleted from the table.
      const usedNames = new Set(
        ((taskData || []) as Task[]).map(t => (t.projekt || '').toLowerCase()).filter(Boolean)
      )
      const orphanIds = cleanProjekty.filter(p => !usedNames.has(p.nazev.toLowerCase())).map(p => p.id)
      if (orphanIds.length > 0) {
        await supabase.from('projekty').delete().in('id', orphanIds)
        cleanProjekty = cleanProjekty.filter(p => usedNames.has(p.nazev.toLowerCase()))
      }

      setProjekty(cleanProjekty.sort((a, b) => a.nazev.localeCompare(b.nazev)))
    } catch { } finally { setLoading(false) }
  }, [])

  useEffect(() => { load() }, [load])
  useEffect(() => {
    window.addEventListener('voice-data-changed', load)
    return () => window.removeEventListener('voice-data-changed', load)
  }, [load])
  useLiveData(['ukoly', 'projekty'], load)

  async function addProjekt() {
    const nazev = newProjektName.trim()
    if (!nazev) return
    const supabase = createClient()
    const { data: { session } } = await supabase.auth.getSession()
    const user = session?.user
    if (!user) return
    if (projekty.some(p => p.nazev.toLowerCase() === nazev.toLowerCase())) {
      setForm(f => ({ ...f, projekt: projekty.find(p => p.nazev.toLowerCase() === nazev.toLowerCase())!.nazev }))
      setNewProjektName(''); setAddingProjekt(false)
      return
    }
    const { data, error } = await supabase.from('projekty').insert({ user_id: user.id, nazev }).select().single()
    if (error) { showToast('Chyba: ' + error.message); return }
    setProjekty(prev => [...prev, data].sort((a, b) => a.nazev.localeCompare(b.nazev)))
    setForm(f => ({ ...f, projekt: data.nazev }))
    setNewProjektName(''); setAddingProjekt(false)
  }

  function openAdd() { setForm(emptyForm); setEditTask(null); setFormError(''); setModalOpen(true) }
  const openEdit = useCallback((t: Task) => {
    setForm({ nazev: t.nazev, priorita: t.priorita, deadline: t.deadline || '', status: t.status, projekt: t.projekt || '' })
    setEditTask(t); setModalOpen(true)
  }, [])

  async function save() {
    if (!form.nazev.trim()) { setFormError('Název je povinný'); return }
    const supabase = createClient()
    setSaving(true)
    const { data: { session } } = await supabase.auth.getSession()
    const user = session?.user
    if (!user) return
    const payload = { nazev: form.nazev, priorita: form.priorita, deadline: form.deadline || null, status: form.status, projekt: form.projekt || null }
    if (editTask) {
      await supabase.from('ukoly').update(payload).eq('id', editTask.id)
    } else {
      await supabase.from('ukoly').insert({ ...payload, user_id: user.id })
    }
    setSaving(false); setModalOpen(false); setFormError(''); load()
    showToast(editTask ? 'Úkol upraven' : 'Úkol přidán')
  }

  const deleteTask = useCallback(async (id: string) => {
    if (!await confirm('Smazat úkol?')) return
    await createClient().from('ukoly').delete().eq('id', id)
    load()
    showToast('Úkol smazán')
  }, [confirm, load, showToast])

  const toggleTask = useCallback(async (task: Task) => {
    const newStatus = task.status === 'Done' ? 'Todo' : 'Done'
    await createClient().from('ukoly').update({ status: newStatus }).eq('id', task.id)
    setTasks(prev => prev.map(t => t.id === task.id ? { ...t, status: newStatus } : t))
  }, [])

  const toggleExpand = useCallback((id: string) => {
    setExpandedId(prev => prev === id ? null : id)
  }, [])

  const priorityOrder: Record<string, number> = { High: 0, Medium: 1, Low: 2 }
  const projektSearchTrim = projektSearch.trim().toLowerCase()
  const filtered = useMemo(() => tasks
    .filter(t =>
      (filterStatus === 'All' || t.status === filterStatus) &&
      (filterPriority === 'All' || t.priorita === filterPriority) &&
      (projektSearchTrim === '' || (t.projekt || '').toLowerCase().includes(projektSearchTrim)) &&
      (!hideDoneFromPill || t.status !== 'Done')
    )
    .sort((a, b) => {
      const aDone = a.status === 'Done' ? 1 : 0
      const bDone = b.status === 'Done' ? 1 : 0
      if (aDone !== bDone) return aDone - bDone
      const pDiff = (priorityOrder[a.priorita] ?? 1) - (priorityOrder[b.priorita] ?? 1)
      if (pDiff !== 0) return pDiff
      const aD = a.deadline ? new Date(a.deadline).getTime() : Infinity
      const bD = b.deadline ? new Date(b.deadline).getTime() : Infinity
      return aD - bD
    }), [tasks, filterStatus, filterPriority, projektSearchTrim, hideDoneFromPill])
  const openCount = tasks.filter(t => t.status !== 'Done').length

  // Lightweight windowed rendering for long lists — only mounts rows near the viewport.
  // Row heights are measured after render (they vary with wrapped/expanded titles) and
  // cached per task id, so the spacer math stays accurate as the user scrolls/expands.
  const listContainerRef = useRef<HTMLDivElement>(null)
  const rowHeightsRef = useRef<Map<string, number>>(new Map())
  const [scrollTick, setScrollTick] = useState(0)
  const virtualize = filtered.length > VIRTUALIZE_THRESHOLD

  useEffect(() => {
    if (!virtualize) return
    let raf = 0
    const onScroll = () => {
      cancelAnimationFrame(raf)
      raf = requestAnimationFrame(() => setScrollTick(x => x + 1))
    }
    // The page's real scroll container is an ancestor (.main-content), not window — scroll
    // events don't bubble, so listen on the capture phase to catch them from any ancestor.
    window.addEventListener('scroll', onScroll, { passive: true, capture: true })
    onScroll()
    return () => {
      cancelAnimationFrame(raf)
      window.removeEventListener('scroll', onScroll, { capture: true } as EventListenerOptions)
    }
  }, [virtualize])

  const measureRow = useCallback((id: string) => (el: HTMLDivElement | null) => {
    if (!el) return
    const h = el.getBoundingClientRect().height
    if (h > 0 && rowHeightsRef.current.get(id) !== h) {
      rowHeightsRef.current.set(id, h)
      setScrollTick(x => x + 1)
    }
  }, [])

  const virtualRange = useMemo(() => {
    if (!virtualize) return { start: 0, end: filtered.length, offsetTop: 0, offsetBottom: 0 }
    const el = listContainerRef.current
    const scrollY = el ? -el.getBoundingClientRect().top : 0
    const viewportH = typeof window !== 'undefined' ? window.innerHeight : 900
    const heights = rowHeightsRef.current

    let acc = 0
    let start = filtered.length
    let end = filtered.length
    for (let i = 0; i < filtered.length; i++) {
      const h = heights.get(filtered[i].id) ?? ESTIMATED_ROW_HEIGHT
      if (start === filtered.length && acc + h >= scrollY - OVERSCAN_PX) start = i
      if (acc >= scrollY + viewportH + OVERSCAN_PX) { end = i; break }
      acc += h
    }
    const total = filtered.reduce((s, t) => s + (heights.get(t.id) ?? ESTIMATED_ROW_HEIGHT), 0)
    let offsetTop = 0
    for (let i = 0; i < start; i++) offsetTop += heights.get(filtered[i].id) ?? ESTIMATED_ROW_HEIGHT
    let offsetBottom = 0
    for (let i = end; i < filtered.length; i++) offsetBottom += heights.get(filtered[i].id) ?? ESTIMATED_ROW_HEIGHT
    return { start, end, offsetTop, offsetBottom, total }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [virtualize, filtered, scrollTick])

  const topProjekty = (() => {
    const counts = new Map<string, number>()
    for (const t of tasks) {
      if (!t.projekt) continue
      counts.set(t.projekt, (counts.get(t.projekt) || 0) + 1)
    }
    return Array.from(counts.entries())
      .sort((a, b) => b[1] - a[1])
      .slice(0, 5)
      .map(([nazev]) => nazev)
  })()

  const pillBase: React.CSSProperties = {
    padding: '5px 14px', borderRadius: 20, fontSize: 13, fontWeight: 500,
    cursor: 'pointer', border: '1px solid transparent', transition: 'all 0.15s', outline: 'none',
    touchAction: 'manipulation',
  }

  return (
    <div>
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 20 }}>
        <div style={{ display: 'flex', alignItems: 'baseline', gap: 10 }}>
          <h1 style={{ fontSize: 26, fontWeight: 700, color: 'var(--text)', margin: 0 }}>Úkoly</h1>
          <span style={{ fontSize: 14, color: 'var(--muted)', fontWeight: 500 }}>{openCount} otevřených</span>
        </div>
        <button onClick={openAdd} style={{ background: '#e53e3e', color: 'white', border: 'none', borderRadius: 10, padding: '10px 20px', fontSize: 14, fontWeight: 600, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 7, boxShadow: '0 4px 14px rgba(229,62,62,0.35)', touchAction: 'manipulation' }}>
          <Plus size={16} /> Přidat úkol
        </button>
      </div>

      {/* Filter pills */}
      <div className="filter-bar" style={{ display: 'flex', gap: 8, marginBottom: 12, flexWrap: 'wrap' }}>
        <div style={{ display: 'flex', gap: 6 }}>
          {(['All', 'Todo', 'In Progress', 'Done'] as const).map(s => {
            const activeColors: Record<string, { bg: string; color: string; border: string }> = {
              All: { bg: 'var(--text)', color: 'var(--bg)', border: 'var(--text)' },
              Todo: { bg: '#e5e7eb', color: '#374151', border: '#9ca3af' },
              'In Progress': { bg: '#dbeafe', color: '#1d4ed8', border: '#3b82f6' },
              Done: { bg: '#d1fae5', color: '#065f46', border: '#10b981' },
            }
            const active = filterStatus === s
            return (
              <button key={s} onClick={() => setFilterStatus(s)} style={{
                ...pillBase,
                background: active ? activeColors[s].bg : 'var(--card)',
                color: active ? activeColors[s].color : 'var(--muted)',
                border: `1px solid ${active ? activeColors[s].border : 'var(--border)'}`,
                fontWeight: active ? 600 : 500,
              }}>{s === 'All' ? 'Vše' : s}</button>
            )
          })}
        </div>
        <div className="desktop-only" style={{ width: 1, background: 'var(--border)', alignSelf: 'stretch' }} />
        <div style={{ display: 'flex', gap: 6 }}>
          {(['All', 'High', 'Medium', 'Low'] as const).map(p => {
            const priorityActive: Record<string, { bg: string; color: string; border: string }> = {
              All: { bg: 'var(--text)', color: 'var(--bg)', border: 'var(--text)' },
              High: { bg: '#fee2e2', color: '#c53030', border: '#e53e3e' },
              Medium: { bg: '#fef3c7', color: '#b45309', border: '#f59e0b' },
              Low: { bg: '#d1fae5', color: '#065f46', border: '#10b981' },
            }
            const active = filterPriority === p
            return (
              <button key={p} onClick={() => setFilterPriority(p)} style={{
                ...pillBase,
                background: active ? priorityActive[p].bg : 'var(--card)',
                color: active ? priorityActive[p].color : 'var(--muted)',
                border: `1px solid ${active ? priorityActive[p].border : 'var(--border)'}`,
                fontWeight: active ? 600 : 500,
              }}>{p === 'All' ? 'Vše' : p}</button>
            )
          })}
        </div>
      </div>

      {/* Project search + quick filters */}
      <div style={{ marginBottom: 20 }}>
        <div style={{ position: 'relative', maxWidth: 280, marginBottom: topProjekty.length > 0 ? 8 : 0 }}>
          <Search size={14} style={{ position: 'absolute', left: 12, top: '50%', transform: 'translateY(-50%)', color: 'var(--muted)', pointerEvents: 'none' }} />
          <input
            value={projektSearch}
            onChange={e => { setProjektSearch(e.target.value); setHideDoneFromPill(false) }}
            placeholder="Hledat projekt..."
            style={{ ...inputStyle, padding: '7px 30px', fontSize: 13, borderRadius: 20, touchAction: 'manipulation' }}
          />
          {projektSearch && (
            <button onClick={() => { setProjektSearch(''); setHideDoneFromPill(false) }} style={{ position: 'absolute', right: 8, top: '50%', transform: 'translateY(-50%)', background: 'transparent', border: 'none', cursor: 'pointer', color: 'var(--muted)', padding: 2, display: 'flex', touchAction: 'manipulation' }}>
              <X size={14} />
            </button>
          )}
        </div>
        {topProjekty.length > 0 && (
          <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
            {topProjekty.map(nazev => {
              const active = projektSearchTrim === nazev.toLowerCase()
              return (
                <button
                  key={nazev}
                  onClick={() => { setProjektSearch(active ? '' : nazev); setHideDoneFromPill(!active) }}
                  style={{
                    ...pillBase,
                    padding: '4px 12px', fontSize: 12,
                    background: active ? '#dbeafe' : 'var(--card)',
                    color: active ? '#1d4ed8' : 'var(--muted)',
                    border: `1px solid ${active ? '#3b82f6' : 'var(--border)'}`,
                    fontWeight: active ? 600 : 500,
                  }}
                >{nazev}</button>
              )
            })}
          </div>
        )}
      </div>

      {/* Cards */}
      {loading ? (
        <div style={{ color: 'var(--muted)', padding: 24 }}>Načítání...</div>
      ) : filtered.length === 0 ? (
        <div style={{ color: 'var(--muted)', padding: 32, textAlign: 'center', background: 'var(--card)', borderRadius: 14, border: '1px solid var(--border)' }}>Žádné úkoly</div>
      ) : (
        <div ref={listContainerRef}>
          {virtualize && virtualRange.offsetTop > 0 && <div style={{ height: virtualRange.offsetTop }} />}
          {filtered.slice(virtualRange.start, virtualize ? virtualRange.end : filtered.length).map((t, idx) => {
            const i = virtualRange.start + idx
            const isDivider = t.status === 'Done' && i > 0 && filtered[i - 1].status !== 'Done'
            return (
              <TaskRow
                key={t.id}
                task={t}
                expanded={expandedId === t.id}
                showDivider={isDivider}
                onToggleDone={toggleTask}
                onToggleExpand={toggleExpand}
                onEdit={openEdit}
                onDelete={deleteTask}
                rowRef={virtualize ? measureRow(t.id) : undefined}
              />
            )
          })}
          {virtualize && virtualRange.offsetBottom > 0 && <div style={{ height: virtualRange.offsetBottom }} />}
        </div>
      )}

      {toast && <Toast message={toast.message} type={toast.type} onClose={hideToast} />}
      {confirmDialog}

      <Modal isOpen={modalOpen} onClose={() => { setModalOpen(false); setFormError('') }} title={editTask ? 'Upravit úkol' : 'Nový úkol'}>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
          <div>
            <label style={labelStyle}>Název</label>
            <input style={{ ...inputStyle, borderColor: formError ? '#e53e3e' : undefined }} value={form.nazev} onChange={e => { setForm({ ...form, nazev: e.target.value }); setFormError('') }} autoFocus />
            {formError && <div style={{ fontSize: 12, color: '#e53e3e', marginTop: 4 }}>{formError}</div>}
          </div>
          <div><label style={labelStyle}>Priorita</label>
            <PillGroup value={form.priorita} onChange={val => setForm({ ...form, priorita: val })} options={[{ value: 'Low', label: 'Low', color: priorityColors.Low }, { value: 'Medium', label: 'Medium', color: priorityColors.Medium }, { value: 'High', label: 'High', color: priorityColors.High }]} />
          </div>
          <div><label style={labelStyle}>Deadline</label><DatePicker value={form.deadline} onChange={v => setForm({ ...form, deadline: v })} /></div>
          <div><label style={labelStyle}>Status</label>
            <PillGroup value={form.status} onChange={val => setForm({ ...form, status: val })} options={[{ value: 'Todo', label: 'Todo', color: taskStatusColors.Todo }, { value: 'In Progress', label: 'In Progress', color: taskStatusColors['In Progress'] }, { value: 'Done', label: 'Done', color: taskStatusColors.Done }]} />
          </div>
          <div>
            <label style={labelStyle}>Projekt</label>
            <div style={{ display: 'flex', gap: 8, alignItems: 'flex-start' }}>
              <div style={{ flex: 1 }}>
                <Select
                  value={form.projekt || ''}
                  onChange={val => setForm({ ...form, projekt: val })}
                  options={[{ value: '', label: '(žádný)' }, ...projekty.map(p => ({ value: p.nazev, label: p.nazev }))]}
                />
              </div>
              <button type="button" onClick={() => setAddingProjekt(a => !a)} style={{ background: 'var(--border)', border: 'none', borderRadius: 8, padding: '10px 12px', color: 'var(--text)', cursor: 'pointer', fontSize: 13, fontWeight: 500, whiteSpace: 'nowrap', display: 'flex', alignItems: 'center', gap: 4 }}>
                <Plus size={14} /> Přidat projekt
              </button>
            </div>
            {addingProjekt && (
              <div style={{ display: 'flex', gap: 8, marginTop: 8 }}>
                <input
                  style={inputStyle}
                  placeholder="Název nového projektu"
                  value={newProjektName}
                  onChange={e => setNewProjektName(e.target.value)}
                  onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); addProjekt() } }}
                  autoFocus
                />
                <button type="button" onClick={addProjekt} style={{ background: '#e53e3e', border: 'none', borderRadius: 8, padding: '10px 16px', color: 'white', cursor: 'pointer', fontSize: 13, fontWeight: 600, whiteSpace: 'nowrap' }}>
                  Uložit
                </button>
              </div>
            )}
          </div>
          <div style={{ display: 'flex', gap: 12, justifyContent: 'flex-end', marginTop: 8 }}>
            <button onClick={() => setModalOpen(false)} style={{ background: 'transparent', border: '1px solid var(--border)', borderRadius: 8, padding: '10px 16px', color: 'var(--text)', cursor: 'pointer', fontSize: 14 }}>Zrušit</button>
            <button onClick={save} disabled={saving} style={{ background: '#e53e3e', border: 'none', borderRadius: 8, padding: '10px 20px', color: 'white', cursor: 'pointer', fontSize: 14, fontWeight: 600, opacity: saving ? 0.6 : 1 }}>
              {saving ? 'Ukládám...' : 'Uložit'}
            </button>
          </div>
        </div>
      </Modal>

      <style>{`
        @media (hover: hover) {
          .task-row:hover { box-shadow: 0 8px 24px rgba(0,0,0,0.14); transform: translateY(-2px); }
        }
        .task-row { box-shadow: 0 2px 8px rgba(0,0,0,0.06); transition: box-shadow 0.18s, transform 0.18s; }
      `}</style>
    </div>
  )
}
