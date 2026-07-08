import Anthropic from '@anthropic-ai/sdk'
import { NextRequest, NextResponse } from 'next/server'

const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY })

const SYSTEM_PROMPT = `Jsi asistent pro úkoly, finance, cíle a projekty. Odpovídej pouze česky.

Zavolej přesně jeden nástroj podle záměru uživatele. Pokud je příkaz nejasný, obecný nebo kratší než 3 slova, nevolej nic a požádej o upřesnění.

Částky piš číslem (patnáct tisíc=15000, stovka=100). Relativní data přepočítej na YYYY-MM-DD. Priorita: urgentně/hned=High, bez zmínky=Medium, někdy=Low.

Po provedení odpověz jednou krátkou větou, co jsi udělal.`

const today = () => {
  const d = new Date()
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

const tools: Anthropic.Tool[] = [
  {
    name: 'add_task',
    description: 'Přidá nový úkol podle popisu uživatele.',
    input_schema: {
      type: 'object',
      properties: {
        nazev: { type: 'string', description: 'Konkrétní smysluplný název úkolu' },
        priorita: { type: 'string', enum: ['High', 'Medium', 'Low'], description: 'Priorita, default Medium' },
        deadline: { type: ['string', 'null'], description: 'Termín YYYY-MM-DD, nebo null' },
        projekt: { type: ['string', 'null'], description: 'Název projektu, nebo null' },
      },
      required: ['nazev'],
    },
  },
  {
    name: 'update_task',
    description: 'Upraví úkol nalezený podle jména (fuzzy).',
    input_schema: {
      type: 'object',
      properties: {
        task_name: { type: 'string', description: 'Název úkolu k nalezení' },
        updates: {
          type: 'object',
          description: 'Pole ke změně',
          properties: {
            status: { type: 'string', enum: ['Todo', 'In Progress', 'Done'] },
            priorita: { type: 'string', enum: ['High', 'Medium', 'Low'] },
            deadline: { type: ['string', 'null'] },
            projekt: { type: ['string', 'null'] },
          },
        },
      },
      required: ['task_name', 'updates'],
    },
  },
  {
    name: 'delete_task',
    description: 'Smaže úkol nalezený podle jména.',
    input_schema: {
      type: 'object',
      properties: {
        task_name: { type: 'string', description: 'Název úkolu ke smazání' },
      },
      required: ['task_name'],
    },
  },
  {
    name: 'add_income',
    description: 'Přidá příjem uživatele.',
    input_schema: {
      type: 'object',
      properties: {
        castka: { type: 'number', description: 'Částka v Kč' },
        klient: { type: 'string', description: 'Jméno klienta nebo zdroj' },
        datum: { type: ['string', 'null'], description: 'Datum, nebo null' },
        typ: { type: 'string', enum: ['jednorazovy', 'mesicni'], description: 'jednorazovy nebo mesicni' },
      },
      required: ['castka', 'klient'],
    },
  },
  {
    name: 'add_expense',
    description: 'Přidá výdaj uživatele.',
    input_schema: {
      type: 'object',
      properties: {
        castka: { type: 'number', description: 'Částka v Kč' },
        nazev: { type: 'string', description: 'Název / popis výdaje' },
        datum: { type: ['string', 'null'], description: 'Datum, nebo null' },
        kategorie: { type: ['string', 'null'], description: 'Kategorie, nebo null' },
      },
      required: ['castka', 'nazev'],
    },
  },
  {
    name: 'add_debt',
    description: 'Přidá dluh — můj nebo cizí.',
    input_schema: {
      type: 'object',
      properties: {
        castka: { type: 'number', description: 'Částka v Kč' },
        komu_kdo: { type: 'string', description: 'Komu nebo kdo dluží' },
        smer: { type: 'string', enum: ['muj_dluh', 'dluzi_mi'], description: 'muj_dluh nebo dluzi_mi' },
        datum: { type: ['string', 'null'], description: 'Datum, nebo null' },
        popis: { type: ['string', 'null'], description: 'Poznámka, nebo null' },
      },
      required: ['castka', 'komu_kdo', 'smer'],
    },
  },
  {
    name: 'add_fixed_cost',
    description: 'Přidá pravidelný měsíční fixní náklad.',
    input_schema: {
      type: 'object',
      properties: {
        nazev: { type: 'string', description: 'Název fixního nákladu' },
        castka: { type: 'number', description: 'Částka v Kč' },
      },
      required: ['nazev', 'castka'],
    },
  },
  {
    name: 'toggle_debt_status',
    description: 'Přepne dluh mezi splaceno/nesplaceno.',
    input_schema: {
      type: 'object',
      properties: {
        debt_name: { type: 'string', description: 'Jméno u dluhu' },
      },
      required: ['debt_name'],
    },
  },
  {
    name: 'delete_transaction',
    description: 'Smaže transakci podle jména.',
    input_schema: {
      type: 'object',
      properties: {
        nazev: { type: 'string', description: 'Název transakce ke smazání' },
        typ: { type: ['string', 'null'], enum: ['prijem', 'vydaj', 'fixni_naklad', 'dluh'], description: 'Typ transakce, nebo null' },
      },
      required: ['nazev'],
    },
  },
  {
    name: 'add_goal',
    description: 'Přidá nový cíl.',
    input_schema: {
      type: 'object',
      properties: {
        nazev: { type: 'string', description: 'Název cíle' },
        deadline: { type: ['string', 'null'], description: 'Termín, nebo null' },
        target_value: { type: ['number', 'null'], description: 'Cílová hodnota, nebo null' },
      },
      required: ['nazev'],
    },
  },
  {
    name: 'update_goal_progress',
    description: 'Aktualizuje pokrok cíle podle jména.',
    input_schema: {
      type: 'object',
      properties: {
        goal_name: { type: 'string', description: 'Název cíle k nalezení' },
        current_value: { type: 'number', description: 'Nová hodnota nebo procento' },
      },
      required: ['goal_name', 'current_value'],
    },
  },
  {
    name: 'add_milestone',
    description: 'Přidá krok k existujícímu cíli.',
    input_schema: {
      type: 'object',
      properties: {
        goal_name: { type: 'string', description: 'Název cíle k nalezení' },
        milestone_name: { type: 'string', description: 'Název kroku' },
        deadline: { type: ['string', 'null'], description: 'Termín, nebo null' },
      },
      required: ['goal_name', 'milestone_name'],
    },
  },
  {
    name: 'toggle_milestone',
    description: 'Přepne krok cíle hotovo/nehotovo.',
    input_schema: {
      type: 'object',
      properties: {
        goal_name: { type: 'string', description: 'Název cíle k nalezení' },
        milestone_name: { type: 'string', description: 'Název kroku k nalezení' },
      },
      required: ['goal_name', 'milestone_name'],
    },
  },
  {
    name: 'add_project',
    description: 'Přidá nový projekt.',
    input_schema: {
      type: 'object',
      properties: {
        nazev: { type: 'string', description: 'Název projektu' },
      },
      required: ['nazev'],
    },
  },
  {
    name: 'get_summary',
    description: 'Vrátí přehled úkolů, financí, cílů.',
    input_schema: { type: 'object', properties: {} },
  },
]

export async function POST(req: NextRequest) {
  const { text } = await req.json()
  if (!text) return NextResponse.json({ error: 'No text' }, { status: 400 })

  const model = 'claude-haiku-4-5-20251001'
  const message = await client.messages.create({
    model,
    max_tokens: 1024,
    system: SYSTEM_PROMPT,
    tools,
    messages: [{ role: 'user', content: `Dnešní datum: ${today()}\n\nUživatel řekl: "${text}"` }],
  })

  const inputTokens = message.usage.input_tokens
  const outputTokens = message.usage.output_tokens
  const totalTokens = inputTokens + outputTokens
  console.log(`[voice] model=${model} input_tokens=${inputTokens} output_tokens=${outputTokens} total_tokens=${totalTokens}`)

  const toolCalls = message.content
    .filter((b): b is Anthropic.ToolUseBlock => b.type === 'tool_use')
    .map(b => ({ id: b.id, name: b.name, input: b.input as Record<string, unknown> }))

  const text_ = message.content
    .filter((b): b is Anthropic.TextBlock => b.type === 'text')
    .map(b => b.text)
    .join(' ')
    .trim()

  return NextResponse.json({
    toolCalls,
    response: text_,
    usage: { inputTokens, outputTokens, totalTokens, model },
  })
}
