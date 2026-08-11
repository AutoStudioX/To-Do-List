'use client'
import { useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { isReadOnly, fmtTimeRange, type Habit } from '@/lib/habits'
import TimePicker from '@/components/TimePicker'
import HabitIcon, { ICON_CHOICES } from './HabitIcon'
import { Check } from 'lucide-react'

const DNY_LABELS = ['Po', 'Út', 'St', 'Čt', 'Pá', 'So', 'Ne']

/**
 * Nový návyk. Typ i ikona jsou button groupy, ne dropdowny — pravidlo projektu
 * pro pole s malým počtem voleb.
 */
export default function HabitForm({
  habit, poradi, onDone, onError,
}: {
  /** vyplněné = úprava, prázdné = nový návyk */
  habit?: Habit
  poradi: number
  onDone: (msg: string) => void
  onError: (msg: string) => void
}) {
  const edit = !!habit
  const [nazev, setNazev] = useState(habit?.nazev ?? '')
  const [podtitul, setPodtitul] = useState(habit?.podtitul ?? '')
  const [typ, setTyp] = useState<'bool' | 'cil'>(habit?.typ ?? 'bool')
  const [cil, setCil] = useState(habit?.cil != null ? String(habit.cil) : '2000')
  const [jednotka, setJednotka] = useState(habit?.jednotka ?? 'ml')
  const [krok, setKrok] = useState(habit?.krok != null ? String(habit.krok) : '250')
  const [ikona, setIkona] = useState<string>(habit?.ikona ?? 'circle')
  const [cas, setCas] = useState(habit?.cas ? habit.cas.slice(0, 5) : '')
  const [casDo, setCasDo] = useState(habit?.cas_do ? habit.cas_do.slice(0, 5) : '')
  const [dny, setDny] = useState<number[]>(habit?.dny ?? [])
  const [saving, setSaving] = useState(false)
  // Trénink je ano/ne řízené z tréninků — typ u něj měnit nedává smysl.
  const typLocked = !!habit && isReadOnly(habit)

  const cilNum = Number(cil.replace(',', '.'))
  const krokNum = Number(krok.replace(',', '.'))
  const cilOk = typ === 'bool' || (cilNum > 0 && krokNum > 0 && jednotka.trim().length > 0)
  const canSave = nazev.trim().length > 0 && cilOk && !saving

  async function save() {
    if (!canSave) return
    setSaving(true)
    const supabase = createClient()
    const { data: { session } } = await supabase.auth.getSession()
    const user = session?.user
    if (!user) { setSaving(false); onError('Nejsi přihlášený'); return }
    const payload = {
      nazev: nazev.trim(),
      podtitul: podtitul.trim() || null,
      typ,
      cil: typ === 'cil' ? cilNum : null,
      jednotka: typ === 'cil' ? jednotka.trim() : null,
      krok: typ === 'cil' ? krokNum : null,
      ikona,
      cas: cas.trim() ? cas.trim() : null,
      // Konec bez začátku není rozsah — a hlídá to i check v databázi.
      cas_do: cas.trim() && casDo.trim() ? casDo.trim() : null,
      // Prázdné pole ukládáme jako NULL — obojí znamená „každý den", ale NULL
      // je jednoznačnější a index s ním umí líp.
      dny: dny.length ? [...dny].sort((a, b) => a - b) : null,
    }
    const { error } = edit
      ? await supabase.from('habits').update(payload).eq('id', habit!.id)
      : await supabase.from('habits').insert({ ...payload, user_id: user.id, poradi })
    setSaving(false)
    if (error) { onError(`${edit ? 'Uložení' : 'Založení'} selhalo: ${error.message}`); return }
    onDone(`Návyk „${nazev.trim()}" ${edit ? 'upraven' : 'založen'}`)
  }

  const label = (t: string) => (
    <div style={{ fontSize: 11, letterSpacing: 0.6, color: 'var(--muted)', fontWeight: 700, marginBottom: 8 }}>{t}</div>
  )
  const input: React.CSSProperties = {
    width: '100%', minHeight: 48, padding: '0 14px', borderRadius: 12,
    border: '1px solid var(--border)', background: 'var(--input-bg)', color: 'var(--text)',
    fontSize: 16, boxSizing: 'border-box',
  }

  return (
    <div>
      {label('NÁZEV')}
      <input value={nazev} onChange={e => setNazev(e.target.value)} placeholder="Např. Čtení" maxLength={80} style={{ ...input, marginBottom: 16 }} />

      {label('PODTITUL (nepovinný)')}
      <input value={podtitul} onChange={e => setPodtitul(e.target.value)} placeholder="Např. 20 stran denně" maxLength={120} style={{ ...input, marginBottom: 16 }} />

      {label('TYP')}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8, marginBottom: 16 }}>
        {([['bool', 'Ano / ne'], ['cil', 'S cílem']] as const).map(([v, t]) => (
          <button key={v} onClick={() => !typLocked && setTyp(v)} disabled={typLocked} title={typLocked ? 'Trénink je řízený z tréninkové sekce' : undefined} style={{
            opacity: typLocked && typ !== v ? 0.4 : 1,
            cursor: typLocked ? 'default' : 'pointer',
            minHeight: 48, borderRadius: 12, fontSize: 15, fontWeight: 600, touchAction: 'manipulation',
            border: `1px solid ${typ === v ? 'var(--accent)' : 'var(--border)'}`,
            background: typ === v ? 'var(--accent)' : 'var(--input-bg)',
            color: typ === v ? '#fff' : 'var(--text)',
          }}>{t}</button>
        ))}
      </div>

      {typ === 'cil' && (
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 8, marginBottom: 16 }}>
          <div>
            {label('CÍL')}
            <input value={cil} onChange={e => setCil(e.target.value)} inputMode="decimal" style={input} />
          </div>
          <div>
            {label('JEDNOTKA')}
            <input value={jednotka} onChange={e => setJednotka(e.target.value)} maxLength={12} style={input} />
          </div>
          <div>
            {label('KROK')}
            <input value={krok} onChange={e => setKrok(e.target.value)} inputMode="decimal" style={input} />
          </div>
        </div>
      )}

      {label('ZAČÁTEK (nepovinný)')}
      <div style={{ marginBottom: 16 }}>
        <TimePicker value={cas} onChange={v => { setCas(v); if (!v) setCasDo('') }} />
      </div>

      {/* Konec dává smysl jen k začátku, jinak se nenabízí. */}
      {cas && <>
        {label('KONEC (nepovinný)')}
        <div style={{ marginBottom: 8 }}>
          <TimePicker value={casDo} onChange={setCasDo} />
        </div>
        <div style={{ fontSize: 12, color: 'var(--muted)', marginBottom: 16 }}>
          {casDo ? `Zobrazí se jako ${fmtTimeRange(cas, casDo)}.` : `Zobrazí se jako ${fmtTimeRange(cas, null)}.`}
        </div>
      </>}

      {label('PLATÍ VE DNY')}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, minmax(0,1fr))', gap: 6, marginBottom: 6 }}>
        {DNY_LABELS.map((d, i) => {
          const n = i + 1
          const on = dny.includes(n)
          return (
            <button key={n} onClick={() => setDny(p => on ? p.filter(x => x !== n) : [...p, n])} style={{
              minHeight: 44, borderRadius: 10, fontSize: 13, fontWeight: 600, cursor: 'pointer', touchAction: 'manipulation',
              border: `1px solid ${on ? 'var(--accent)' : 'var(--border)'}`,
              background: on ? 'var(--accent)' : 'var(--input-bg)',
              color: on ? '#fff' : 'var(--text)',
            }}>{d}</button>
          )
        })}
      </div>
      <div style={{ fontSize: 12, color: 'var(--muted)', marginBottom: 20 }}>
        {dny.length ? `Zobrazí se jen ve vybrané dny.` : 'Nevybráno nic = platí každý den.'}
      </div>

      {label('IKONA')}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(8, minmax(0,1fr))', gap: 6, marginBottom: 20 }}>
        {ICON_CHOICES.map(n => {
          const on = ikona === n
          return (
            <button key={n} onClick={() => setIkona(n)} aria-label={n} style={{
              height: 44, borderRadius: 10, display: 'flex', alignItems: 'center', justifyContent: 'center',
              cursor: 'pointer', touchAction: 'manipulation',
              border: `1px solid ${on ? 'var(--accent)' : 'var(--border)'}`,
              background: on ? 'rgba(232,25,44,0.12)' : 'var(--input-bg)',
              color: on ? 'var(--accent)' : 'var(--muted)',
            }}><HabitIcon name={n} size={18} /></button>
          )
        })}
      </div>

      <button onClick={save} disabled={!canSave} style={{
        width: '100%', minHeight: 52, background: 'var(--accent)', border: 'none', borderRadius: 12,
        color: '#fff', fontSize: 16, fontWeight: 700, cursor: canSave ? 'pointer' : 'default',
        opacity: canSave ? 1 : 0.55, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8,
      }}><Check size={18} /> {saving ? 'Ukládám…' : edit ? 'Uložit změny' : 'Založit návyk'}</button>

      {/* Skrývání je v režimu úprav na seznamu (ikona oka) — druhé místo pro
          totéž by jen mátlo, tady zůstává čisté uložení změn. */}
    </div>
  )
}
