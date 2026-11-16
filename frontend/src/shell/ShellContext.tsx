import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import { api, FORBIDDEN_EVENT, type EngineStatus, type Health, type Settings } from '../api'

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
  /** Hosted only: the run engine is switched off, so agents and the gateway are asleep, not broken. */
  asleep: boolean
  /** Running in AWS (agents and the gateway live on the Evalix server, not on your computer). */
  hosted: boolean
}

const Ctx = createContext<ShellValue | null>(null)

export function ShellProvider({ children }: { children: ReactNode }) {
  const [health, setHealth] = useState<Health | null>(null)
  const [settings, setSettings] = useState<Settings | null>(null)
  const [settingsOpen, setOpen] = useState(false)
  const [settingsTab, setTab] = useState<SettingsTab>('models')
  const [message, setMessage] = useState('')
  const timer = useRef<number | undefined>(undefined)

  const [engine, setEngine] = useState<EngineStatus | null>(null)

  const refresh = useCallback(() => {
    api.health().then(setHealth, () => undefined)
    api.settings.get().then(setSettings, () => undefined)
  }, [])
  useEffect(refresh, [refresh])

  // Hosted Evalix switches its run engine off when idle. Ask now and then, so pages can say "asleep".
  const asleep = !!engine && engine.hosted && !engine.ready
  useEffect(() => {
    const ask = () => api.engine().then(setEngine, () => undefined)
    ask()
    const t = window.setInterval(ask, asleep ? 8000 : 30000)
    return () => window.clearInterval(t)
  }, [asleep])

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
      asleep,
      hosted: !!engine?.hosted,
    }),
    [health, settings, refresh, settingsOpen, settingsTab, toast, asleep, engine?.hosted],
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
