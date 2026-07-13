'use client'
import { useCallback, useEffect, useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { Toast, useToast } from '@/components/Toast'
import { LockKeyhole, Unlock, ShieldAlert } from 'lucide-react'

type LockedAccount = { user_id: string; email: string; failed_attempts: number; locked_until: string }

export default function AdminPage() {
  const [locked, setLocked] = useState<LockedAccount[]>([])
  const [loading, setLoading] = useState(true)
  const [authorized, setAuthorized] = useState<boolean | null>(null)
  const [unlocking, setUnlocking] = useState<string | null>(null)
  const { toast, showToast, hideToast } = useToast()

  const load = useCallback(async () => {
    const supabase = createClient()
    setLoading(true)
    const { data, error } = await supabase.rpc('admin_list_locked_accounts')
    if (error) {
      // The RPC raises "not authorized" for non-admins.
      setAuthorized(false)
    } else {
      setAuthorized(true)
      setLocked((data as LockedAccount[]) || [])
    }
    setLoading(false)
  }, [])

  useEffect(() => { load() }, [load])

  async function unlock(acc: LockedAccount) {
    setUnlocking(acc.user_id)
    const { error } = await createClient().rpc('admin_unlock_account', { target: acc.user_id })
    setUnlocking(null)
    if (error) { showToast('Chyba: ' + error.message); return }
    setLocked(prev => prev.filter(a => a.user_id !== acc.user_id))
    showToast(`Účet ${acc.email} odemčen`)
  }

  if (loading) return <div style={{ color: 'var(--muted)', padding: 24 }}>Načítání...</div>

  if (authorized === false) {
    return (
      <div style={{ padding: 24, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 10, color: 'var(--muted)' }}>
        <ShieldAlert size={32} />
        <div style={{ fontSize: 15 }}>Nemáš oprávnění pro tuto stránku.</div>
      </div>
    )
  }

  return (
    <div>
      {toast && <Toast message={toast.message} type={toast.type} onClose={hideToast} />}
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 6 }}>
        <LockKeyhole size={22} />
        <h1 style={{ fontSize: 26, fontWeight: 700, color: 'var(--text)', margin: 0 }}>Zamčené účty</h1>
      </div>
      <p style={{ fontSize: 13, color: 'var(--muted)', marginBottom: 20 }}>
        Účty dočasně zamčené po 5 neúspěšných přihlášeních (auto-odemknutí po 15 min). Odemkni ručně, když někdo nemůže čekat.
      </p>

      {locked.length === 0 ? (
        <div style={{ background: 'var(--card)', border: '1px solid var(--border)', borderRadius: 12, padding: 24, textAlign: 'center', color: 'var(--muted)', boxShadow: 'var(--shadow)' }}>
          Žádné zamčené účty. 🎉
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          {locked.map(acc => {
            const mins = Math.max(0, Math.ceil((new Date(acc.locked_until).getTime() - Date.now()) / 60000))
            return (
              <div key={acc.user_id} style={{ background: 'var(--card)', border: '1px solid var(--border)', borderRadius: 12, padding: '14px 16px', boxShadow: 'var(--shadow)', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap' }}>
                <div style={{ minWidth: 0 }}>
                  <div style={{ fontSize: 15, fontWeight: 600, color: 'var(--text)', wordBreak: 'break-word' }}>{acc.email}</div>
                  <div style={{ fontSize: 12, color: 'var(--muted)', marginTop: 2 }}>
                    {acc.failed_attempts} neúsp. pokusů · odemkne se za ~{mins} min
                  </div>
                </div>
                <button
                  onClick={() => unlock(acc)}
                  disabled={unlocking === acc.user_id}
                  style={{ minHeight: 44, display: 'flex', alignItems: 'center', gap: 6, background: '#e53e3e', color: 'white', border: 'none', borderRadius: 8, padding: '0 16px', fontSize: 14, fontWeight: 600, cursor: unlocking === acc.user_id ? 'default' : 'pointer', opacity: unlocking === acc.user_id ? 0.6 : 1, touchAction: 'manipulation' }}
                >
                  <Unlock size={15} /> {unlocking === acc.user_id ? 'Odemykám...' : 'Odemknout'}
                </button>
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}
