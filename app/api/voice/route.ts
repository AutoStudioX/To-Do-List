import Anthropic from '@anthropic-ai/sdk'
import { NextRequest, NextResponse } from 'next/server'

const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY })

const SYSTEM_PROMPT = `Jsi osobní AI asistent pro správu úkolů, financí, cílů a projektů. Mluvíš výhradně česky. Každý hlasový příkaz zpracováváš jako zcela nezávislý požadavek bez kontextu předchozích příkazů.

NÁSTROJE A KDY JE POUŽÍT:
- add_task: uživatel popisuje konkrétní úkol který má udělat (min. 3 smysluplná slova)
- update_task: uživatel chce změnit status, prioritu nebo deadline existujícího úkolu
- delete_task: uživatel chce smazat úkol
- add_income: zmiňuje příjem, výdělek, platbu od klienta
- add_expense: zmiňuje výdaj, nákup, zaplatil, utratil
- add_debt: zmiňuje dluh — komu dluží nebo kdo dluží jemu
- add_fixed_cost: zmiňuje pravidelný měsíční náklad
- toggle_debt_status: chce označit dluh jako splacený
- delete_transaction: chce smazat transakci
- add_goal: chce přidat nový cíl
- update_goal_progress: splnil část cíle nebo chce aktualizovat pokrok
- add_milestone: chce přidat krok k existujícímu cíli
- toggle_milestone: chce označit krok cíle jako hotový
- add_project: chce přidat nový projekt
- get_summary: ptá se na přehled nebo statistiky

PRAVIDLA:
1. Vždy zavolej přesně jeden nástroj
2. Pokud příkaz není jasný nebo kratší než 3 slova, NEvolej nic — požádej o upřesnění
3. Částky: "patnáct tisíc"=15000, "půl mega"=500000, "stovka"=100
4. Data: "zítra"=zítřejší datum, "dneska"=dnes, "příští pátek"=vypočítej
5. Priority: "urgentně/hned/срочно"=High, bez zmínky=Medium, "někdy"=Low
6. Po provedení odpověz jednou krátkou větou co jsi udělal

NIKDY nevolej nástroj pro neúplnou větu, obecnou frázi nebo pokud si nejsi jistý záměrem.`

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
    name: 'update_task',
    description: 'Upraví existující úkol nalezený podle jména (fuzzy match, case insensitive). Použij pro změnu statusu, priority, deadline nebo projektu.',
    input_schema: {
      type: 'object',
      properties: {
        task_name: { type: 'string', description: 'Název úkolu (nebo jeho část) k nalezení' },
        updates: {
          type: 'object',
          description: 'Pole, která se mají změnit — vyplň jen ta, co uživatel zmínil',
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
    description: 'Smaže úkol nalezený podle jména (fuzzy match, case insensitive).',
    input_schema: {
      type: 'object',
      properties: {
        task_name: { type: 'string', description: 'Název úkolu (nebo jeho část) ke smazání' },
      },
      required: ['task_name'],
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
    name: 'add_debt',
    description: 'Přidá dluh (transakci typu dluh) — buď dluží uživatel někomu, nebo někdo dluží uživateli.',
    input_schema: {
      type: 'object',
      properties: {
        castka: { type: 'number', description: 'Částka v Kč' },
        komu_kdo: { type: 'string', description: 'Komu uživatel dluží, nebo kdo dluží uživateli' },
        smer: { type: 'string', enum: ['muj_dluh', 'dluzi_mi'], description: 'muj_dluh = uživatel dluží, dluzi_mi = někdo dluží uživateli' },
        datum: { type: ['string', 'null'], description: 'Datum YYYY-MM-DD, nebo null pro dnešní datum' },
        popis: { type: ['string', 'null'], description: 'Volitelná poznámka k dluhu' },
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
    description: 'Přepne stav dluhu mezi splaceno a nesplaceno. Nalezen podle jména (fuzzy match, case insensitive).',
    input_schema: {
      type: 'object',
      properties: {
        debt_name: { type: 'string', description: 'Komu/kdo dluh, jak ho uživatel zmínil' },
      },
      required: ['debt_name'],
    },
  },
  {
    name: 'delete_transaction',
    description: 'Smaže transakci (příjem, výdaj, fixní náklad nebo dluh) nalezenou podle jména.',
    input_schema: {
      type: 'object',
      properties: {
        nazev: { type: 'string', description: 'Název / popis transakce ke smazání' },
        typ: { type: ['string', 'null'], enum: ['prijem', 'vydaj', 'fixni_naklad', 'dluh'], description: 'Typ transakce pro upřesnění hledání, nebo null' },
      },
      required: ['nazev'],
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
    name: 'update_goal_progress',
    description: 'Aktualizuje pokrok existujícího cíle podle jména (fuzzy match, case insensitive). Použij když uživatel říká že splnil část cíle, vydělal určitou částku směrem k cíli, nebo chce aktualizovat pokrok.',
    input_schema: {
      type: 'object',
      properties: {
        goal_name: { type: 'string', description: 'Název cíle (nebo jeho část) tak jak ho uživatel zmínil — najde se nejpodobnější existující cíl' },
        current_value: { type: 'number', description: 'Nová aktuální hodnota cíle (např. kolik už vydělal). Pokud cíl nemá cílovou číselnou hodnotu (manuální cíl), interpretuj toto číslo přímo jako procento pokroku (0-100)' },
      },
      required: ['goal_name', 'current_value'],
    },
  },
  {
    name: 'add_milestone',
    description: 'Přidá krok (milník) k existujícímu cíli nalezenému podle jména (fuzzy match, case insensitive).',
    input_schema: {
      type: 'object',
      properties: {
        goal_name: { type: 'string', description: 'Název cíle (nebo jeho část), ke kterému se krok přidá' },
        milestone_name: { type: 'string', description: 'Název kroku' },
        deadline: { type: ['string', 'null'], description: 'Termín kroku YYYY-MM-DD, nebo null' },
      },
      required: ['goal_name', 'milestone_name'],
    },
  },
  {
    name: 'toggle_milestone',
    description: 'Přepne krok cíle mezi hotovo a nehotovo. Cíl i krok se hledají podle jména (fuzzy match, case insensitive).',
    input_schema: {
      type: 'object',
      properties: {
        goal_name: { type: 'string', description: 'Název cíle (nebo jeho část)' },
        milestone_name: { type: 'string', description: 'Název kroku (nebo jeho část)' },
      },
      required: ['goal_name', 'milestone_name'],
    },
  },
  {
    name: 'add_project',
    description: 'Přidá nový projekt do seznamu projektů uživatele.',
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
    description: 'Vrátí aktuální přehled uživatele: počet otevřených úkolů, celkové příjmy, progress cílů. Použij při dotazech typu "jak na tom jsem", "shrň mi to", "kolik mám otevřených úkolů".',
    input_schema: { type: 'object', properties: {} },
  },
]

export async function POST(req: NextRequest) {
  const { text } = await req.json()
  if (!text) return NextResponse.json({ error: 'No text' }, { status: 400 })

  const message = await client.messages.create({
    model: 'claude-haiku-4-5-20251001',
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
