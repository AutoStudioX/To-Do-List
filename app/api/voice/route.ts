import Anthropic from '@anthropic-ai/sdk'
import { NextRequest, NextResponse } from 'next/server'

const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY })

const today = () => {
  const d = new Date()
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

export async function POST(req: NextRequest) {
  const { text } = await req.json()
  if (!text) return NextResponse.json({ error: 'No text' }, { status: 400 })

  const prompt = `Jsi asistent pro osobní produktivitu. Uživatel ti řekl: "${text}"

Dnešní datum: ${today()}

Analyzuj příkaz a vrať JSON (bez markdown, jen čistý JSON) v tomto formátu:
{
  "action": "add_ukol" | "add_prijem" | "add_vydaj" | "add_goal" | "unknown",
  "data": { ... },
  "response": "Krátká česká potvrzovací zpráva co jsi udělal"
}

Pro add_ukol data obsahuje: { nazev, priorita ("High"|"Medium"|"Low"), deadline (YYYY-MM-DD nebo null), projekt (nebo null) }
Pro add_prijem data obsahuje: { klient, castka (číslo), datum (YYYY-MM-DD), opakovani ("jednorazovy"|"mesicni"), status ("ceka"|"zaplaceno") }
Pro add_vydaj data obsahuje: { nazev, castka (číslo), datum (YYYY-MM-DD), kategorie (nebo "Ostatní"), opakovani (false) }
Pro add_goal data obsahuje: { nazev, deadline (YYYY-MM-DD nebo null), popis (nebo null) }

Pokud příkaz nerozumíš nebo neodpovídá žádné akci, použij "unknown" a v response vysvětli proč.

Příklady:
- "přidej úkol zavolat klientovi do pátku" → add_ukol
- "přidej příjem od Honzy pět tisíc korun" → add_prijem
- "přidej výdaj za oběd dvě stě korun" → add_vydaj
- "přidej goal dokončit projekt do konce měsíce" → add_goal

Vrať pouze JSON, žádný jiný text.`

  const message = await client.messages.create({
    model: 'claude-haiku-4-5-20251001',
    max_tokens: 512,
    messages: [{ role: 'user', content: prompt }],
  })

  const raw = (message.content[0] as { type: string; text: string }).text.trim()
  try {
    const parsed = JSON.parse(raw)
    return NextResponse.json(parsed)
  } catch {
    return NextResponse.json({ action: 'unknown', data: {}, response: 'Nerozuměl jsem příkazu.' })
  }
}
