'use client'
import { useRef, useState } from 'react'
import { Check, Loader, Mic, MicOff, X } from 'lucide-react'
import { createClient } from '@/lib/supabase/client'

type Status = 'idle' | 'listening' | 'thinking' | 'confirm' | 'saving' | 'error'

declare global {
  interface Window {
    SpeechRecognition: new () => SpeechRecognitionInstance
    webkitSpeechRecognition: new () => SpeechRecognitionInstance
  }
}

interface SpeechRecognitionInstance {
  lang: string
  interimResults: boolean
  maxAlternatives: number
  continuous: boolean
  onstart: (() => void) | null
  onresult: ((e: SpeechRecognitionEvent) => void) | null
  onerror: (() => void) | null
  onend: (() => void) | null
  start: () => void
  stop: () => void
}

interface SpeechRecognitionResult {
  isFinal: boolean
  0: { transcript: string }
}

interface SpeechRecognitionEvent {
  results: { length: number; [index: number]: SpeechRecognitionResult }
}

type VoiceAction = { action: string; data: Record<string, unknown> }

const SILENCE_TIMEOUT_MS = 5000
const SILENCE_CHECK_INTERVAL_MS = 250
const SILENCE_RMS_THRESHOLD = 0.02

const GENERIC_TASK_NAMES = new Set([
  'nový úkol', 'novy ukol', 'úkol', 'ukol', 'priorita', 'priority', 'task', 'todo', 'new task', 'novy task',
])

function isTaskNameValid(nazev: unknown): boolean {
  if (typeof nazev !== 'string') return false
  const trimmed = nazev.trim()
  if (!trimmed) return false
  if (GENERIC_TASK_NAMES.has(trimmed.toLowerCase())) return false
  const wordCount = trimmed.split(/\s+/).filter(Boolean).length
  if (wordCount < 3) return false
  return true
}

function validateAction(a: VoiceAction): string | null {
  const d = a.data || {}
  if (a.action === 'add_ukol') {
    if (!isTaskNameValid(d.nazev)) return `Neplatný název úkolu: "${d.nazev ?? ''}"`
    if (d.priorita !== undefined && d.priorita !== null && !['High', 'Medium', 'Low'].includes(d.priorita as string)) {
      return `Neplatná priorita: "${d.priorita}"`
    }
  }
  return null
}

function describeAction(a: VoiceAction): string {
  const d = a.data || {}
  switch (a.action) {
    case 'add_ukol':
      return `Přidat úkol: "${d.nazev}", priorita ${d.priorita || 'Medium'}${d.deadline ? `, deadline ${d.deadline}` : ''}${d.projekt ? `, projekt ${d.projekt}` : ''}`
    case 'add_prijem':
      return `Přidat příjem: ${d.klient || d.nazev} — ${d.castka} Kč`
    case 'add_vydaj':
      return `Přidat výdaj: ${d.nazev} — ${d.castka} Kč`
    case 'add_dluh':
      return `Přidat dluh: ${d.komu_kdo} — ${d.castka} Kč (${d.smer === 'moje' ? 'dlužím já' : 'dluží mi'})`
    case 'add_fixni':
      return `Přidat fixní náklad: ${d.nazev} — ${d.castka} Kč`
    case 'add_goal':
      return `Přidat goal: "${d.nazev}"${d.deadline ? `, deadline ${d.deadline}` : ''}`
    case 'update_ukol':
      return `Upravit úkol${d.status ? ` → status ${d.status}` : ''}${d.priorita ? `, priorita ${d.priorita}` : ''}${d.nazev ? `, název "${d.nazev}"` : ''}`
    case 'update_goal':
      return `Upravit goal${d.progress !== undefined ? ` → progress ${d.progress}%` : ''}${d.status ? `, status ${d.status}` : ''}`
    case 'delete_transakce':
      return 'Smazat transakci'
    case 'delete_vydaje_month':
      return `Smazat výdaje za ${d.month}/${d.year}`
    default:
      return a.action
  }
}

