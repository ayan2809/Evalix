import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import { api, FORBIDDEN_EVENT, type Health, type Settings } from '../api'

export type SettingsTab = 'models' | 'keys' | 'gateway' | 'search' | 'send'

interface ShellValue {
  /** null until loaded (or when the backend didn't answer) */
  health: Health | null
  settings: Settings | null
  setSettings: (s: Settings) => void
  /** Fetch health and settings again, for example after saving. */
  refresh: () => void
  settingsOpen: boolean
  settingsTab: SettingsTab
  openSettings: (tab?: SettingsTab) => void
  closeSettings: () => void
  /** A short message at the bottom of the screen for a few seconds. */
  toast: (text: string) => void
}

const Ctx = createContext<ShellValue | null>(null)

export function ShellProvider({ children }: { children: ReactNode }) {
  const [health, setHealth] = useState<Health | null>(null)
  const [settings, setSettings] = useState<Settings | null>(null)
  const [settingsOpen, setOpen] = useState(false)
  const [settingsTab, setTab] = useState<SettingsTab>('models')
  const [message, setMessage] = useState('')
  const timer = useRef<number | undefined>(undefined)

  const refresh = useCallback(() => {
    api.health().then(setHealth, () => undefined)
    api.settings.get().then(setSettings, () => undefined)
  }, [])
  useEffect(refresh, [refresh])

  const toast = useCallback((text: string) => {
    setMessage(text)
    window.clearTimeout(timer.current)
    timer.current = window.setTimeout(() => setMessage(''), 5000)
  }, [])

  // A 403 from anywhere in the app shows the backend's own sentence.
  useEffect(() => {
    const on = (e: Event) => toast(String((e as CustomEvent).detail ?? 'Not allowed.'))
    window.addEventListener(FORBIDDEN_EVENT, on)
    return () => window.removeEventListener(FORBIDDEN_EVENT, on)
  }, [toast])

  const value = useMemo<ShellValue>(
    () => ({
      health,
      settings,
      setSettings,
      refresh,
      settingsOpen,
      settingsTab,
      openSettings: (tab) => {
        setTab(tab ?? 'models')
        setOpen(true)
      },
      closeSettings: () => setOpen(false),
      toast,
    }),
    [health, settings, refresh, settingsOpen, settingsTab, toast],
  )
  return (
    <Ctx.Provider value={value}>
      {children}
      {message && (
        <div className="toast" role="status">
          {message}
        </div>
      )}
    </Ctx.Provider>
  )
}

/** Health, settings and the Settings popup. Use `openSettings('keys')` to send someone to the API keys tab. */
export function useShell(): ShellValue {
  const v = useContext(Ctx)
  if (!v) throw new Error('useShell needs <ShellProvider>')
  return v
}

/** "gemini-3.5-flash-lite" -> "Gemini 3.5 Flash Lite", unless Settings knows a nicer label. */
export function useModelLabel(): (id: string | undefined) => string {
  const { settings } = useShell()
  return (id) => {
    if (!id) return '–'
    const found = settings?.models.find((m) => m.id === id)
    if (found) return found.label
    return id
      .split('-')
      .map((w) => (w ? w[0].toUpperCase() + w.slice(1) : w))
      .join(' ')
  }
}
