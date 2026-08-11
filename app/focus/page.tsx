'use client'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { useConfirm } from '@/components/ConfirmDialog'
import { Toast, useToast } from '@/components/Toast'
import {
  FOCUS_PRESETS, PROGRESS_STEPS, ACTIVE_STATES, MAX_FOCUS_MIN,
  elapsedSec, remainingSec, isExpired, pauseDebtSec, fmtClock, fmtLength,
  clampMinutes, clampProgress, needsFinalAnswer, type FocusSession,
} from '@/lib/focus'
import { Crosshair, Play, Pause, Check, X, Bell, BellOff, ChevronDown } from 'lucide-react'

const ACCENT = '#E8192C'

/**
 * Krátký dvojtón na konci focusu. Web Audio, ne zvukový soubor — nic se
 * nestahuje, funguje offline a v PWA.
 */
function playChime() {
  try {
    const Ctx = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext
    if (!Ctx) return
    const ctx = new Ctx()
    const now = ctx.currentTime
    ;[880, 1174.7].forEach((freq, i) => {
      const osc = ctx.createOscillator()
      const gain = ctx.createGain()
      osc.type = 'sine'
      osc.frequency.value = freq
      const t = now + i * 0.28
      gain.gain.setValueAtTime(0.0001, t)
      gain.gain.exponentialRampToValueAtTime(0.25, t + 0.02)
      gain.gain.exponentialRampToValueAtTime(0.0001, t + 0.5)
      osc.connect(gain).connect(ctx.destination)
      osc.start(t)
      osc.stop(t + 0.55)
    })
    setTimeout(() => ctx.close().catch(() => {}), 1500)
  } catch { /* zvuk je bonus, ne podmínka */ }
}

