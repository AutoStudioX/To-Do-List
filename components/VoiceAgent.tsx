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

type ToolCall = { id: string; name: string; input: Record<string, unknown> }

const SILENCE_TIMEOUT_MS = 2000
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

// Only add_task gets the strict false-positive validation; the others just need their required fields.
function validateToolCall(t: ToolCall): string | null {
  const d = t.input || {}
  if (t.name === 'add_task') {
    if (!isTaskNameValid(d.nazev)) return `Neplatný název úkolu: "${d.nazev ?? ''}"`
    if (d.priorita !== undefined && d.priorita !== null && !['High', 'Medium', 'Low'].includes(d.priorita as string)) {
      return `Neplatná priorita: "${d.priorita}"`
    }
  } else if (t.name === 'add_income') {
    if (!d.klient || !d.castka) return 'Chybí klient nebo částka u příjmu'
  } else if (t.name === 'add_expense') {
    if (!d.nazev || !d.castka) return 'Chybí název nebo částka u výdaje'
  } else if (t.name === 'add_goal') {
    if (!d.nazev) return 'Chybí název cíle'
  } else if (t.name === 'update_goal_progress') {
    if (!d.goal_name) return 'Chybí název cíle'
    if (d.current_value === undefined || d.current_value === null || isNaN(Number(d.current_value))) return 'Chybí nová hodnota pokroku'
  }
  return null
}

function fuzzyFindGoal<T extends { nazev: string }>(goals: T[], name: string): T | null {
  const q = name.trim().toLowerCase()
  if (!q) return null
  const exact = goals.find(g => g.nazev.trim().toLowerCase() === q)
  if (exact) return exact
  const partial = goals.find(g => {
    const n = g.nazev.trim().toLowerCase()
    return n.includes(q) || q.includes(n)
  })
  return partial || null
}

function describeToolCall(t: ToolCall): string {
  const d = t.input || {}
  switch (t.name) {
    case 'add_task':
      return `Přidat úkol: "${d.nazev}", priorita ${d.priorita || 'Medium'}${d.deadline ? `, deadline ${d.deadline}` : ''}${d.projekt ? `, projekt ${d.projekt}` : ''}`
    case 'add_income':
      return `Přidat příjem: ${d.klient} — ${d.castka} Kč${d.typ === 'mesicni' ? ' (měsíční)' : ''}`
    case 'add_expense':
      return `Přidat výdaj: ${d.nazev} — ${d.castka} Kč${d.kategorie ? ` (${d.kategorie})` : ''}`
    case 'add_goal':
      return `Přidat cíl: "${d.nazev}"${d.deadline ? `, deadline ${d.deadline}` : ''}${d.target_value ? `, cíl ${d.target_value}` : ''}`
    case 'update_goal_progress':
      return `Aktualizovat pokrok cíle "${d.goal_name}" na ${d.current_value}`
    case 'get_summary':
      return 'Zobrazit přehled'
    default:
      return t.name
  }
}

