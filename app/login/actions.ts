'use server'
import { headers } from 'next/headers'
import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient, varujChybejiciKlic } from '@/lib/supabase/admin'

export type LoginState = { error?: string; locked?: boolean }

const LOCKED_MSG = 'Příliš mnoho pokusů, zkuste to za 15 minut'
const IP_BLOCKED_MSG = 'Přístup z této sítě byl zablokován. Kontaktujte správce.'
const CHECK_FAILED_MSG = 'Přihlášení je dočasně nedostupné, zkuste to za chvíli.'

function clientIp(h: Headers): string {
  const xff = h.get('x-forwarded-for')
  if (xff) return xff.split(',')[0].trim()
  return h.get('x-real-ip')?.trim() || 'unknown'
}

// Czech pluralisation for "Zbývají N pokusy."
function remainingMsg(n: number): string {
  if (n <= 0) return ''
  if (n === 1) return 'Zbývá 1 pokus.'
  if (n < 5) return `Zbývají ${n} pokusy.`
  return `Zbývá ${n} pokusů.`
}

export async function loginAction(_prev: LoginState, formData: FormData): Promise<LoginState> {
  const email = String(formData.get('email') || '').trim()
  const password = String(formData.get('password') || '')
  const emailNorm = email.toLowerCase()
  if (!emailNorm || !password) return { error: 'Zadejte e-mail i heslo.' }

  const ip = clientIp(await headers())
  const supabase = await createClient()
  // Zámek účtu jede přes service-role klienta: od migrace 0025 tyhle RPC anon
  // volat nesmí, protože veřejným klíčem si šlo počítadlo pokusů vynulovat.
  const admin = createAdminClient()
  if (!admin) varujChybejiciKlic('loginAction')

  let ok = false
  try {
    if (admin) {
      // 1. IP permanently blocked? (before anything else)
      const { data: ipBlocked, error: ipErr } = await admin.rpc('check_ip_block', { p_ip: ip })
      // Nepovedená kontrola = ZAMČENO. Přihlásit někoho jen proto, že se nešlo
      // zeptat, jestli není zamčený, je přesně ta díra, kterou má zámek řešit.
      if (ipErr) return { error: CHECK_FAILED_MSG, locked: true }
      if (ipBlocked === true) return { error: IP_BLOCKED_MSG, locked: true }

      // 2. Email locked? MUST run BEFORE signInWithPassword so a locked account is
      //    rejected even when the correct password is supplied.
      const { data: lock, error: lockErr } = await admin.rpc('check_login_lockout', { p_email: emailNorm })
      if (lockErr) return { error: CHECK_FAILED_MSG, locked: true }
      if (lock?.locked) return { error: LOCKED_MSG, locked: true }
    }

    // 3. Attempt the actual sign-in.
    const { error } = await supabase.auth.signInWithPassword({ email, password })
    if (error) {
      if (!admin) return { error: 'Nesprávný e-mail nebo heslo.' }
      const { data: after } = await admin.rpc('record_failed_login', { p_email: emailNorm, p_ip: ip })
      if (after?.ip_blocked) return { error: IP_BLOCKED_MSG, locked: true }
      if (after?.email_locked) return { error: LOCKED_MSG, locked: true }
      const rem = remainingMsg(Number(after?.attempts_left ?? 0))
      return { error: 'Nesprávný e-mail nebo heslo.' + (rem ? ' ' + rem : '') }
    }

    // 4. Success → reset counters. Volá se PŘIHLÁŠENÝM klientem: funkce si bere
    //    účet z `auth.uid()`, takže cizí počítadlo se tudy vynulovat nedá.
    await supabase.rpc('reset_login_attempts', { p_email: emailNorm, p_ip: ip })
    ok = true
  } catch {
    return { error: 'Nepodařilo se připojit k serveru. Zkontrolujte připojení k internetu.' }
  }

  if (ok) redirect('/prehled') // redirect() throws by design — keep it outside try/catch
  return {}
}
