import Anthropic from '@anthropic-ai/sdk'
import { NextRequest, NextResponse } from 'next/server'

const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY })

const SYSTEM_PROMPT = `Jsi asistent pro úkoly, finance, cíle a projekty. Odpovídej pouze česky.

Zavolej přesně jeden nástroj podle záměru uživatele. Pokud je příkaz nejasný, obecný nebo kratší než 3 slova, nevolej nic a požádej o upřesnění.

Pro volitelná pole NIKDY se neptej na upřesnění — vždy použij výchozí hodnotu: datum bez zmínky=dnes, typ příjmu/výdaje bez zmínky=jednorázový, status příjmu bez zmínky=zaplaceno, kategorie bez zmínky=Ostatní. Pokud uživatel zmíní zdroj příjmu jen nepřímo (např. "za projekt X"), použij to jako klienta/zdroj — neptej se znovu. U úkolu (add_task): pokud není řečen deadline, nastav ho na dnešek. Pokud není řečena priorita, nastav High.

Částky piš číslem (patnáct tisíc=15000, stovka=100). Relativní data přepočítej na YYYY-MM-DD. Priorita: urgentně/hned=High, bez zmínky=Medium, někdy=Low.

Pokud uživatel zmíní čas (v 8 hodin, na 9:30, v půl čtvrté), přidej tento čas do názvu úkolu ve formátu "v HH:MM" a nastav deadline na správné datum. Čas bez data = dnes, "zítra" = zítřejší datum. Česká zlomková vyjádření: "v půl čtvrté"=15:30, "ve čtvrt na devět"=08:15, "tři čtvrtě na devět"=08:45, "v osm ráno"=08:00, "v osm večer"=20:00.

Po provedení odpověz jednou krátkou větou, co jsi udělal.`

const today = () => {
  const d = new Date()
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

// Strips diacritics + lowercases so keyword matching survives ASR spelling variance ("úkol" vs "ukol").
const normalize = (s: string) => s.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase()

const CATEGORY_TOOLS: Record<string, string[]> = {
  task: ['add_task', 'update_task', 'delete_task'],
  finance: ['add_income', 'add_expense', 'add_debt', 'add_fixed_cost', 'toggle_debt_status', 'delete_transaction'],
  goal: ['add_goal', 'update_goal_progress', 'add_milestone', 'toggle_milestone'],
  project: ['add_project'],
  summary: ['get_summary'],
}

const CATEGORY_KEYWORDS: Record<string, string[]> = {
  task: ['ukol', 'task', 'udelat', 'splnit', 'pridat ukol', 'jit', 'zavolat', 'koupit', 'napsat', 'dokoncit', 'pripravit', 'poslat', 'zkontrolovat'],
  finance: ['prijem', 'vydaj', 'vydelal', 'zaplatil', 'dluh', 'kc', 'korun'],
  goal: ['cil', 'goal', 'pokrok', 'splnil jsem'],
  project: ['projekt'],
  summary: ['jak na tom', 'prehled', 'shrn', 'kolik mam'],
}

// Bumped every time Claude actually picks a tool — used as the "top 5 most used" fallback pool.
const toolUsageCounts: Record<string, number> = {}
const DEFAULT_FALLBACK_TOOLS = ['add_task', 'add_income', 'add_expense', 'add_goal', 'get_summary']

function detectToolNames(text: string): { names: string[]; matchedCategories: string[] } {
  const n = normalize(text)
  const matchedCategories = Object.keys(CATEGORY_KEYWORDS).filter(cat =>
    CATEGORY_KEYWORDS[cat].some(kw => n.includes(normalize(kw)))
  )
  if (matchedCategories.length === 0) {
    const ranked = Object.entries(toolUsageCounts).sort((a, b) => b[1] - a[1]).map(([name]) => name)
    const names = ranked.length > 0 ? ranked.slice(0, 5) : DEFAULT_FALLBACK_TOOLS
    return { names, matchedCategories: ['fallback:top5'] }
  }
  const names = Array.from(new Set(matchedCategories.flatMap(cat => CATEGORY_TOOLS[cat])))
  return { names, matchedCategories }
}

const tools: Anthropic.Tool[] = [
  {
    name: 'add_task',
    description: 'Přidá nový úkol podle popisu uživatele.',
    input_schema: {
      type: 'object',
      properties: {
        nazev: { type: 'string', description: 'Konkrétní smysluplný název úkolu' },
        priorita: { type: 'string', enum: ['High', 'Medium', 'Low'], description: 'Priorita, default High' },
        deadline: { type: ['string', 'null'], description: 'Termín YYYY-MM-DD, default dnes' },
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
        status: { type: 'string', enum: ['zaplaceno', 'ceka'], description: 'zaplaceno nebo ceka, default zaplaceno' },
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

  const { names: routedNames, matchedCategories } = detectToolNames(text)
  const routedTools = tools.filter(t => routedNames.includes(t.name))
  console.log(`[voice] routing categories=[${matchedCategories.join(',')}] tools=[${routedNames.join(',')}]`)

  const model = 'claude-haiku-4-5-20251001'
  const message = await client.messages.create({
    model,
    max_tokens: 1024,
    system: SYSTEM_PROMPT,
    tools: routedTools,
    messages: [{ role: 'user', content: `Dnešní datum: ${today()}\n\nUživatel řekl: "${text}"` }],
  })

  const inputTokens = message.usage.input_tokens
  const outputTokens = message.usage.output_tokens
  const totalTokens = inputTokens + outputTokens
  console.log(`[voice] model=${model} input_tokens=${inputTokens} output_tokens=${outputTokens} total_tokens=${totalTokens}`)

  const toolCalls = message.content
    .filter((b): b is Anthropic.ToolUseBlock => b.type === 'tool_use')
    .map(b => ({ id: b.id, name: b.name, input: b.input as Record<string, unknown> }))

  for (const call of toolCalls) {
    toolUsageCounts[call.name] = (toolUsageCounts[call.name] || 0) + 1
  }

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
