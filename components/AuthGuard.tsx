'use client'
import { useEffect } from 'react'
import { useRouter, usePathname } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'

export default function AuthGuard({ children }: { children: React.ReactNode }) {
  const router = useRouter()
  const pathname = usePathname()

  useEffect(() => {
    if (pathname === '/login' || pathname.startsWith('/auth')) return
    const supabase = createClient()
    void supabase.auth.getSession().then((result: { data: { session: unknown } }) => {
      if (!result.data.session) router.push('/login')
    })
  }, [pathname])

  return <>{children}</>
}
