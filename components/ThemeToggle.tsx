'use client'
import { Sun, Moon } from 'lucide-react'
import { useTheme } from './ThemeProvider'

export default function ThemeToggle() {
  const { theme, toggle } = useTheme()
  return (
    <button
      onClick={toggle}
      title={theme === 'dark' ? 'Přepnout na světlý režim' : 'Přepnout na tmavý režim'}
      style={{
        background: 'var(--card)',
        border: '1px solid var(--border)',
        borderRadius: 8,
        padding: '7px 10px',
        cursor: 'pointer',
        color: 'var(--muted)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        transition: 'background 0.15s, color 0.15s',
      }}
    >
      {theme === 'dark' ? <Sun size={16} /> : <Moon size={16} />}
    </button>
  )
}
