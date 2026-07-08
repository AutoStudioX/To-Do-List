import Anthropic from '@anthropic-ai/sdk'
import { NextRequest, NextResponse } from 'next/server'

const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY })

const SYSTEM_PROMPT = 'Jsi osobní asistent. Parsuj hlasové příkazy a zavolej správný nástroj. Vždy odpovídej v češtině.'

const today = () => {
  const d = new Date()
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

const tools: Anthropic.Tool[] = [
  {
    name: 'add_task',
    description: 'Přidá nový úkol do seznamu úkolů uživatele (tabulka ukoly). Použij jen pokud uživatel jasně popisuje konkrétní, smysluplný úkol — ne obecné fráze.',
    input_schema: {
      type: 'object',
      properties: {
        nazev: { type: 'string', description: 'Konkrétní název úkolu, celá smysluplná fráze (ne jen "úkol" nebo "priorita")' },
        priorita: { type: 'string', enum: ['High', 'Medium', 'Low'], description: 'Priorita úkolu, pokud není řečena použij Medium' },
        deadline: { type: ['string', 'null'], description: 'Termín ve formátu YYYY-MM-DD, nebo null pokud nezadán' },
        projekt: { type: ['string', 'null'], description: 'Název projektu, nebo null' },
      },
      required: ['nazev'],
    },
  },
  {
    name: 'add_income',
    description: 'Přidá příjem (transakci typu příjem) uživatele.',
    input_schema: {
      type: 'object',
      properties: {
        castka: { type: 'number', description: 'Částka v Kč' },
        klient: { type: 'string', description: 'Jméno klienta nebo zdroj příjmu' },
        datum: { type: ['string', 'null'], description: 'Datum YYYY-MM-DD, nebo null pro dnešní datum' },
        typ: { type: 'string', enum: ['jednorazovy', 'mesicni'], description: 'Typ příjmu, pokud není řečeno použij jednorazovy' },
      },
      required: ['castka', 'klient'],
    },
  },
  {
    name: 'add_expense',
    description: 'Přidá výdaj (transakci typu výdaj) uživatele.',
    input_schema: {
      type: 'object',
      properties: {
        castka: { type: 'number', description: 'Částka v Kč' },
        nazev: { type: 'string', description: 'Název / popis výdaje' },
        datum: { type: ['string', 'null'], description: 'Datum YYYY-MM-DD, nebo null pro dnešní datum' },
        kategorie: { type: ['string', 'null'], description: 'Kategorie výdaje, nebo null pro "Ostatní"' },
      },
      required: ['castka', 'nazev'],
    },
  },
  {
    name: 'add_goal',
    description: 'Přidá nový cíl (goal) uživatele.',
    input_schema: {
      type: 'object',
      properties: {
        nazev: { type: 'string', description: 'Název cíle' },
        deadline: { type: ['string', 'null'], description: 'Termín YYYY-MM-DD, nebo null' },
        target_value: { type: ['number', 'null'], description: 'Cílová číselná hodnota (např. částka), nebo null pro čistě manuální cíl bez čísla' },
      },
      required: ['nazev'],
    },
  },
  {
    name: 'get_summary',
    description: 'Vrátí aktuální přehled uživatele: počet otevřených úkolů, celkové příjmy, progress cílů. Použij při dotazech typu "jak na tom jsem", "shrň mi to", "kolik mám otevřených úkolů".',
    input_schema: { type: 'object', properties: {} },
  },
]

export async function POST(req: NextRequest) {
  const { text } = await req.json()
  if (!text) return NextResponse.json({ error: 'No text' }, { status: 400 })

  const message = await client.messages.create({
    model: 'claude-sonnet-4-6',
    max_tokens: 1024,
    system: SYSTEM_PROMPT,
    tools,
    messages: [{ role: 'user', content: `Dnešní datum: ${today()}\n\nUživatel řekl: "${text}"` }],
  })

  const toolCalls = message.content
    .filter((b): b is Anthropic.ToolUseBlock => b.type === 'tool_use')
    .map(b => ({ id: b.id, name: b.name, input: b.input as Record<string, unknown> }))

  const text_ = message.content
    .filter((b): b is Anthropic.TextBlock => b.type === 'text')
    .map(b => b.text)
    .join(' ')
    .trim()

  return NextResponse.json({ toolCalls, response: text_ })
}
