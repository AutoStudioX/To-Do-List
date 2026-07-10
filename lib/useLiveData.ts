import { useEffect, useRef } from 'react'
import { createClient } from '@/lib/supabase/client'

// Keeps a page's data fresh across devices without a manual reload.
// Three layers, most-instant first, each a fallback for the previous:
//   1. Supabase Realtime — near-instant when the tables are in the
//      supabase_realtime publication (see CLAUDE.md). Silently no-ops if not.
//   2. Refetch when the tab/app regains focus or becomes visible — makes
//      switching from one device to another show the latest immediately.
//   3. A light poll while the page is visible — catches side-by-side devices.
export function useLiveData(tables: string[], refresh: () => void, pollMs = 20000) {
  const refreshRef = useRef(refresh)
  refreshRef.current = refresh
  const key = tables.join(',')

  useEffect(() => {
    const supabase = createClient()
    const channel = supabase.channel(`live-${key}`)
    for (const table of tables) {
      channel.on(
        'postgres_changes' as 'system',
        { event: '*', schema: 'public', table } as { event: '*'; schema: string; table: string },
        () => refreshRef.current(),
      )
    }
    channel.subscribe()

    const onVisible = () => {
      if (document.visibilityState === 'visible') refreshRef.current()
    }
    window.addEventListener('focus', onVisible)
    document.addEventListener('visibilitychange', onVisible)

    const id = setInterval(() => {
      if (document.visibilityState === 'visible') refreshRef.current()
    }, pollMs)

    return () => {
      supabase.removeChannel(channel)
      window.removeEventListener('focus', onVisible)
      document.removeEventListener('visibilitychange', onVisible)
      clearInterval(id)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key, pollMs])
}