export default function VoiceAgent({ onSuccess }: { onSuccess?: () => void }) {
  const [status, setStatus] = useState<Status>('idle')
  const [transcript, setTranscript] = useState('')
  const [interim, setInterim] = useState('')
  const [response, setResponse] = useState('')
  const [pendingCalls, setPendingCalls] = useState<ToolCall[] | null>(null)
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

  // Executes one of the 5 agent tools against Supabase. get_summary is handled separately (read-only, client-side).
  async function executeTool(t: ToolCall, userId: string): Promise<string | null> {
    const supabase = createClient()
    const d = t.input || {}
    if (t.name === 'add_task') {
      const { error } = await supabase.from('ukoly').insert({
        user_id: userId,
        nazev: d.nazev,
        priorita: d.priorita || 'Medium',
        deadline: d.deadline || null,
        projekt: d.projekt || null,
        status: 'Todo',
      })
      if (error) return error.message
    } else if (t.name === 'add_income') {
      const { error } = await supabase.from('transakce').insert({
        user_id: userId,
        nazev: d.klient,
        klient: d.klient,
        castka: d.castka,
        datum: d.datum || todayISO(),
        typ: 'prijem',
        opakovani: d.typ || 'jednorazovy',
        status: 'ceka',
      })
      if (error) return error.message
    } else if (t.name === 'add_expense') {
      const { error } = await supabase.from('transakce').insert({
        user_id: userId,
        nazev: d.nazev,
        castka: d.castka,
        datum: d.datum || todayISO(),
        typ: 'vydaj',
        kategorie: d.kategorie || 'Ostatní',
        opakovani: 'jednorazovy',
      })
      if (error) return error.message
    } else if (t.name === 'add_goal') {
      const { error } = await supabase.from('goaly').insert({
        user_id: userId,
        nazev: d.nazev,
        deadline: d.deadline || null,
        popis: null,
        progress: 0,
        status: 'active',
        typ: d.target_value ? 'number' : 'manual',
        target_value: d.target_value || null,
        current_value: d.target_value ? 0 : null,
      })
      if (error) return error.message
    } else if (t.name === 'update_goal_progress') {
      const { data: goals, error: fetchError } = await supabase
        .from('goaly')
        .select('id, nazev, target_value, current_value')
        .eq('user_id', userId)
        .eq('status', 'active')
      if (fetchError) return fetchError.message
      const match = fuzzyFindGoal<{ id: string; nazev: string; target_value: number | null; current_value: number | null }>(goals || [], String(d.goal_name || ''))
      if (!match) return `Nenašel jsem cíl "${d.goal_name}"`

      const newValue = Number(d.current_value)
      const updates: Record<string, unknown> = {}
      if (match.target_value) {
        // Numeric goal — recalculate progress from current_value / target_value
        updates.current_value = newValue
        updates.progress = Math.min(100, Math.max(0, Math.round((newValue / match.target_value) * 100)))
      } else {
        // Manual goal with no target — the number IS the progress percentage
        updates.progress = Math.min(100, Math.max(0, Math.round(newValue)))
      }
      const { error } = await supabase.from('goaly').update(updates).eq('id', match.id)
      if (error) return error.message
    }
    return null
  }

  async function fetchSummary(userId: string): Promise<string> {
    const supabase = createClient()
    const [{ data: ukoly }, { data: transakce }, { data: goaly }] = await Promise.all([
      supabase.from('ukoly').select('status').eq('user_id', userId),
      supabase.from('transakce').select('castka, typ').eq('user_id', userId),
      supabase.from('goaly').select('nazev, progress, status').eq('user_id', userId),
    ])
    const openTasks = (ukoly || []).filter((t: { status: string }) => t.status !== 'Done').length
    const totalIncome = (transakce || [])
      .filter((t: { typ: string }) => t.typ === 'prijem')
      .reduce((s: number, t: { castka: number }) => s + Number(t.castka || 0), 0)
    const activeGoals = (goaly || []).filter((g: { status: string }) => g.status === 'active')
    const goalsText = activeGoals.length > 0
      ? activeGoals.map((g: { nazev: string; progress: number }) => `${g.nazev} (${g.progress}%)`).join(', ')
      : 'žádné aktivní cíle'
    return `Otevřených úkolů: ${openTasks}. Celkové příjmy: ${totalIncome.toLocaleString('cs-CZ')} Kč. Cíle: ${goalsText}.`
  }

  async function processTranscript(text: string) {
    setStatus('thinking')
    try {
      const res = await fetch('/api/voice', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text }),
      })
      const json = await res.json()
      const toolCalls: ToolCall[] = json.toolCalls || []

      if (toolCalls.length === 0) {
        setResponse(json.response || 'Nerozuměl jsem.')
        setPanelOpen(true)
        setStatus('idle')
        return
      }

      // get_summary is read-only — answer immediately, no confirmation needed
      const summaryCalls = toolCalls.filter(t => t.name === 'get_summary')
      const mutatingCalls = toolCalls.filter(t => t.name !== 'get_summary')

      if (summaryCalls.length > 0 && mutatingCalls.length === 0) {
        const supabase = createClient()
        const { data: { session } } = await supabase.auth.getSession()
        if (!session?.user) { setResponse('Nejsi přihlášen.'); setStatus('error'); setPanelOpen(true); return }
        const summary = await fetchSummary(session.user.id)
        setResponse(summary)
        setPanelOpen(true)
        setStatus('idle')
        return
      }

      const validationErrors = mutatingCalls.map(validateToolCall).filter((e): e is string => !!e)
      if (validationErrors.length > 0) {
        setResponse('Neplatný příkaz — nic jsem nevytvořil: ' + validationErrors.join(', '))
        setPanelOpen(true)
        setStatus('error')
        return
      }

      setPendingCalls(mutatingCalls)
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
    if (!pendingCalls) return
    setStatus('saving')
    const supabase = createClient()
    const { data: { session } } = await supabase.auth.getSession()
    if (!session?.user) {
      setPendingCalls(null)
      setStatus('error')
      setResponse('Nejsi přihlášen.')
      return
    }
    const errors: string[] = []
    const added: string[] = []
    for (const t of pendingCalls) {
      const err = await executeTool(t, session.user.id)
      if (err) errors.push(err)
      else added.push(describeToolCall(t))
    }

    // Full reset — each voice command is independent, no leftover state for next one
    setPendingCalls(null)
    setTranscript('')
    setInterim('')
    finalTranscriptRef.current = ''

    if (errors.length > 0) {
      setResponse('Chyba: ' + errors.join(', '))
      setStatus('error')
      return
    }

    setResponse('Hotovo: ' + added.join('; '))
    setStatus('idle')
    onSuccess?.()
    window.dispatchEvent(new CustomEvent('voice-data-changed'))
  }

  function cancelActions() {
    setPendingCalls(null)
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
    setPendingCalls(null)
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
    listening: 'Poslouchám... (2s ticho = stop)',
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
              {status === 'confirm' && pendingCalls && (
                <div style={{ marginBottom: 4 }}>
                  <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--text)', marginBottom: 6 }}>Chceš provést:</div>
                  {pendingCalls.map((t, i) => (
                    <div key={i} style={{ fontSize: 12.5, color: 'var(--text)', marginBottom: 4, wordBreak: 'break-word' }}>
                      • {describeToolCall(t)}
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
              {/* Response text (get_summary answer, save confirmation, or unknown/error) */}
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
                <div style={{ fontSize: 12, color: 'var(--muted)' }}>Poslouchám, mluv... (ticho 2s = automatický stop)</div>
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
