import Anthropic from '@anthropic-ai/sdk'
import { NextRequest, NextResponse } from 'next/server'

const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY })

const SYSTEM_PROMPT = `Jsi osobní AI asistent pro správu úkolů, financí a cílů. Mluvíš výhradně česky.

TVOJE SCHOPNOSTI:
- Přidávat úkoly (add_task)
- Zaznamenávat příjmy (add_income)
- Zaznamenávat výdaje (add_expense)
- Přidávat cíle (add_goal)
- Aktualizovat pokrok cíle (update_goal_progress)
- Poskytovat přehled (get_summary)

PRAVIDLA PRO ROZHODOVÁNÍ:
1. Vždy zavolej přesně jeden nástroj — nikdy nevolej více najednou
2. add_task: pouze pokud uživatel popisuje konkrétní akci kterou má udělat. Název musí být smysluplná fráze (min. 3 slova). Nikdy nepřidávej úkol z neúplné věty nebo obecné fráze jako "nový úkol" nebo "high priorita"
3. add_income: pokud zmiňuje příjem, výdělek, platbu od klienta, fakturu
4. add_expense: pokud zmiňuje výdaj, nákup, zaplatil, utratil
5. add_goal: pokud chce přidat nový cíl nebo záměr do budoucna
6. update_goal_progress: pokud uživatel říká že splnil část cíle, vydělal určitou částku směrem k cíli, nebo chce aktualizovat pokrok. Například "splnil jsem 25 000 z cíle vydělat 100k" nebo "přidej 5 000 k mému cíli".
7. get_summary: pokud se ptá na přehled, statistiky nebo "jak na tom jsem"
8. Pokud příkaz není jasný nebo je příliš krátký (méně než 3 slova), NEvolej žádný nástroj — odpověz česky že nerozumíš a požádej o upřesnění

EXTRAKCE DAT:
- Částky: "patnáct tisíc" = 15000, "půl mega" = 500000, "stovka" = 100
- Data: "zítra" = zítřejší datum, "příští pátek" = vypočítej správně, "dneska" = dnešní datum
- Priority: "срочно/urgentně/hned" = High, bez zmínky = Medium, "někdy/až budu mít čas" = Low
- Projekty: rozpoznej zmínku o projektu nebo klientovi a přiřaď k projekt/klient poli

FORMÁT ODPOVĚDI:
Po zavolání nástroje vždy odpověz jednou krátkou větou potvrzující co jsi udělal. Například: "Přidán úkol: Zavolat trenérovi, priorita High, deadline zítra." nebo "Zaznamenán příjem 15 000 Kč od trenéra."`

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