export default function FocusPage() {
  const supabase = useMemo(() => createClient(), [])
  const [session, setSession] = useState<FocusSession | null>(null)
  const [loading, setLoading] = useState(true)
  const [nowMs, setNowMs] = useState(() => Date.now())
  const [isMobile, setIsMobile] = useState(false)

  // založení
  const [cil, setCil] = useState('')
  const [minutes, setMinutes] = useState<number>(FOCUS_PRESETS[0])
  const [customOpen, setCustomOpen] = useState(false)
  const [customVal, setCustomVal] = useState('30')
  const [starting, setStarting] = useState(false)

  const [notifyOn, setNotifyOn] = useState(false)
  const [editOpen, setEditOpen] = useState(false)
  const { confirm, dialog } = useConfirm()
  const { toast, showToast, hideToast } = useToast()

  useEffect(() => {
    const check = () => setIsMobile(window.innerWidth <= 768)
    check()
    window.addEventListener('resize', check)
    return () => window.removeEventListener('resize', check)
  }, [])

  useEffect(() => {
    if (typeof Notification !== 'undefined') setNotifyOn(Notification.permission === 'granted')
  }, [])

  const load = useCallback(async () => {
    const { data: { session: auth } } = await supabase.auth.getSession()
    const user = auth?.user
    if (!user) { setLoading(false); return }
    const { data, error } = await supabase
      .from('focus_sessions')
      .select('*')
      .eq('user_id', user.id)
      .in('stav', ACTIVE_STATES)
      .order('started_at', { ascending: false })
      .limit(1)
    if (error) { showToast(`Načtení selhalo: ${error.message}`, 'error'); setLoading(false); return }
    setSession(((data || [])[0] as FocusSession) ?? null)
    setLoading(false)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [supabase])

  useEffect(() => { load() }, [load])

  // Jen překreslování. Kolik zbývá, se vždycky počítá z `started_at` — tenhle
  // interval se na to neptá a jeho výpadek (zavřená appka, uspaný telefon)
  // proto nic nerozbije.
  useEffect(() => {
    const t = setInterval(() => setNowMs(Date.now()), 1000)
    return () => clearInterval(t)
  }, [])

  // Přechod „doběhlo" — jednou, i když se to stane při načtení po otevření appky.
  const firedRef = useRef<string | null>(null)
  useEffect(() => {
    if (!session || session.stav !== 'running') return
    if (!isExpired(session, nowMs)) return
    if (firedRef.current === session.id) return
    firedRef.current = session.id
    ;(async () => {
      // Na 100 % už není co doplňovat — focus se rovnou uzavře.
      const done = session.progress >= 100
      const { error } = await supabase.from('focus_sessions')
        .update({ stav: done ? 'done' : 'finished', ended_at: new Date().toISOString() }).eq('id', session.id)
      if (error) { showToast(`Uložení selhalo: ${error.message}`, 'error'); return }
      if (done) { setSession(null); showToast('Focus dokončen — 100 %') }
      else setSession(s => s ? { ...s, stav: 'finished' } : s)
      playChime()
      try {
        if (typeof Notification !== 'undefined' && Notification.permission === 'granted') {
          new Notification('Focus dokončen', { body: session.cil, tag: 'focus-' + session.id })
        }
      } catch { /* upozornění je bonus */ }
    })()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [session, nowMs])

  // ---------- akce ----------
  async function start() {
    const goal = cil.trim()
    if (!goal) { showToast('Napiš, co chceš stihnout', 'error'); return }
    setStarting(true)
    const { data: { session: auth } } = await supabase.auth.getSession()
    const user = auth?.user
    if (!user) { setStarting(false); return }

    // O svolení k upozornění se říká při gestu uživatele, jinak ho prohlížeč zahodí.
    try {
      if (typeof Notification !== 'undefined' && Notification.permission === 'default') {
        const p = await Notification.requestPermission()
        setNotifyOn(p === 'granted')
      }
    } catch { /* bez upozornění to jede dál */ }

    const { data, error } = await supabase.from('focus_sessions')
      .insert({ user_id: user.id, cil: goal, duration_min: clampMinutes(minutes) })
      .select().single()
    setStarting(false)
    if (error) { showToast(`Spuštění selhalo: ${error.message}`, 'error'); return }
    firedRef.current = null
    setSession(data as FocusSession)
    setCil('')
    setNowMs(Date.now())
    showToast(`Focus na ${fmtLength(clampMinutes(minutes))} běží`)
  }

  // Progres se ukládá se zpožděním — posuvník jinak pošle desítky zápisů za vteřinu.
  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  function setProgress(v: number) {
    const p = clampProgress(v)
    setSession(s => s ? { ...s, progress: p } : s)
    if (saveTimer.current) clearTimeout(saveTimer.current)
    const id = session?.id
    if (!id) return
    saveTimer.current = setTimeout(async () => {
      const { error } = await supabase.from('focus_sessions').update({ progress: p }).eq('id', id)
      if (error) showToast(`Uložení progresu selhalo: ${error.message}`, 'error')
    }, 500)
  }
  useEffect(() => () => { if (saveTimer.current) clearTimeout(saveTimer.current) }, [])

  async function pause() {
    if (!session) return
    const pausedAt = new Date().toISOString()
    const { error } = await supabase.from('focus_sessions')
      .update({ stav: 'paused', paused_at: pausedAt }).eq('id', session.id)
    if (error) { showToast(`Pauza selhala: ${error.message}`, 'error'); return }
    setSession(s => s ? { ...s, stav: 'paused', paused_at: pausedAt } : s)
  }

  async function resume() {
    if (!session) return
    const debt = pauseDebtSec(session.paused_at, Date.now())
    const next = { stav: 'running' as const, paused_at: null, paused_sec: session.paused_sec + debt }
    const { error } = await supabase.from('focus_sessions').update(next).eq('id', session.id)
    if (error) { showToast(`Pokračování selhalo: ${error.message}`, 'error'); return }
    setSession(s => s ? { ...s, ...next } : s)
    setNowMs(Date.now())
  }

  async function cancel() {
    if (!session) return
    if (!await confirm(`Zrušit focus „${session.cil}"? Nejde to vrátit.`, 'Zrušit focus')) return
    const { error } = await supabase.from('focus_sessions')
      .update({ stav: 'cancelled', ended_at: new Date().toISOString() }).eq('id', session.id)
    if (error) { showToast(`Zrušení selhalo: ${error.message}`, 'error'); return }
    setSession(null)
    showToast('Focus zrušen')
  }

  /** „Hotovo" ukončí dřív. Na 100 % není co doplňovat, jinak se doptáme. */
  async function finishEarly() {
    if (!session) return
    const done = session.progress >= 100
    const { error } = await supabase.from('focus_sessions')
      .update({ stav: done ? 'done' : 'finished', ended_at: new Date().toISOString() }).eq('id', session.id)
    if (error) { showToast(`Ukončení selhalo: ${error.message}`, 'error'); return }
    if (done) { setSession(null); showToast('Focus hotový — 100 %') }
    else setSession(s => s ? { ...s, stav: 'finished' } : s)
  }

  async function confirmFinal() {
    if (!session) return
    const { error } = await supabase.from('focus_sessions')
      .update({ stav: 'done', progress: session.progress }).eq('id', session.id)
    if (error) { showToast(`Uložení selhalo: ${error.message}`, 'error'); return }
    setSession(null)
    showToast(`Focus uzavřen na ${session.progress} %`)
  }

  // ---------- odvozené ----------
  const remain = session ? remainingSec(session, nowMs) : 0
  const elapsed = session ? elapsedSec(session, nowMs) : 0
  const timeFrac = session ? Math.min(1, elapsed / (session.duration_min * 60)) : 0

  // ---------- kusy UI ----------
  const bigNumber = (text: string, sub: string, dim = false) => (
    <div style={{ textAlign: 'center' }}>
      <div style={{
        fontSize: isMobile ? 68 : 92, fontWeight: 800, lineHeight: 1,
        letterSpacing: -2, color: dim ? 'var(--muted)' : 'var(--text)',
        fontVariantNumeric: 'tabular-nums',
      }}>{text}</div>
      <div style={{ fontSize: 13, color: 'var(--muted)', marginTop: 8 }}>{sub}</div>
    </div>
  )

  /**
   * `collapsible` — na běžícím focusu je editace schovaná pod tlačítkem, ať
   * obrazovku neplní ovládání, na které se většinu času nesahá. Na finální
   * obrazovce je otevřená rovnou, protože kvůli ní tam ta obrazovka je.
   */
  const progressControl = (value: number, onChange: (v: number) => void, collapsible = false) => {
    const open = !collapsible || editOpen
    return (
      <div>
        <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', marginBottom: 8 }}>
          <span style={{ fontSize: 11, letterSpacing: 0.6, color: 'var(--muted)', fontWeight: 700 }}>JAK DALEKO JSEM</span>
          <span style={{ fontSize: 22, fontWeight: 800, color: ACCENT, fontVariantNumeric: 'tabular-nums' }}>{value} %</span>
        </div>
        <div style={{ height: 12, borderRadius: 999, background: 'var(--progress-track)', overflow: 'hidden' }}>
          <div style={{ width: `${value}%`, height: '100%', background: ACCENT, borderRadius: 999, transition: 'width .2s' }} />
        </div>

        {collapsible && (
          <button
            onClick={() => setEditOpen(v => !v)}
            aria-expanded={open}
            style={{
              width: '100%', minHeight: 44, marginTop: 8, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6,
              background: 'transparent', border: 'none', color: 'var(--muted)', fontSize: 13, fontWeight: 600,
              cursor: 'pointer', touchAction: 'manipulation',
            }}>
            {open ? 'Skrýt' : 'Upravit progres'}
            <ChevronDown size={16} style={{ transform: open ? 'rotate(180deg)' : 'none', transition: 'transform .28s ease' }} />
          </button>
        )}

        {/* Rozbalení přes max-height — `height: auto` se animovat nedá. Strop je
            záměrně těsně nad skutečnou výškou obsahu (98 px na 390 i 1440);
            se stropem 260 px animace „dojela" dřív, než skončila, a působila
            useknutě. */}
        <div style={{
          maxHeight: open ? 130 : 0,
          opacity: open ? 1 : 0,
          overflow: 'hidden',
          marginTop: open ? 8 : 0,
          transition: 'max-height .28s ease, opacity .22s ease, margin-top .28s ease',
        }}>
          {/* Posuvník i tlačítka — táhnutím se trefíš přesně, tapem rychle. */}
          <input
            type="range" min={0} max={100} step={5} value={value}
            onChange={e => onChange(Number(e.target.value))}
            aria-label="Jak daleko jsem"
            tabIndex={open ? 0 : -1}
            style={{ width: '100%', height: 44, accentColor: ACCENT, cursor: 'pointer' }}
          />
          <div style={{ display: 'grid', gridTemplateColumns: `repeat(${PROGRESS_STEPS.length}, minmax(0,1fr))`, gap: 6, marginTop: 4 }}>
            {PROGRESS_STEPS.map(p => {
              const on = value === p
              return (
                <button key={p} onClick={() => onChange(p)} tabIndex={open ? 0 : -1} style={{
                  minHeight: 44, borderRadius: 10, fontSize: 13, fontWeight: 700, cursor: 'pointer', touchAction: 'manipulation',
                  border: `1px solid ${on ? ACCENT : 'var(--border)'}`,
                  background: on ? ACCENT : 'var(--input-bg)', color: on ? '#fff' : 'var(--text)',
                }}>{p} %</button>
              )
            })}
          </div>
        </div>
      </div>
    )
  }

  const card: React.CSSProperties = {
    background: 'var(--card)', border: '1px solid var(--border)', borderRadius: 18,
    padding: isMobile ? 16 : 22, boxShadow: 'var(--shadow)',
  }

  // ---------- obrazovky ----------
  const setupScreen = (
    <div style={{ ...card, maxWidth: 560, margin: '0 auto', width: '100%' }}>
      <div style={{ fontSize: 11, letterSpacing: 0.6, color: 'var(--muted)', fontWeight: 700, marginBottom: 8 }}>CÍL FOCUSU</div>
      <input
        value={cil}
        onChange={e => setCil(e.target.value)}
        onKeyDown={e => { if (e.key === 'Enter' && cil.trim()) start() }}
        placeholder="Např. dodělat audit log"
        maxLength={200}
        style={{
          width: '100%', minHeight: 52, marginBottom: 20, padding: '0 14px', borderRadius: 12,
          border: '1px solid var(--border)', background: 'var(--input-bg)', color: 'var(--text)',
          fontSize: 16, boxSizing: 'border-box',
        }}
      />

      <div style={{ fontSize: 11, letterSpacing: 0.6, color: 'var(--muted)', fontWeight: 700, marginBottom: 8 }}>ČAS</div>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(5, minmax(0,1fr))', gap: 8, marginBottom: customOpen ? 12 : 20 }}>
        {FOCUS_PRESETS.map(p => {
          const on = !customOpen && minutes === p
          return (
            <button key={p} onClick={() => { setCustomOpen(false); setMinutes(p) }} style={{
              minHeight: 52, borderRadius: 12, fontSize: 15, fontWeight: 700, cursor: 'pointer', touchAction: 'manipulation',
              border: `1px solid ${on ? ACCENT : 'var(--border)'}`,
              background: on ? ACCENT : 'var(--input-bg)', color: on ? '#fff' : 'var(--text)',
            }}>{p}</button>
          )
        })}
        <button onClick={() => { setCustomOpen(true); setMinutes(clampMinutes(Number(customVal))) }} style={{
          minHeight: 52, borderRadius: 12, fontSize: 14, fontWeight: 700, cursor: 'pointer', touchAction: 'manipulation',
          border: `1px solid ${customOpen ? ACCENT : 'var(--border)'}`,
          background: customOpen ? ACCENT : 'var(--input-bg)', color: customOpen ? '#fff' : 'var(--text)',
        }}>Vlastní</button>
      </div>
      {customOpen && (
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 20 }}>
          <input
            autoFocus type="text" inputMode="numeric" value={customVal}
            onChange={e => { setCustomVal(e.target.value); setMinutes(clampMinutes(Number(e.target.value))) }}
            style={{
              width: 110, minHeight: 52, padding: '0 14px', borderRadius: 12, border: '1px solid var(--border)',
              background: 'var(--input-bg)', color: 'var(--text)', fontSize: 16, textAlign: 'center', boxSizing: 'border-box',
            }}
          />
          <span style={{ fontSize: 14, color: 'var(--muted)' }}>minut (max {MAX_FOCUS_MIN})</span>
        </div>
      )}

      <button onClick={start} disabled={starting || !cil.trim()} style={{
        width: '100%', minHeight: 58, background: ACCENT, border: 'none', borderRadius: 14, color: '#fff',
        fontSize: 17, fontWeight: 700, cursor: starting || !cil.trim() ? 'default' : 'pointer',
        opacity: starting || !cil.trim() ? 0.55 : 1, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8,
        boxShadow: '0 4px 14px rgba(232,25,44,0.35)', touchAction: 'manipulation',
      }}>
        <Play size={20} /> {starting ? 'Spouštím…' : `Spustit focus na ${fmtLength(clampMinutes(minutes))}`}
      </button>

      <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginTop: 12, fontSize: 12, color: 'var(--muted)' }}>
        {notifyOn ? <Bell size={13} /> : <BellOff size={13} />}
        {notifyOn
          ? 'Na konci zazní zvuk a přijde upozornění.'
          : 'Na konci zazní zvuk. Upozornění povolíš při spuštění.'}
      </div>
    </div>
  )

  const runScreen = session && (
    <div style={{ maxWidth: 560, margin: '0 auto', width: '100%', display: 'flex', flexDirection: 'column', gap: 14 }}>
      {/* Cíl patří nahoru — kvůli němu to celé běží. */}
      <div style={{ ...card, padding: isMobile ? 14 : 18 }}>
        <div style={{ fontSize: 11, letterSpacing: 0.6, color: 'var(--muted)', fontWeight: 700, marginBottom: 6 }}>CÍL</div>
        <div style={{ fontSize: isMobile ? 18 : 21, fontWeight: 700, color: 'var(--text)', lineHeight: 1.35, wordBreak: 'break-word' }}>{session.cil}</div>
      </div>

      <div style={{ ...card, display: 'flex', flexDirection: 'column', gap: 18 }}>
        {bigNumber(fmtClock(remain), session.stav === 'paused' ? 'pauza' : `z ${fmtLength(session.duration_min)}`, session.stav === 'paused')}

        {/* Proužek uplynulého času. Barva jde z `--text`, ne z `--muted` — šedá
            na šedé se na tmavém pozadí ztrácela. Zůstává neutrální, aby si
            nekonkurovala s červeným barem progresu, který je ten hlavní. */}
        <div style={{ height: 6, borderRadius: 999, background: 'var(--progress-track)', overflow: 'hidden' }}>
          <div style={{ width: `${timeFrac * 100}%`, height: '100%', background: 'var(--text)', opacity: 0.6, borderRadius: 999, transition: 'width 1s linear' }} />
        </div>

        {progressControl(session.progress, setProgress, true)}

        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, minmax(0,1fr))', gap: 10 }}>
          {session.stav === 'paused' ? (
            <button onClick={resume} style={{
              minHeight: 52, borderRadius: 12, border: 'none', background: '#10b981', color: '#fff',
              fontSize: 15, fontWeight: 700, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 7, touchAction: 'manipulation',
            }}><Play size={17} /> Pokračovat</button>
          ) : (
            <button onClick={pause} style={{
              minHeight: 52, borderRadius: 12, border: '1px solid var(--border)', background: 'var(--input-bg)', color: 'var(--text)',
              fontSize: 15, fontWeight: 600, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 7, touchAction: 'manipulation',
            }}><Pause size={17} /> Pauza</button>
          )}
          <button onClick={cancel} style={{
            minHeight: 52, borderRadius: 12, border: '1px solid rgba(232,25,44,0.4)', background: 'rgba(232,25,44,0.10)', color: ACCENT,
            fontSize: 15, fontWeight: 600, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 7, touchAction: 'manipulation',
          }}><X size={17} /> Zrušit</button>
          <button onClick={finishEarly} style={{
            minHeight: 52, borderRadius: 12, border: 'none', background: '#10b981', color: '#fff',
            fontSize: 15, fontWeight: 700, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 7, touchAction: 'manipulation',
          }}><Check size={17} /> Hotovo</button>
        </div>
      </div>
    </div>
  )

  const finalScreen = session && (
    <div style={{ maxWidth: 560, margin: '0 auto', width: '100%', display: 'flex', flexDirection: 'column', gap: 14 }}>
      <div style={{ ...card, textAlign: 'center' }}>
        <div style={{ width: 62, height: 62, borderRadius: '50%', background: 'rgba(16,185,129,0.14)', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 12px' }}>
          <Check size={30} color="#10b981" />
        </div>
        <div style={{ fontSize: 20, fontWeight: 800, color: 'var(--text)', marginBottom: 6 }}>Focus dokončen</div>
        <div style={{ fontSize: 14, color: 'var(--muted)', lineHeight: 1.5, wordBreak: 'break-word' }}>{session.cil}</div>
      </div>
      <div style={{ ...card, display: 'flex', flexDirection: 'column', gap: 16 }}>
        {/* Doptáváme se jen pod 100 %; na stu procentech zbývá jen zavřít. */}
        {needsFinalAnswer(session) && <>
          <div style={{ fontSize: 15, fontWeight: 700, color: 'var(--text)' }}>Jak daleko jsi nakonec došel?</div>
          {progressControl(session.progress, setProgress)}
        </>}
        <button onClick={confirmFinal} style={{
          width: '100%', minHeight: 56, background: ACCENT, border: 'none', borderRadius: 14, color: '#fff',
          fontSize: 16, fontWeight: 700, cursor: 'pointer', touchAction: 'manipulation',
        }}>Uložit a zavřít</button>
      </div>
    </div>
  )

  if (loading) return <div style={{ color: 'var(--muted)', padding: 24 }}>Načítání…</div>

  return (
    <div style={{ maxWidth: 1120, margin: '0 auto', paddingBottom: 24 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: isMobile ? 10 : 12, marginBottom: isMobile ? 16 : 20 }}>
        {isMobile ? <Crosshair size={22} color={ACCENT} /> : (
          <div style={{ width: 40, height: 40, borderRadius: 12, background: ACCENT, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
            <Crosshair size={22} color="#fff" />
          </div>
        )}
        <div>
          <h1 style={{ fontSize: isMobile ? 26 : 24, fontWeight: 800, color: 'var(--text)', margin: 0, lineHeight: 1.1 }}>Focus</h1>
          {!isMobile && <div style={{ fontSize: 13, color: 'var(--muted)', marginTop: 2 }}>Jeden cíl, jeden časovač.</div>}
        </div>
      </div>

      {session?.stav === 'finished' ? finalScreen : session ? runScreen : setupScreen}

      {dialog}
      {toast && <Toast message={toast.message} type={toast.type} onClose={hideToast} />}
    </div>
  )
}
