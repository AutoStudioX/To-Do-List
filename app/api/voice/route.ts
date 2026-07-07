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
Existující úkoly uživatele (pro úpravy):
${JSON.stringify(context.ukoly || [], null, 2)}
` : ''

  const prompt = `Jsi asistent pro osobní produktivitu. Uživatel ti řekl: "${text}"

Dnešní datum: ${today()}
${contextBlock}

Analyzuj příkaz. Může obsahovat VÍCE akcí najednou. Vrať JSON (bez markdown) v tomto formátu:
{
  "actions": [
    { "action": "...", "data": { ... } },
    ...
  ],
  "response": "Krátká česká potvrzovací zpráva co vše jsi udělal"
}

Možné akce:
- add_ukol: { nazev, priorita ("High"|"Medium"|"Low"), deadline (YYYY-MM-DD nebo null), projekt (nebo null) }
- add_prijem: { klient, castka (číslo), datum (YYYY-MM-DD), opakovani ("jednorazovy"|"mesicni"), status ("ceka"|"zaplaceno") }
- add_vydaj: { nazev, castka (číslo), datum (YYYY-MM-DD), kategorie (nebo "Ostatní") }
- add_goal: { nazev, deadline (YYYY-MM-DD nebo null), popis (nebo null) }
- add_dluh: { komu_kdo, castka (číslo), smer ("moje"=já dlužím | "mne"=dluží mi), datum (YYYY-MM-DD), popis (nebo null) }
- add_fixni: { nazev, castka (číslo), opakovani ("mesicni"|"rocni") }
- update_ukol: { id (UUID z kontextu), status ("Done"|"In Progress"|"Todo"|null), priorita (nebo null), deadline (nebo null) }
- delete_vydaje_month: { year: YYYY, month: MM }
- unknown: { reason: "proč nevím" }

PRAVIDLA:
- "smaž úkol X" nebo "hotovo X" → update_ukol status Done (nikdy nemaž)
- Nikdy neprováděj hromadné mazání bez filtru (měsíc/rok/jméno)
- Pokud část příkazu nerozumíš, přidej pro tu část { action: "unknown", data: { reason: "..." } }

Příklady:
- "přidej příjem od Honzy 5000 a úkol zavolat mu" → 2 akce: add_prijem + add_ukol
- "přidej výdaj za oběd 200 a dluh od Petra 1000" → 2 akce: add_vydaj + add_dluh
- "hotovo zavolat klientovi a přidej úkol poslat fakturu" → update_ukol Done + add_ukol

Vrať pouze JSON, žádný jiný text.`

  const message = await client.messages.create({
    model: 'claude-haiku-4-5-20251001',
    max_tokens: 1024,
    messages: [{ role: 'user', content: prompt }],
  })

  const raw = (message.content[0] as { type: string; text: string }).text.trim()
    .replace(/^```json\s*/i, '').replace(/^```\s*/i, '').replace(/```\s*$/i, '').trim()
  try {
    const parsed = JSON.parse(raw)
    // Support both old single-action format and new multi-action format
    if (!parsed.actions && parsed.action) {
      parsed.actions = [{ action: parsed.action, data: parsed.data }]
    }
    return NextResponse.json(parsed)
  } catch {
    return NextResponse.json({ actions: [{ action: 'unknown', data: {} }], response: `Nerozuměl jsem: ${raw.slice(0, 100)}` })
  }
}
