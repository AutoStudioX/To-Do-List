import Anthropic from '@anthropic-ai/sdk'
import { NextRequest, NextResponse } from 'next/server'

const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY })

const today = () => {
  const d = new Date()
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

export async function POST(req: NextRequest) {
  const { text, context } = await req.json()
  if (!text) return NextResponse.json({ error: 'No text' }, { status: 400 })

  const contextBlock = context ? `
Existující úkoly uživatele (pro mazání/úpravu):
${JSON.stringify(context.ukoly || [], null, 2)}
` : ''

  const prompt = `Jsi asistent pro osobní produktivitu. Uživatel ti řekl: "${text}"

Dnešní datum: ${today()}
${contextBlock}

Analyzuj příkaz a vrať JSON (bez markdown, jen čistý JSON) v tomto formátu:
{
  "action": "add_ukol" | "add_prijem" | "add_vydaj" | "add_goal" | "add_dluh" | "add_fixni" | "delete_ukol" | "update_ukol" | "unknown",
  "data": { ... },
  "response": "Krátká česká potvrzovací zpráva co jsi udělal"
}

Pro add_ukol data obsahuje: { nazev, priorita ("High"|"Medium"|"Low"), deadline (YYYY-MM-DD nebo null), projekt (nebo null) }
Pro add_prijem data obsahuje: { klient, castka (číslo), datum (YYYY-MM-DD), opakovani ("jednorazovy"|"mesicni"), status ("ceka"|"zaplaceno") }
Pro add_vydaj data obsahuje: { nazev, castka (číslo), datum (YYYY-MM-DD), kategorie (nebo "Ostatní") }
Pro add_goal data obsahuje: { nazev, deadline (YYYY-MM-DD nebo null), popis (nebo null) }
Pro add_dluh data obsahuje: { komu_kdo (jméno osoby), castka (číslo), smer ("moje" = já dlužím, "mne" = dluží mi), datum (YYYY-MM-DD), popis (nebo null) }
  - "dluh od X" nebo "X mi dluží" → smer: "mne"
  - "dlužím X" nebo "půjčil jsem si od X" → smer: "moje"
Pro add_fixni data obsahuje: { nazev, castka (číslo), opakovani ("mesicni"|"rocni") }
Pro delete_ukol data obsahuje: { id (UUID z existujících úkolů — vyber nejpodobnější název) }
Pro update_ukol data obsahuje: { id (UUID), nazev (nový nebo stejný), status ("Todo"|"In Progress"|"Done"|null), priorita ("High"|"Medium"|"Low"|null), deadline (YYYY-MM-DD nebo null) }
  - "označ úkol X jako hotový" → update_ukol, status: "Done"
  - "smaž úkol X" → delete_ukol
  - "změň prioritu úkolu X na vysokou" → update_ukol, priorita: "High"

Pokud příkaz nerozumíš nebo neodpovídá žádné akci, použij "unknown" a v response vysvětli proč.

Příklady:
- "přidej úkol zavolat klientovi do pátku" → add_ukol
- "přidej příjem od Honzy pět tisíc korun" → add_prijem
- "přidej výdaj za oběd dvě stě korun" → add_vydaj
- "přidej goal dokončit projekt do konce měsíce" → add_goal
- "přidej dluh od mamky 200 korun" → add_dluh, smer: "mne"
- "dlužím Petrovi 500 korun" → add_dluh, smer: "moje"
- "přidej fixní náklad Netflix 300 korun měsíčně" → add_fixni
- "smaž úkol zavolat klientovi" → delete_ukol (najdi nejpodobnější v seznamu)
- "označ úkol X jako hotový" → update_ukol, status: "Done"
- "změň prioritu úkolu X na vysokou" → update_ukol, priorita: "High"

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
