'use client'
import { useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { isReadOnly, fmtTimeRange, activeDays, dayWord, type Habit, type CasRozsah } from '@/lib/habits'
import TimePicker from '@/components/TimePicker'
import HabitIcon, { ICON_CHOICES } from './HabitIcon'
import { Check, ChevronDown, ChevronUp, RotateCcw } from 'lucide-react'

const DNY_LABELS = ['Po', 'Út', 'St', 'Čt', 'Pá', 'So', 'Ne']

/**
 * Nový návyk. Typ i ikona jsou button groupy, ne dropdowny — pravidlo projektu
 * pro pole s malým počtem voleb.
 */
export default function HabitForm({
  habit, casyDnu, poradi, onDone, onError,
}: {
  /** vyplněné = úprava, prázdné = nový návyk */
  habit?: Habit
  /** denní výjimky z výchozího času, den (1=Po) → rozsah */
  casyDnu?: Record<number, CasRozsah>
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

  // Denní výjimky. Den bez záznamu jede podle výchozího času — ukládá se jen
  // to, co se od něj liší (viz migrace 0018).
  const [denCas, setDenCas] = useState<Record<number, { od: string; do: string }>>(() => {
    const out: Record<number, { od: string; do: string }> = {}
    for (const [d, c] of Object.entries(casyDnu ?? {})) {
      if (c.cas) out[Number(d)] = { od: c.cas.slice(0, 5), do: c.cas_do ? c.cas_do.slice(0, 5) : '' }
    }
    return out
  })
  const [perDay, setPerDay] = useState(Object.keys(casyDnu ?? {}).length > 0)
  // Rozbalený je vždy nejvýš jeden den. Sedm dnů se dvěma TimePickery naráz
  // se na 390px nedá projít.
  const [openDen, setOpenDen] = useState<number | null>(null)

  // Trénink je ano/ne řízené z tréninků — typ u něj měnit nedává smysl.
  const typLocked = !!habit && isReadOnly(habit)

  // Nabízí se jen dny, kdy návyk platí — nastavovat čas na den, kdy se návyk
  // vůbec neukáže, nedává smysl. Odškrtnutí dne níž tedy jeho výjimku i skryje
  // a při uložení smaže.
  const platneDny = activeDays({ dny })
  const dnyVyjimky = perDay ? platneDny.filter(d => denCas[d]?.od) : []
  // Konec dřív než začátek zamítne i check v databázi — ať to uživatel vidí
  // na formuláři, ne až jako hlášku z Postgresu.
  const spatnyDen = dnyVyjimky.find(d => denCas[d].do && denCas[d].do <= denCas[d].od)

  const cilNum = Number(cil.replace(',', '.'))
  const krokNum = Number(krok.replace(',', '.'))
  const cilOk = typ === 'bool' || (cilNum > 0 && krokNum > 0 && jednotka.trim().length > 0)
  const canSave = nazev.trim().length > 0 && cilOk && !spatnyDen && !saving

  const setDenOd = (d: number, v: string) => setDenCas(p => {
    const next = { ...p }
    // Bez začátku není výjimka — den se vrací k výchozímu času.
    if (!v) delete next[d]
    else next[d] = { od: v, do: p[d]?.do ?? '' }
    return next
  })
  const setDenDo = (d: number, v: string) =>
    setDenCas(p => (p[d] ? { ...p, [d]: { ...p[d], do: v } } : p))

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
    const { data, error } = edit
      ? await supabase.from('habits').update(payload).eq('id', habit!.id).select('id').single()
      : await supabase.from('habits').insert({ ...payload, user_id: user.id, poradi }).select('id').single()
    if (error) {
      setSaving(false)
      onError(`${edit ? 'Uložení' : 'Založení'} selhalo: ${error.message}`)
      return
    }

    // Denní časy až po návyku — nový návyk teprve teď má `id`.
    //
    // Nejdřív se zapíšou výjimky, které mají platit, a teprve pak se mažou
    // zbylé. Opačné pořadí by při chybě uprostřed nechalo návyk bez časů;
    // takhle nejhůř zůstane výjimka navíc, která je vidět a jde smazat.
    const id = ((data as { id: string } | null)?.id) ?? habit?.id
    if (id) {
      const rows = dnyVyjimky.map(d => ({
        habit_id: id, den: d, cas_od: denCas[d].od, cas_do: denCas[d].do || null,
      }))
      const chyba = rows.length
        ? (await supabase.from('habit_times').upsert(rows, { onConflict: 'habit_id,den' })).error
          ?? (await supabase.from('habit_times').delete().eq('habit_id', id)
            .not('den', 'in', `(${dnyVyjimky.join(',')})`)).error
        : (await supabase.from('habit_times').delete().eq('habit_id', id)).error
      if (chyba) {
        setSaving(false)
        onError(`Návyk uložen, ale denní časy ne: ${chyba.message}`)
        return
      }
    }

    setSaving(false)
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

      {label('VÝCHOZÍ ZAČÁTEK (nepovinný)')}
      <div style={{ marginBottom: 16 }}>
        <TimePicker value={cas} onChange={v => {
          setCas(v)
          // Bez výchozího času není co přepisovat — denní výjimky jdou pryč
          // s ním, ať nezůstanou viset ve stavu, který není nikde vidět.
          if (!v) { setCasDo(''); setPerDay(false); setDenCas({}); setOpenDen(null) }
        }} />
      </div>

      {/* Konec dává smysl jen k začátku, jinak se nenabízí. */}
      {cas && <>
        {label('VÝCHOZÍ KONEC (nepovinný)')}
        <div style={{ marginBottom: 8 }}>
          <TimePicker value={casDo} onChange={setCasDo} />
        </div>
        <div style={{ fontSize: 12, color: 'var(--muted)', marginBottom: 16 }}>
          {`Zobrazí se jako ${fmtTimeRange(cas, casDo || null)}${perDay && dnyVyjimky.length ? ' ve dnech bez vlastního času.' : '.'}`}
        </div>

        {/* Jiný čas v některé dny. Focus v úterý 10:00–13:00 a ve středu
            7:00–10:00 je pořád JEDEN návyk — tři návyky se stejným jménem by
            udělaly bordel v Přehledu. */}
        <button
          type="button" role="switch" aria-checked={perDay}
          onClick={() => { setPerDay(v => !v); setOpenDen(null) }}
          style={{
            width: '100%', minHeight: 52, marginBottom: perDay ? 12 : 20,
            display: 'flex', alignItems: 'center', gap: 12, padding: '0 14px',
            borderRadius: 12, cursor: 'pointer', touchAction: 'manipulation',
            border: `1px solid ${perDay ? 'var(--accent)' : 'var(--border)'}`,
            background: 'var(--input-bg)', color: 'var(--text)',
            fontSize: 15, fontWeight: 500, textAlign: 'left',
          }}
        >
          <span style={{
            width: 42, height: 24, flexShrink: 0, borderRadius: 99, padding: 3,
            display: 'flex', justifyContent: perDay ? 'flex-end' : 'flex-start',
            background: perDay ? 'var(--accent)' : 'var(--border)',
            transition: 'background .14s ease-out',
          }}>
            <span style={{ width: 18, height: 18, borderRadius: 99, background: '#fff' }} />
          </span>
          <span style={{ minWidth: 0 }}>Jiný čas v některé dny</span>
        </button>

        {perDay && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6, marginBottom: 20 }}>
            {platneDny.map(d => {
              const own = denCas[d]
              const open = openDen === d
              return (
                <div key={d} style={{
                  borderRadius: 12, border: `1px solid ${own ? 'var(--accent)' : 'var(--border)'}`,
                  background: 'var(--input-bg)', overflow: 'hidden',
                }}>
                  <button
                    type="button" onClick={() => setOpenDen(open ? null : d)}
                    aria-expanded={open}
                    style={{
                      width: '100%', minHeight: 52, display: 'flex', alignItems: 'center', gap: 10,
                      padding: '0 14px', border: 'none', background: 'transparent',
                      color: 'var(--text)', cursor: 'pointer', touchAction: 'manipulation', textAlign: 'left',
                    }}
                  >
                    <span style={{ width: 26, flexShrink: 0, fontSize: 14, fontWeight: 700 }}>{DNY_LABELS[d - 1]}</span>
                    <span style={{
                      flex: 1, minWidth: 0, fontSize: 14,
                      color: own ? 'var(--text)' : 'var(--muted)',
                      overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                    }}>
                      {own ? fmtTimeRange(own.od, own.do || null) : `výchozí · ${fmtTimeRange(cas, casDo || null)}`}
                    </span>
                    {open ? <ChevronUp size={16} style={{ flexShrink: 0, color: 'var(--muted)' }} />
                      : <ChevronDown size={16} style={{ flexShrink: 0, color: 'var(--muted)' }} />}
                  </button>

                  {open && (
                    <div style={{ padding: '0 14px 14px', display: 'flex', flexDirection: 'column', gap: 10 }}>
                      {label('ZAČÁTEK')}
                      {/* „Bez času" v pickeru = zpátky na výchozí, ne návyk bez
                          času — den se prostě přestane lišit. */}
                      <TimePicker value={own?.od ?? ''} onChange={v => setDenOd(d, v)} />
                      {own?.od && <>
                        {label('KONEC (nepovinný)')}
                        <TimePicker value={own.do} onChange={v => setDenDo(d, v)} />
                      </>}
                      {own?.od && own.do && own.do <= own.od && (
                        <div style={{ fontSize: 12, color: 'var(--accent)' }}>
                          Konec musí být později než začátek.
                        </div>
                      )}
                      {own && (
                        <button
                          type="button" onClick={() => { setDenOd(d, ''); setOpenDen(null) }}
                          style={{
                            alignSelf: 'flex-start', minHeight: 44, padding: '0 14px', borderRadius: 10,
                            display: 'flex', alignItems: 'center', gap: 8,
                            border: '1px solid var(--border)', background: 'transparent',
                            color: 'var(--muted)', fontSize: 14, cursor: 'pointer', touchAction: 'manipulation',
                          }}
                        ><RotateCcw size={15} /> Zpět na výchozí</button>
                      )}
                    </div>
                  )}
                </div>
              )
            })}
            <div style={{ fontSize: 12, color: 'var(--muted)', marginTop: 2 }}>
              {dnyVyjimky.length
                ? `Vlastní čas má ${dnyVyjimky.length} ${dayWord(dnyVyjimky.length)}, zbytek jede podle výchozího.`
                : 'Zatím nic — všechny dny jedou podle výchozího času.'}
            </div>
          </div>
        )}
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
