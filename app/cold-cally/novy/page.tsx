'use client'
import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import CallForm from '@/components/coldCalls/CallForm'
import { Toast, useToast } from '@/components/Toast'

export default function NovyHovorPage() {
  const router = useRouter()
  const [isMobile, setIsMobile] = useState(false)
  const { toast, showToast, hideToast } = useToast()

  useEffect(() => {
    const check = () => setIsMobile(window.innerWidth <= 768)
    check()
    window.addEventListener('resize', check)
    return () => window.removeEventListener('resize', check)
  }, [])

  return (
    <>
      <CallForm
        isMobile={isMobile}
        onSaved={(h) => { showToast(h); router.push('/cold-cally') }}
        onError={(h) => showToast(h, 'error')}
      />
      {toast && <Toast message={toast.message} type={toast.type} onClose={hideToast} />}
    </>
  )
}
