'use client'
import { useRef, useState } from 'react'
import Modal from '@/components/Modal'
import { FileUp, Upload, AlertTriangle, CircleCheck, CircleX, PhoneOff, MailX } from 'lucide-react'
import { nactiSoubor, pripravNahled, kImportu, type Nahled, type NahledRadek } from '@/lib/coldCallsImport'

const STAV: Record<NahledRadek['stav'], { label: string; barva: string; Icon: typeof CircleCheck }> = {
  'ok':           { label: 'Naimportuje se', barva: 'var(--cc-sch-text)',  Icon: CircleCheck },
  'bez-telefonu': { label: 'Bez telefonu',   barva: 'var(--cc-zaj-text)',  Icon: PhoneOff },
  'duplicita':    { label: 'Duplicita',      barva: 'var(--cc-ned-text)',  Icon: CircleX },
  'chybna-firma': { label: 'Chybná firma',   barva: 'var(--cc-odm-text)',  Icon: AlertTriangle },
  'chybne-cislo': { label: 'Chybný telefon', barva: 'var(--cc-odm-text)',  Icon: AlertTriangle },
}

/** Řádky, které se do databáze nedostanou — vypsat proč, ne jen že. */
const PRESKOCENO: NahledRadek['stav'][] = ['duplicita', 'chybna-firma', 'chybne-cislo']

/** Řádek se uloží, jen bez adresy — varování, ne chyba. */
const BEZ_EMAILU = { label: 'Bez e-mailu', barva: 'var(--cc-zaj-text)', Icon: MailX }

/**
 * Import leadů: vyber soubor → NÁHLED → teprve pak uložení.
 *
 * Náhled je povinný krok schválně. Hlavičky se v exportech liší a rozpoznání
 * sloupců je odhad — uživatel musí vidět, co se do databáze doopravdy dostane,
 * dřív než tam přistane dvě stě řádků.
 */
