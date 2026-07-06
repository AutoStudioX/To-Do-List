import { SupabaseClient } from '@supabase/supabase-js'

export async function seedRecurring(supabase: SupabaseClient, userId: string) {
  const now = new Date()
  const year = now.getFullYear()
  const month = String(now.getMonth() + 1).padStart(2, '0')
  const yearMonth = `${year}-${month}`

  const { data: recurring } = await supabase
    .from('transakce')
    .select('*')
    .eq('user_id', userId)
    .in('opakovani', ['mesicni', 'rocni'])

  if (!recurring?.length) return

  const { data: existing } = await supabase
    .from('transakce')
    .select('nazev, typ, datum')
    .eq('user_id', userId)
    .gte('datum', `${year}-01-01`)

  const inserts: Record<string, unknown>[] = []
  const seen = new Set<string>()

  for (const t of recurring) {
    const key = `${t.nazev}|${t.typ}|${t.opakovani}`
    if (seen.has(key)) continue
    seen.add(key)

    if (t.opakovani === 'mesicni') {
      const exists = existing?.some(e => e.nazev === t.nazev && e.typ === t.typ && e.datum?.startsWith(yearMonth))
      if (!exists) {
        inserts.push({
          user_id: userId,
          nazev: t.nazev,
          castka: t.castka,
          datum: `${yearMonth}-01`,
          typ: t.typ,
          kategorie: t.kategorie,
          opakovani: 'mesicni',
          status: t.typ === 'prijem' ? 'ceka' : (t.status || null),
          klient: t.klient,
          poznamka: t.poznamka,
          smer: t.smer,
        })
      }
    } else if (t.opakovani === 'rocni') {
      const exists = existing?.some(e => e.nazev === t.nazev && e.typ === t.typ && e.datum?.startsWith(String(year)))
      if (!exists) {
        inserts.push({
          user_id: userId,
          nazev: t.nazev,
          castka: t.castka,
          datum: `${year}-01-01`,
          typ: t.typ,
          kategorie: t.kategorie,
          opakovani: 'rocni',
          status: t.typ === 'prijem' ? 'ceka' : (t.status || null),
          klient: t.klient,
          poznamka: t.poznamka,
          smer: t.smer,
        })
      }
    }
  }

  if (inserts.length) {
    await supabase.from('transakce').insert(inserts)
  }
}
