'use client'
import { useEffect, useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { TimeBlock } from '@/lib/types'
import Modal from '@/components/Modal'
import { Plus, Trash2, Pencil } from 'lucide-react'

const DAYS = ['Pondělí', 'Úterý', 'Středa', 'Čtvrtek', 'Pátek', 'Sobota', 'Neděle']
const HOURS = Array.from({ length: 17 }, (_, i) => i + 6) // 6-22
const COLORS = ['#3b82f6', '#8b5cf6', '#10b981', '#f59e0b', '#ef4444', '#ec4899']

const inputStyle: React.CSSProperties = {
  width: '100%', background: '#0f0f0f', border: '1px solid #2a2a2a',
  borderRadius: 8, padding: '10px 14px', color: 'white', fontSize: 14, outline: 'none',
}
const labelStyle: React.CSSProperties = { fontSize: 13, color: '#9ca3af', display: 'block', marginBottom: 6 }

function timeToMinutes(t: string): number {
  const [h, m] = t.split(':').map(Number)
  return h * 60 + m
}

export default function CasovyPlanPage() {
  const [blocks, setBlocks] = useState<TimeBlock[]>([])
  const [loading, setLoading] = useState(true)
  const [modal, setModal] = useState(false)
  const [editBlock, setEditBlock] = useState<TimeBlock | null>(null)
  const [form, setForm] = useState({ nazev: '', den: 0, od: '09:00', do: '10:00', barva: '#3b82f6', kategorie: '' })
  const [saving, setSaving] = useState(false)
  const supabase = createClient()

  async function load() {
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return
    const { data } = await supabase.from('casovy_plan').select('*').eq('user_id', user.id)
    setBlocks(data || [])
    setLoading(false)
  }

  useEffect(() => { load() }, [])

  function openAdd(den?: number, hour?: number) {
    setForm({
      nazev: '', den: den ?? 0,
      od: hour !== undefined ? `${hour.toString().padStart(2, '0')}:00` : '09:00',
      do: hour !== undefined ? `${(hour + 1).toString().padStart(2, '0')}:00` : '10:00',
      barva: '#3b82f6', kategorie: ''
    })
    setEditBlock(null); setModal(true)
  }

  function openEdit(b: TimeBlock) {
    setForm({ nazev: b.nazev, den: b.den, od: b.od, do: b.do, barva: b.barva, kategorie: b.kategorie })
    setEditBlock(b); setModal(true)
  }

  async function save() {
    setSaving(true)
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return
    const payload = { nazev: form.nazev, den: form.den, od: form.od, do: form.do, barva: form.barva, kategorie: form.kategorie }
    if (editBlock) {
      await supabase.from('casovy_plan').update(payload).eq('id', editBlock.id)
    } else {
      await supabase.from('casovy_plan').insert({ ...payload, user_id: user.id })
    }
    setSaving(false); setModal(false); load()
  }

  async function deleteBlock(id: string) {
    if (!confirm('Smazat blok?')) return
    await supabase.from('casovy_plan').delete().eq('id', id); load()
  }

  const CELL_HEIGHT = 48 // px per hour
  const START_HOUR = 6
  const END_HOUR = 22

  if (loading) return <div style={{ color: '#6b7280', padding: 24 }}>Načítání...</div>

  return (
    <div>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 24 }}>
        <h1 style={{ fontSize: 26, fontWeight: 700 }}>Časový plán</h1>
        <button onClick={() => openAdd()} style={{ background: '#3b82f6', color: 'white', border: 'none', borderRadius: 8, padding: '10px 16px', fontSize: 14, fontWeight: 600, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 6 }}>
          <Plus size={16} /> Přidat blok
        </button>
      </div>

      <div style={{ background: '#1a1a1a', border: '1px solid #2a2a2a', borderRadius: 12, overflow: 'auto' }}>
        <div style={{ display: 'grid', gridTemplateColumns: '60px repeat(7, 1fr)', minWidth: 700 }}>
          {/* Header */}
          <div style={{ background: '#2a2a2a', padding: '12px 8px', borderBottom: '1px solid #2a2a2a', borderRight: '1px solid #2a2a2a' }} />
          {DAYS.map((d, i) => (
            <div key={i} style={{ background: '#2a2a2a', padding: '12px 8px', textAlign: 'center', fontSize: 13, fontWeight: 500, color: '#9ca3af', borderBottom: '1px solid #2a2a2a', borderRight: i < 6 ? '1px solid #2a2a2a' : 'none' }}>
              {d}
            </div>
          ))}

          {/* Time rows */}
          {HOURS.map(hour => (
            <>
              <div key={`hour-${hour}`} style={{ padding: '0 8px', display: 'flex', alignItems: 'flex-start', justifyContent: 'flex-end', fontSize: 11, color: '#6b7280', borderBottom: '1px solid #2a2a2a', borderRight: '1px solid #2a2a2a', height: CELL_HEIGHT, paddingTop: 4 }}>
                {hour.toString().padStart(2, '0')}:00
              </div>
              {DAYS.map((_, dayIdx) => {
                const dayBlocks = blocks.filter(b => b.den === dayIdx).filter(b => {
                  const startMin = timeToMinutes(b.od)
                  const hourMin = hour * 60
                  return startMin >= hourMin && startMin < hourMin + 60
                })
                return (
                  <div key={`cell-${hour}-${dayIdx}`} style={{ position: 'relative', borderBottom: '1px solid #2a2a2a', borderRight: dayIdx < 6 ? '1px solid #2a2a2a' : 'none', height: CELL_HEIGHT, cursor: 'pointer' }}
                    onClick={() => openAdd(dayIdx, hour)}
                  >
                    {dayBlocks.map(b => {
                      const startMin = timeToMinutes(b.od)
                      const endMin = timeToMinutes(b.do)
                      const topOffset = ((startMin - hour * 60) / 60) * CELL_HEIGHT
                      const height = Math.max(((endMin - startMin) / 60) * CELL_HEIGHT, 24)
                      return (
                        <div key={b.id}
                          onClick={e => { e.stopPropagation(); openEdit(b) }}
                          style={{
                            position: 'absolute', top: topOffset, left: 2, right: 2,
                            height, background: b.barva + '33', border: `1px solid ${b.barva}`,
                            borderRadius: 4, padding: '2px 4px', overflow: 'hidden', cursor: 'pointer', zIndex: 1,
                          }}>
                          <div style={{ fontSize: 11, fontWeight: 600, color: b.barva, lineHeight: 1.2 }}>{b.nazev}</div>
                          <div style={{ fontSize: 10, color: '#9ca3af' }}>{b.od}–{b.do}</div>
                        </div>
                      )
                    })}
                  </div>
                )
              })}
            </>
          ))}
        </div>
      </div>

      <Modal isOpen={modal} onClose={() => setModal(false)} title={editBlock ? 'Upravit blok' : 'Nový časový blok'}>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
          <div><label style={labelStyle}>Název</label><input style={inputStyle} value={form.nazev} onChange={e => setForm({ ...form, nazev: e.target.value })} /></div>
          <div>
            <label style={labelStyle}>Den</label>
            <select style={{ ...inputStyle, cursor: 'pointer' }} value={form.den} onChange={e => setForm({ ...form, den: Number(e.target.value) })}>
              {DAYS.map((d, i) => <option key={i} value={i}>{d}</option>)}
            </select>
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
            <div><label style={labelStyle}>Od</label><input type="time" style={inputStyle} value={form.od} onChange={e => setForm({ ...form, od: e.target.value })} /></div>
            <div><label style={labelStyle}>Do</label><input type="time" style={inputStyle} value={form.do} onChange={e => setForm({ ...form, do: e.target.value })} /></div>
          </div>
          <div><label style={labelStyle}>Kategorie</label><input style={inputStyle} value={form.kategorie} onChange={e => setForm({ ...form, kategorie: e.target.value })} /></div>
          <div>
            <label style={labelStyle}>Barva</label>
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
              {COLORS.map(c => (
                <button key={c} onClick={() => setForm({ ...form, barva: c })} style={{
                  width: 32, height: 32, borderRadius: 6, background: c, border: form.barva === c ? '3px solid white' : '2px solid transparent', cursor: 'pointer',
                }} />
              ))}
            </div>
          </div>
          <div style={{ display: 'flex', gap: 12, justifyContent: 'flex-end' }}>
            {editBlock && (
              <button onClick={() => { deleteBlock(editBlock.id); setModal(false) }} style={{ background: 'transparent', border: '1px solid #ef444444', borderRadius: 8, padding: '10px 16px', color: '#ef4444', cursor: 'pointer', fontSize: 14 }}>Smazat</button>
            )}
            <button onClick={() => setModal(false)} style={{ background: 'transparent', border: '1px solid #2a2a2a', borderRadius: 8, padding: '10px 16px', color: 'white', cursor: 'pointer', fontSize: 14 }}>Zrušit</button>
            <button onClick={save} disabled={saving || !form.nazev} style={{ background: '#3b82f6', border: 'none', borderRadius: 8, padding: '10px 16px', color: 'white', cursor: 'pointer', fontSize: 14, fontWeight: 600, opacity: saving || !form.nazev ? 0.6 : 1 }}>
              {saving ? 'Ukládám...' : 'Uložit'}
            </button>
          </div>
        </div>
      </Modal>
    </div>
  )
}