export default function ImportModal({ isOpen, onClose, existujiciTelefony, onImport }: {
  isOpen: boolean
  onClose: () => void
  /** telefony už uložených záznamů — proti nim se hledají duplicity */
  existujiciTelefony: string[]
  onImport: (radky: {
    firma: string; kontakt_jmeno: string | null; telefon: string | null
    email: string | null; info: string | null
  }[]) => Promise<void>
}) {
  const [nahled, setNahled] = useState<Nahled | null>(null)
  const [jmeno, setJmeno] = useState('')
  const [chyba, setChyba] = useState<string | null>(null)
  const [ukladam, setUkladam] = useState(false)
  const vstup = useRef<HTMLInputElement>(null)

  function zavri() {
    setNahled(null); setJmeno(''); setChyba(null); setUkladam(false)
    onClose()
  }

  async function vyber(file: File | undefined) {
    if (!file) return
    setChyba(null)
    try {
      const mrizka = await nactiSoubor(file)
      if (!mrizka.length) { setChyba('Soubor je prázdný nebo se nepodařilo přečíst žádný řádek.'); return }
      setJmeno(file.name)
      setNahled(pripravNahled(mrizka, existujiciTelefony))
    } catch (e) {
      setChyba(`Soubor se nepodařilo přečíst: ${e instanceof Error ? e.message : String(e)}`)
    }
  }

  const label: React.CSSProperties = { fontSize: 13, fontWeight: 600, color: 'var(--muted)', marginBottom: 8 }

  return (
    <Modal isOpen={isOpen} onClose={zavri} title="Nahrát leady">
      {!nahled ? (
        <div>
          <div style={{ fontSize: 13.5, color: 'var(--muted)', lineHeight: 1.55, marginBottom: 16 }}>
            CSV nebo Excel se sloupci firma, kontakt, telefon a e-mail. Na názvech ani pořadí sloupců
            nezáleží — poznají se samy. Před uložením uvidíš náhled: řádek s příliš krátkým
            názvem firmy nebo s nesmyslným telefonem se označí a nenaimportuje.
          </div>
          <input
            ref={vstup} type="file" accept=".csv,.txt,.xlsx,.xlsm,.xlsb,.xls"
            onChange={e => vyber(e.target.files?.[0])}
            style={{ display: 'none' }}
          />
          <button
            onClick={() => vstup.current?.click()}
            style={{
              width: '100%', minHeight: 96, borderRadius: 12, cursor: 'pointer',
              border: '1px dashed var(--border)', background: 'var(--input-bg)', color: 'var(--text)',
              display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 8,
              fontSize: 14.5, fontWeight: 600, touchAction: 'manipulation',
            }}>
            <FileUp size={22} style={{ color: 'var(--muted)' }} />
            Vybrat soubor
          </button>
          {chyba && (
            <div style={{ marginTop: 14, fontSize: 13, color: 'var(--cc-odm-text)' }}>{chyba}</div>
          )}
        </div>
      ) : (
        <div>
          <div style={{ fontSize: 13, color: 'var(--muted)', marginBottom: 14 }}>
            {jmeno} · {nahled.hlavicka
              ? `sloupce podle hlavičky: ${[
                nahled.hlavicka[nahled.sloupce.firma], nahled.hlavicka[nahled.sloupce.kontakt],
                nahled.hlavicka[nahled.sloupce.telefon], nahled.hlavicka[nahled.sloupce.email],
                nahled.hlavicka[nahled.sloupce.info]]
                .filter(Boolean).join(', ')}`
              : 'soubor nemá hlavičku — sloupce jsou odhadnuté z obsahu'}
          </div>

          {/* Souhrn: kolik se naimportuje a co se přeskočí. */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, minmax(0,1fr))', gap: 8, marginBottom: 16 }}>
            {[
              { l: 'Řádků v souboru', v: nahled.pocty.celkem, c: 'var(--text)' },
              { l: 'Naimportuje se', v: nahled.pocty.kImportu, c: 'var(--cc-sch-text)' },
              { l: 'Duplicit (přeskočí se)', v: nahled.pocty.duplicit, c: 'var(--muted)' },
              { l: 'Chybných (přeskočí se)', v: nahled.pocty.chybnych, c: nahled.pocty.chybnych ? 'var(--cc-odm-text)' : 'var(--muted)' },
            ].map(x => (
              <div key={x.l} style={{
                background: 'var(--input-bg)', border: '1px solid var(--border)', borderRadius: 12,
                padding: '10px 14px',
              }}>
                <div style={{ fontSize: 12, color: 'var(--muted)' }}>{x.l}</div>
                <div style={{ fontSize: 21, fontWeight: 700, color: x.c, fontVariantNumeric: 'tabular-nums' }}>{x.v}</div>
              </div>
            ))}
          </div>
          {nahled.pocty.chybnych > 0 && (
            <div style={{ fontSize: 13, color: 'var(--cc-odm-text)', marginBottom: 12, display: 'flex', gap: 7, alignItems: 'flex-start' }}>
              <AlertTriangle size={14} style={{ flexShrink: 0, marginTop: 2 }} />
              <span>
                {[
                  nahled.pocty.chybnaFirma && `${nahled.pocty.chybnaFirma}× firma kratší než 3 znaky`,
                  nahled.pocty.chybneCislo && `${nahled.pocty.chybneCislo}× telefon bez 9 číslic nebo s písmeny`,
                ].filter(Boolean).join(' · ')} — tyhle řádky se nenaimportují.
              </span>
            </div>
          )}
          {nahled.pocty.emailVynechan > 0 && (
            <div style={{ fontSize: 13, color: 'var(--cc-zaj-text)', marginBottom: 12, display: 'flex', gap: 7, alignItems: 'flex-start' }}>
              <MailX size={14} style={{ flexShrink: 0, marginTop: 2 }} />
              <span>
                {nahled.pocty.emailVynechan}× e-mail bez zavináče nebo tečky — {nahled.pocty.emailVynechan === 1 ? 'ten lead se naimportuje' : 'ty leady se naimportují'} bez adresy.
              </span>
            </div>
          )}
          {nahled.pocty.bezTelefonu > 0 && (
            <div style={{ fontSize: 13, color: 'var(--cc-zaj-text)', marginBottom: 12, display: 'flex', gap: 7, alignItems: 'center' }}>
              <PhoneOff size={14} /> {nahled.pocty.bezTelefonu} {nahled.pocty.bezTelefonu === 1 ? 'lead nemá' : 'leadů nemá'} telefon — naimportují se, číslo doplníš později.
            </div>
          )}

          <div style={label}>NÁHLED</div>
          <div className="hide-scrollbar" style={{
            maxHeight: 260, overflowY: 'auto', overflowX: 'hidden',
            border: '1px solid var(--border)', borderRadius: 12, marginBottom: 18,
          }}>
            {nahled.radky.map(r => {
              // U řádku, který projde, přebije zprávu o e-mailu jen chybějící
              // telefon — to je závažnější než adresa, kterou stejně zahazujeme.
              const s = r.emailVynechan && r.stav === 'ok' ? BEZ_EMAILU : STAV[r.stav]
              const preskoceno = PRESKOCENO.includes(r.stav)
              return (
                <div key={r.cislo} style={{
                  display: 'flex', alignItems: 'center', gap: 12, minHeight: 44, padding: '6px 12px',
                  borderBottom: '1px solid var(--border)', opacity: preskoceno ? 0.55 : 1,
                }}>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{
                      fontSize: 13.5, fontWeight: 600, color: 'var(--text)',
                      overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                      textDecoration: preskoceno ? 'line-through' : undefined,
                    }}>{r.firma || '—'}</div>
                    <div style={{
                      fontSize: 12, color: 'var(--muted)', marginTop: 1,
                      overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                    }}>
                      {/* U chybného řádku je důležitější důvod než kontakt —
                          u telefonu se ukáže i to, co v souboru doopravdy je. */}
                      {r.duvod
                        ? (r.stav === 'chybne-cislo' ? `${r.duvod} — „${r.telefon}"` : r.duvod)
                        : [
                          [r.kontakt, r.telefon, r.emailVynechan ? null : r.email, r.info].filter(Boolean).join(' · ') || 'bez kontaktu',
                          r.emailVynechan ? `vadný e-mail „${r.email}" se vynechá` : null,
                        ].filter(Boolean).join(' · ')}
                    </div>
                  </div>
                  <span style={{ display: 'flex', alignItems: 'center', gap: 5, fontSize: 12, color: s.barva, flexShrink: 0 }}>
                    <s.Icon size={13} /> {s.label}
                  </span>
                </div>
              )
            })}
          </div>

          <div style={{ display: 'flex', gap: 10 }}>
            <button
              onClick={async () => {
                setUkladam(true)
                await onImport(kImportu(nahled))
                setUkladam(false)
                zavri()
              }}
              disabled={ukladam || nahled.pocty.kImportu === 0}
              style={{
                flex: 1, minHeight: 44, borderRadius: 11, border: 'none', background: 'var(--accent)',
                color: '#fff', fontSize: 14.5, fontWeight: 600, cursor: nahled.pocty.kImportu ? 'pointer' : 'default',
                opacity: nahled.pocty.kImportu ? 1 : 0.5, display: 'flex', alignItems: 'center',
                justifyContent: 'center', gap: 8, touchAction: 'manipulation',
              }}>
              <Upload size={16} /> {ukladam ? 'Ukládám…' : `Naimportovat ${nahled.pocty.kImportu}`}
            </button>
            <button
              onClick={() => { setNahled(null); setJmeno('') }}
              style={{
                minHeight: 44, padding: '0 18px', borderRadius: 11, background: 'transparent',
                border: '1px solid var(--border)', color: 'var(--text)', fontSize: 14.5, fontWeight: 600,
                cursor: 'pointer', touchAction: 'manipulation',
              }}>Jiný soubor</button>
          </div>
        </div>
      )}
    </Modal>
  )
}
