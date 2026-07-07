'use client'
import { useState, useRef } from 'react'
import { Mic, MicOff, Loader } from 'lucide-react'
import { createClient } from '@/lib/supabase/client'

type Status = 'idle' | 'listening' | 'thinking' | 'done' | 'error'

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
  onstart: (() => void) | null
  onresult: ((e: SpeechRecognitionEvent) => void) | null
  onerror: (() => void) | null
  onend: (() => void) | null
  start: () => void
  stop: () => void
}

interface SpeechRecognitionEvent {
  results: { [index: number]: { [index: number]: { transcript: string } } }
}

export default function VoiceAgent({ onSuccess }: { onSuccess?: () => void }) {
  const [status, setStatus] = useState<Status>('idle')
  const [transcript, setTranscript] = useState('')
  const [response, setResponse] = useState('')
  const recognitionRef = useRef<SpeechRecognitionInstance | null>(null)

  const todayISO = () => {
    const d = new Date()
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
  }

  async function writeToSupabase(action: string, data: Record<string, unknown>, userId: string) {
    const supabase = createClient()
    if (action === 'add_ukol') {
      await supabase.from('ukoly').insert({
        user_id: userId,
        nazev: data.nazev,
        priorita: data.priorita || 'Medium',
        deadline: data.deadline || null,
        projekt: data.projekt || null,
        status: 'Todo',
      })
    } else if (action === 'add_prijem') {
      await supabase.from('transakce').insert({
        user_id: userId,
        nazev: data.klient,
        klient: data.klient,
        castka: data.castka,
        datum: data.datum || todayISO(),
        typ: 'prijem',
        opakovani: data.opakovani || 'jednorazovy',
        status: data.status || 'ceka',
      })
    } else if (action === 'add_vydaj') {
      await supabase.from('transakce').insert({
        user_id: userId,
        nazev: data.nazev,
        castka: data.castka,
        datum: data.datum || todayISO(),
        typ: 'vydaj',
        kategorie: data.kategorie || 'Ostatní',
        opakovani: 'jednorazovy',
      })
    } else if (action === 'add_goal') {
      await supabase.from('goaly').insert({
        user_id: userId,
        nazev: data.nazev,
        deadline: data.deadline || null,
        popis: data.popis || null,
        progress: 0,
        status: 'active',
      })
    } else if (action === 'delete_vydaje_month') {
      const year = data.year || new Date().getFullYear()
      const month = String(data.month || (new Date().getMonth() + 1)).padStart(2, '0')
      const from = `${year}-${month}-01`
      const to = `${year}-${month}-31`
      await supabase.from('transakce').delete()
        .eq('user_id', userId).eq('typ', 'vydaj')
        .gte('datum', from).lte('datum', to)
    } else if (action === 'delete_ukol') {
      await supabase.from('ukoly').delete().eq('id', data.id)
    } else if (action === 'update_ukol') {
      const updates: Record<string, unknown> = {}
      if (data.status) updates.status = data.status
      if (data.priorita) updates.priorita = data.priorita
      if (data.deadline !== undefined) updates.deadline = data.deadline
      if (data.nazev) updates.nazev = data.nazev
      await supabase.from('ukoly').update(updates).eq('id', data.id)
    } else if (action === 'add_fixni') {
      await supabase.from('transakce').insert({
        user_id: userId,
        nazev: data.nazev,
        castka: data.castka,
        typ: 'fixni_naklad',
        opakovani: data.opakovani || 'mesicni',
        datum: todayISO(),
      })
    } else if (action === 'add_dluh') {
      await supabase.from('transakce').insert({
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
    }
  }

  async function handleVoice() {
    if (status === 'listening') {
      recognitionRef.current?.stop()
      return
    }

    const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition
    if (!SpeechRecognition) {
      setResponse('Tvůj prohlížeč nepodporuje hlasové rozpoznávání. Použij Chrome.')
      setStatus('error')
      return
    }

    const recognition = new SpeechRecognition()
    recognition.lang = 'cs-CZ'
    recognition.interimResults = false
    recognition.maxAlternatives = 1
    recognitionRef.current = recognition

    recognition.onstart = () => setStatus('listening')

    recognition.onresult = async (e) => {
      const text = e.results[0][0].transcript
      setTranscript(text)
      setStatus('thinking')

      try {
        const supabaseCtx = createClient()
        const { data: { session: s } } = await supabaseCtx.auth.getSession()
        let context = {}
        if (s?.user) {
          const { data: ukoly } = await supabaseCtx.from('ukoly').select('id, nazev, status, priorita').eq('user_id', s.user.id).neq('status', 'Done')
          context = { ukoly: ukoly || [] }
        }

        const res = await fetch('/api/voice', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ text, context }),
        })
        const json = await res.json()

        if (json.action !== 'unknown') {
          const supabase = createClient()
          const { data: { session } } = await supabase.auth.getSession()
          if (session?.user) {
            await writeToSupabase(json.action, json.data, session.user.id)
          }
        }

        setResponse(json.response || 'Hotovo.')
        setStatus('done')
        if (json.action !== 'unknown') onSuccess?.()
      } catch {
        setResponse('Chyba při zpracování.')
        setStatus('error')
      }
    }

    recognition.onerror = () => {
      setStatus('error')
      setResponse('Chyba při rozpoznávání hlasu.')
    }

    recognition.onend = () => {
      setStatus(s => s === 'listening' ? 'idle' : s)
    }

    recognition.start()
  }

  const colors: Record<Status, string> = {
    idle: '#e53e3e',
    listening: '#10b981',
    thinking: '#f59e0b',
    done: '#3b82f6',
    error: '#6b7280',
  }

  const labels: Record<Status, string> = {
    idle: 'Mluvit',
    listening: 'Poslouchám...',
    thinking: 'Přemýšlím...',
    done: 'Hotovo',
    error: 'Chyba',
  }

  return (
    <>
      {/* Floating mic button */}
      <button
        onClick={handleVoice}
        disabled={status === 'thinking'}
        title={labels[status]}
        style={{
          position: 'fixed', bottom: 90, right: 20, zIndex: 100,
          width: 52, height: 52, borderRadius: '50%', border: 'none',
          cursor: status === 'thinking' ? 'default' : 'pointer',
          background: colors[status], display: 'flex', alignItems: 'center', justifyContent: 'center',
          boxShadow: status === 'listening' ? '0 0 0 8px rgba(16,185,129,0.2)' : '0 4px 16px rgba(0,0,0,0.25)',
          transition: 'all 0.2s',
        }}
      >
        {status === 'thinking'
          ? <Loader size={20} color="white" style={{ animation: 'spin 1s linear infinite' }} />
          : status === 'listening'
          ? <MicOff size={20} color="white" />
          : <Mic size={20} color="white" />
        }
      </button>

      {/* Popup result */}
      {(transcript || response) && (
        <div style={{
          position: 'fixed', bottom: 152, right: 20, zIndex: 100,
          background: 'var(--card)', border: '1px solid var(--border)', borderRadius: 12,
          padding: '12px 14px', maxWidth: 260, boxShadow: '0 8px 24px rgba(0,0,0,0.15)',
        }}>
          {transcript && <div style={{ fontSize: 12, color: 'var(--muted)', marginBottom: 4 }}>"{transcript}"</div>}
          {response && <div style={{ fontSize: 13, color: status === 'error' ? '#e53e3e' : '#10b981', fontWeight: 500 }}>{response}</div>}
        </div>
      )}

      <style>{`@keyframes spin { from { transform: rotate(0deg) } to { transform: rotate(360deg) } }`}</style>
    </>
  )
}
