import { createClient } from '@supabase/supabase-js'

/**
 * Klient se service-role klíčem — POUZE pro server.
 *
 * Slouží k jediné věci: volat funkce přihlašovacího toku (`check_ip_block`,
 * `check_login_lockout`, `record_failed_login`, `check_lock_state`), které od
 * migrace 0025 nesmí volat anon. Předtím je mohl volat kdokoli veřejným
 * klíčem a vypnout si tím zámek účtu (viz audit, nález 1).
 *
 * Klíč se čte z proměnné BEZ prefixu `NEXT_PUBLIC_`, takže ho Next do
 * klientského bundlu nezabalí — v prohlížeči by z něj byl `undefined` a klient
 * by se nevytvořil. Tenhle modul proto importuj jen ze serverového kódu
 * (server action, server komponenta, route handler).
 *
 * Vrací `null`, když klíč není nastavený. Volající s tím MUSÍ počítat —
 * appka se kvůli chybějící proměnné nesmí stát nepoužitelnou (jinak by se
 * majitel zamkl venku), jen v tom případě nefunguje zámek účtu a zůstává
 * per-IP limit Supabase.
 */
export function createAdminClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!url || !key) return null
  return createClient(url, key, {
    auth: { persistSession: false, autoRefreshToken: false },
  })
}

/** Hláška do logu, ať je z produkce poznat, proč zámek nereaguje. */
export function varujChybejiciKlic(kde: string) {
  console.error(
    `[login] SUPABASE_SERVICE_ROLE_KEY není nastavený (${kde}) — ochrana proti ` +
    'hrubé síle je vypnutá, zbývá jen per-IP limit Supabase.',
  )
}