export default function VoiceAgent({ onSuccess }: { onSuccess?: () => void }) {
  const [status, setStatus] = useState<Status>('idle')
  const [transcript, setTranscript] = useState('')
  const [interim, setInterim] = useState('')
  const [response, setResponse] = useState('')
  const [pendingActions, setPendingActions] = useState<VoiceAction[] | null>(null)
  const [panelOpen, setPanelOpen] = useState(false)
  const recognitionRef = useRef<SpeechRecognitionInstance | null>(null)
  const finalTranscriptRef = useRef('')
  const lastSoundAtRef = useRef(Date.now())
  const silenceIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null)
  const audioCtxRef = useRef<AudioContext | null>(null)
  const streamRef = useRef<MediaStream | null>(null)

  const todayISO = () => {
    const d = new Date()
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
  }

  function stopSilenceWatch() {
    if (silenceIntervalRef.current) { clearInterval(silenceIntervalRef.current); silenceIntervalRef.current = null }
    streamRef.current?.getTracks().forEach(t => t.stop())
    streamRef.current = null
    if (audioCtxRef.current) { audioCtxRef.current.close().catch(() => {}); audioCtxRef.current = null }
  }

  async function startSilenceWatch(onTimeout: () => void) {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true })
      streamRef.current = stream
      const AudioCtx = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext
      const audioCtx = new AudioCtx()
      audioCtxRef.current = audioCtx
      const source = audioCtx.createMediaStreamSource(stream)
      const analyser = audioCtx.createAnalyser()
      analyser.fftSize = 512
      source.connect(analyser)
      const data = new Uint8Array(analyser.frequencyBinCount)
      lastSoundAtRef.current = Date.now()

      silenceIntervalRef.current = setInterval(() => {
        analyser.getByteTimeDomainData(data)
        let sumSquares = 0
        for (let i = 0; i < data.length; i++) {
          const v = (data[i] - 128) / 128
          sumSquares += v * v
        }
        const rms = Math.sqrt(sumSquares / data.length)
        if (rms > SILENCE_RMS_THRESHOLD) {
          lastSoundAtRef.current = Date.now()
        } else if (Date.now() - lastSoundAtRef.current >= SILENCE_TIMEOUT_MS) {
          onTimeout()
        }
      }, SILENCE_CHECK_INTERVAL_MS)
    } catch {
      // Mic-level access unavailable/denied — silence auto-stop just won't fire; manual stop still works.
    }
  }

  async function writeToSupabase(action: string, data: Record<string, unknown>, userId: string): Promise<string | null> {
    const supabase = createClient()
    if (action === 'add_ukol') {
      if (!data.nazev) return 'Chybí název úkolu'
      const { error } = await supabase.from('ukoly').insert({
        user_id: userId,
        nazev: data.nazev,
        priorita: data.priorita || 'Medium',
        deadline: data.deadline || null,
        projekt: data.projekt || null,
        status: 'Todo',
      })
      if (error) return error.message
    } else if (action === 'add_prijem') {
      const nazev = data.klient || data.nazev
      if (!nazev || !data.castka) return 'Chybí klient nebo částka'
      const { error } = await supabase.from('transakce').insert({
        user_id: userId,
        nazev,
        klient: nazev,
        castka: data.castka,
        datum: data.datum || todayISO(),
        typ: 'prijem',
        opakovani: data.opakovani || 'jednorazovy',
        status: data.status || 'ceka',
      })
      if (error) return error.message
    } else if (action === 'add_vydaj') {
      if (!data.nazev || !data.castka) return 'Chybí název nebo částka'
      const { error } = await supabase.from('transakce').insert({
        user_id: userId,
        nazev: data.nazev,
        castka: data.castka,
        datum: data.datum || todayISO(),
        typ: 'vydaj',
        kategorie: data.kategorie || 'Ostatní',
        opakovani: 'jednorazovy',
      })
      if (error) return error.message
    } else if (action === 'add_goal') {
      if (!data.nazev) return 'Chybí název goalu'
      const { error } = await supabase.from('goaly').insert({
        user_id: userId,
        nazev: data.nazev,
        deadline: data.deadline || null,
        popis: data.popis || null,
        progress: 0,
        status: 'active',
        typ: 'manual',
      })
      if (error) return error.message
    } else if (action === 'delete_transakce') {
      if (!data.id) return 'Nenašel jsem transakci ke smazání'
      const { error } = await supabase.from('transakce').delete().eq('id', data.id)
      if (error) return error.message
    } else if (action === 'delete_vydaje_month') {
      const year = data.year || new Date().getFullYear()
      const month = Number(data.month || (new Date().getMonth() + 1))
      const from = `${year}-${String(month).padStart(2, '0')}-01`
      const lastDay = new Date(Number(year), month, 0).getDate()
      const to = `${year}-${String(month).padStart(2, '0')}-${lastDay}`
      const { error } = await supabase.from('transakce').delete()
        .eq('user_id', userId).eq('typ', 'vydaj')
        .gte('datum', from).lte('datum', to)
      if (error) return error.message
    } else if (action === 'update_ukol') {
      if (!data.id) return 'Nenašel jsem úkol k aktualizaci'
      const updates: Record<string, unknown> = {}
      if (data.status) updates.status = data.status
      if (data.priorita) updates.priorita = data.priorita
      if (data.deadline !== undefined) updates.deadline = data.deadline
      if (data.nazev) updates.nazev = data.nazev
      if (Object.keys(updates).length === 0) return 'Nic k aktualizaci'
      const { error } = await supabase.from('ukoly').update(updates).eq('id', data.id)
      if (error) return error.message
    } else if (action === 'add_fixni') {
      if (!data.nazev || !data.castka) return 'Chybí název nebo částka'
      const { error } = await supabase.from('transakce').insert({
        user_id: userId,
        nazev: data.nazev,
        castka: data.castka,
        typ: 'fixni_naklad',
        opakovani: data.opakovani || 'mesicni',
        datum: todayISO(),
      })
      if (error) return error.message
    } else if (action === 'add_dluh') {
      if (!data.komu_kdo || !data.castka) return 'Chybí jméno nebo částka'
      const { error } = await supabase.from('transakce').insert({
        user_id: userId,
        nazev: data.komu_kdo,
        castka: data.castka,
        datum: data.datum || todayISO(),
        typ: 'dluh',
        smer: data.smer || 'mne',
        status: 'nesplaceno',
        opakovani: 'jednorazovy',
        poznamka: data.popis || null,
      })
      if (error) return error.message
    } else if (action === 'update_goal') {
      if (!data.id) return 'Nenašel jsem goal k aktualizaci'
      const updates: Record<string, unknown> = {}
      if (data.progress !== undefined) updates.progress = Math.min(100, Math.max(0, Number(data.progress)))
      if (data.status) updates.status = data.status
      if (data.nazev) updates.nazev = data.nazev
      if (data.deadline !== undefined) updates.deadline = data.deadline
      if (Object.keys(updates).length === 0) return 'Nic k aktualizaci'
      const { error } = await supabase.from('goaly').update(updates).eq('id', data.id)
      if (error) return error.message
    }
    return null
  }

  async function processTranscript(text: string) {
    setStatus('thinking')
    try {
      const supabaseCtx = createClient()
      const { data: { session: s } } = await supabaseCtx.auth.getSession()
      let context = {}
      if (s?.user) {
        const [{ data: ukoly }, { data: transakce }, { data: goaly }] = await Promise.all([
          supabaseCtx.from('ukoly').select('id, nazev, status, priorita').eq('user_id', s.user.id).order('created_at', { ascending: false }).limit(100),
          supabaseCtx.from('transakce').select('id, nazev, klient, castka, typ, datum').eq('user_id', s.user.id).order('created_at', { ascending: false }).limit(50),
          supabaseCtx.from('goaly').select('id, nazev, progress, status').eq('user_id', s.user.id).eq('status', 'active'),
        ])
        context = { ukoly: ukoly || [], transakce: transakce || [], goaly: goaly || [] }
      }

      const res = await fetch('/api/voice', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text, context }),
      })
      const json = await res.json()
      const actions: VoiceAction[] = json.actions || []
      const realActions = actions.filter(a => a.action !== 'unknown')

      if (realActions.length === 0) {
        setResponse(json.response || 'Nerozuměl jsem.')
        setPanelOpen(true)
        setStatus('idle')
        return
      }

      const validationErrors = realActions.map(validateAction).filter((e): e is string => !!e)
      if (validationErrors.length > 0) {
        setResponse('Neplatný příkaz — nic jsem nevytvořil: ' + validationErrors.join(', '))
        setPanelOpen(true)
        setStatus('error')
        return
      }

      setPendingActions(realActions)
      setResponse(json.response || '')
      setPanelOpen(true)
      setStatus('confirm')
    } catch {
      setResponse('Chyba při zpracování.')
      setPanelOpen(true)
      setStatus('error')
    }
  }

  async function confirmActions() {
    if (!pendingActions) return
    setStatus('saving')
    const supabase = createClient()
    const { data: { session } } = await supabase.auth.getSession()
    if (!session?.user) {
      setPendingActions(null)
      setStatus('error')
      setResponse('Nejsi přihlášen.')
      return
    }
    const errors: string[] = []
    for (const a of pendingActions) {
      const err = await writeToSupabase(a.action, a.data, session.user.id)
      if (err) errors.push(err)
    }

    // Full reset — each voice command is independent, no leftover state for next one
    setPendingActions(null)
    setTranscript('')
    setInterim('')
    finalTranscriptRef.current = ''

    if (errors.length > 0) {
      setResponse('Chyba: ' + errors.join(', '))
      setStatus('error')
      return
    }

    setResponse('Hotovo.')
    setStatus('idle')
    onSuccess?.()
    window.dispatchEvent(new CustomEvent('voice-data-changed'))
  }

  function cancelActions() {
    setPendingActions(null)
    setTranscript('')
    setInterim('')
    setResponse('')
    finalTranscriptRef.current = ''
    setStatus('idle')
  }

  function handleVoice() {
    if (status === 'listening') {
      recognitionRef.current?.stop()
      return
    }
    if (status === 'thinking' || status === 'confirm' || status === 'saving') return

    const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition
    if (!SpeechRecognition) {
      setResponse('Tvůj prohlížeč nepodporuje hlasové rozpoznávání. Použij Chrome.')
      setStatus('error')
      return
    }

    // Full reset before starting — no memory of the previous command
    setTranscript('')
    setInterim('')
    setResponse('')
    setPendingActions(null)
    finalTranscriptRef.current = ''

    const recognition = new SpeechRecognition()
    recognition.lang = 'cs-CZ'
    recognition.interimResults = true
    recognition.maxAlternatives = 1
    recognition.continuous = true
    recognitionRef.current = recognition

    recognition.onstart = () => {
      setStatus('listening')
      setPanelOpen(true)
      lastSoundAtRef.current = Date.now()
      startSilenceWatch(() => { recognitionRef.current?.stop() })
    }

    recognition.onresult = (e) => {
      let interimText = ''
      let finalText = ''
      for (let i = 0; i < e.results.length; i++) {
        if (e.results[i].isFinal) finalText += e.results[i][0].transcript
        else interimText += e.results[i][0].transcript
      }
      finalTranscriptRef.current = finalText
      setInterim(interimText)
      lastSoundAtRef.current = Date.now()
    }

    recognition.onerror = () => {
      stopSilenceWatch()
      setStatus('error')
      setResponse('Chyba při rozpoznávání hlasu.')
    }

    recognition.onend = () => {
      stopSilenceWatch()
      const finalText = finalTranscriptRef.current.trim()
      finalTranscriptRef.current = ''
      setInterim('')
      if (!finalText) {
        setStatus('idle')
        return
      }
      setTranscript(finalText)
      processTranscript(finalText)
    }

    recognition.start()
  }

  const colors: Record<Status, string> = {
    idle: '#e53e3e',
    listening: '#10b981',
    thinking: '#f59e0b',
    confirm: '#3b82f6',
    saving: '#f59e0b',
    error: '#6b7280',
  }

  const labels: Record<Status, string> = {
    idle: 'Mluvit',
    listening: 'Poslouchám... (5s ticho = stop)',
    thinking: 'Zpracovávám...',
    confirm: 'Potvrď akci',
    saving: 'Ukládám...',
    error: 'Chyba',
  }

  const busy = status === 'thinking' || status === 'confirm' || status === 'saving'

  return (
    <>
      {/* Inline mic button */}
      <button
        onClick={handleVoice}
        disabled={busy}
        title={labels[status]}
        style={{
          width: 40, height: 40, borderRadius: 10, border: 'none',
          cursor: busy ? 'default' : 'pointer',
          background: colors[status], display: 'flex', alignItems: 'center', justifyContent: 'center',
          boxShadow: status === 'listening' ? '0 0 0 6px rgba(16,185,129,0.2)' : '0 4px 14px rgba(229,62,62,0.35)',
          transition: 'all 0.2s', flexShrink: 0,
        }}
      >
        {status === 'thinking' || status === 'saving'
          ? <Loader size={16} color="white" style={{ animation: 'spin 1s linear infinite' }} />
          : status === 'listening'
          ? <MicOff size={16} color="white" />
          : <Mic size={16} color="white" />
        }
      </button>

      {/* Live transcript / confirm / result panel */}
      {panelOpen && (
        <div style={{
          position: 'absolute', top: '110%', right: 0, zIndex: 50,
          background: 'var(--card)', border: '1px solid var(--border)', borderRadius: 12,
          padding: '12px 14px', width: 300, boxShadow: '0 8px 24px rgba(0,0,0,0.15)',
        }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 8 }}>
            <div style={{ flex: 1, minWidth: 0 }}>
              {/* Live interim — what you're saying right now */}
              {status === 'listening' && interim && (
                <div style={{ fontSize: 13, color: '#10b981', fontStyle: 'italic', marginBottom: 4, wordBreak: 'break-word' }}>
                  {interim}
                </div>
              )}
              {/* Final confirmed transcript */}
              {transcript && (
                <div style={{ fontSize: 12, color: 'var(--muted)', marginBottom: 6, wordBreak: 'break-word' }}>
                  "{transcript}"
                </div>
              )}
              {/* Confirm step */}
              {status === 'confirm' && pendingActions && (
                <div style={{ marginBottom: 4 }}>
                  <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--text)', marginBottom: 6 }}>Chceš provést:</div>
                  {pendingActions.map((a, i) => (
                    <div key={i} style={{ fontSize: 12.5, color: 'var(--text)', marginBottom: 4, wordBreak: 'break-word' }}>
                      • {describeAction(a)}
                    </div>
                  ))}
                  <div style={{ display: 'flex', gap: 8, marginTop: 10 }}>
                    <button onClick={confirmActions} style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 5, background: '#10b981', border: 'none', borderRadius: 8, padding: '7px 10px', color: 'white', cursor: 'pointer', fontSize: 12.5, fontWeight: 600 }}>
                      <Check size={13} /> Potvrdit
                    </button>
                    <button onClick={cancelActions} style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 5, background: 'var(--border)', border: 'none', borderRadius: 8, padding: '7px 10px', color: 'var(--text)', cursor: 'pointer', fontSize: 12.5, fontWeight: 600 }}>
                      <X size={13} /> Zrušit
                    </button>
                  </div>
                </div>
              )}
              {/* Response from AI (after save, or unknown/error) */}
              {status !== 'confirm' && response && (
                <div style={{ fontSize: 13, color: status === 'error' ? '#e53e3e' : 'var(--text)', fontWeight: 500, wordBreak: 'break-word' }}>
                  {response}
                </div>
              )}
              {/* Thinking / saving indicator */}
              {(status === 'thinking' || status === 'saving') && !response && (
                <div style={{ fontSize: 12, color: '#f59e0b' }}>{status === 'thinking' ? 'Zpracovávám...' : 'Ukládám...'}</div>
              )}
              {/* Idle hint while listening */}
              {status === 'listening' && !interim && !transcript && (
                <div style={{ fontSize: 12, color: 'var(--muted)' }}>Poslouchám, mluv... (ticho 5s = automatický stop)</div>
              )}
            </div>
            <button
              onClick={() => { if (status === 'confirm') cancelActions(); setPanelOpen(false) }}
              style={{ background: 'transparent', border: 'none', cursor: 'pointer', color: 'var(--muted)', padding: 0, flexShrink: 0 }}
            >
              <X size={14} />
            </button>
          </div>
        </div>
      )}

      <style>{`@keyframes spin { from { transform: rotate(0deg) } to { transform: rotate(360deg) } }`}</style>
    </>
  )
}
