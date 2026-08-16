import { createServerClient } from '@supabase/ssr'
import { cookies } from 'next/headers'

export async function createClient() {
  const cookieStore = await cookies()
  return createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() { return cookieStore.getAll() },
        setAll(cookiesToSet) {
          try {
            cookiesToSet.forEach(({ name, value, options }) =>
              cookieStore.set(name, value, options)
            )
          } catch {
            // Ze serverové komponenty cookies zapsat NELZE — Next tady vždycky
            // hodí výjimku a je to očekávaný stav: obnovu session dopíše
            // middleware, který běží dřív a cookie nastavit smí. Jediný prázdný
            // catch v repu, který má důvod (a proto ten důvod stojí tady).
          }
        },
      },
    }
  )
}
