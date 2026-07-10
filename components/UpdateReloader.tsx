'use client'
import { useEffect } from 'react'

// Mobile PWAs resume the existing document instead of re-navigating, so a new
// deployment isn't picked up until a manual reload. This watches for a new
// build and reloads automatically when the app regains focus.
//
// The "build signature" is the sorted set of hashed /_next/static script URLs
// in the page HTML. Next.js gives every build new contenthash filenames, so a
// changed signature = a new deployment.
export default function UpdateReloader() {
  useEffect(() => {
    if (typeof window === 'undefined') return

    const scriptRe = /\/_next\/static\/[^"'\s>]+\.js/g
    const current = signatureFrom(document.documentElement.outerHTML)
    let checking = false
    let lastCheck = 0

    function signatureFrom(html: string): string {
      const found = html.match(scriptRe)
      if (!found) return ''
      return Array.from(new Set(found)).sort().join(',')
    }

    async function checkForUpdate() {
      // Throttle: at most once per 30s, and never overlap fetches.
      const now = Date.now()
      if (checking || now - lastCheck < 30000) return
      if (document.visibilityState !== 'visible') return
      checking = true
      lastCheck = now
      try {
        const res = await fetch(location.href, { cache: 'no-store' })
        if (!res.ok) return
        const html = await res.text()
        const latest = signatureFrom(html)
        // Only reload when we got a real signature that differs — avoids loops.
        if (latest && current && latest !== current) {
          location.reload()
        }
      } catch {
        // offline or transient — try again next time
      } finally {
        checking = false
      }
    }

    const onVisible = () => { if (document.visibilityState === 'visible') checkForUpdate() }
    window.addEventListener('focus', onVisible)
    document.addEventListener('visibilitychange', onVisible)
    const id = setInterval(checkForUpdate, 60000)

    return () => {
      window.removeEventListener('focus', onVisible)
      document.removeEventListener('visibilitychange', onVisible)
      clearInterval(id)
    }
  }, [])

  return null
}
