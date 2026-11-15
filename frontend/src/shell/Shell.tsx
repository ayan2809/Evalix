import { useState, type ReactNode } from 'react'
import { Link, useLocation } from 'react-router-dom'
import { accountName, useAuth } from '../auth'
import { Button, Icon, Logo } from '../ui'
import { useModelLabel, useShell } from './ShellContext'
import SettingsDialog from './SettingsDialog'
import './shell.css'

const NAV: { to: string; label: string; on: (path: string) => boolean }[] = [
  { to: '/', label: 'Results', on: (p) => p === '/' || p.startsWith('/runs/') },
  { to: '/run', label: 'Start a run', on: (p) => p === '/run' || p.startsWith('/run/') },
  { to: '/compare', label: 'Compare', on: (p) => p.startsWith('/compare') },
  { to: '/agents', label: 'Agents', on: (p) => p.startsWith('/agents') },
  { to: '/studio', label: 'Make an agent', on: (p) => p.startsWith('/studio') },
  { to: '/gateway', label: 'Gateway test', on: (p) => p.startsWith('/gateway') },
]

export default function Shell({ children }: { children: ReactNode }) {
  const { pathname } = useLocation()
  const { me, signOut } = useAuth()
  const { health, openSettings } = useShell()
  const modelLabel = useModelLabel()
  const [leaving, setLeaving] = useState(false)
  const guest = me?.role === 'guest'
  const name = accountName(me)

  async function leave() {
    setLeaving(true)
    try {
      await signOut()
    } finally {
      setLeaving(false)
    }
  }

  const bifrostDown = health?.bifrost_up === false
  return (
    <div className="shell">
      <aside className="side">
        <Link to="/" className="brand">
          <Logo size={22} />
          <span>Evalix</span>
        </Link>

        <nav className="nav" aria-label="Main">
          {NAV.map((n) => (
            <Link key={n.to} to={n.to} className={n.on(pathname) ? 'on' : ''} aria-current={n.on(pathname) ? 'page' : undefined}>
              {n.label}
            </Link>
          ))}
        </nav>

        <button type="button" className="envcard" aria-label="Running on. Open settings" onClick={() => openSettings()}>
          <span className="envhead">
            Running on <Icon name="gear" size={16} />
          </span>
          <span className="envrow">
            <span>Model</span>
            <b>{health ? (health.mock ? 'Test model' : modelLabel(health.agent_model)) : '…'}</b>
          </span>
          <span className="envrow">
            <span>Through</span>
            <b title={bifrostDown ? "Bifrost isn't answering" : undefined}>
              {health?.mock ? 'Test mode' : bifrostDown ? 'Bifrost (down)' : 'Bifrost'}
            </b>
          </span>
          <span className="envrow">
            <span>Search</span>
            <b>{health ? (health.search_mode === 'live' ? 'Live web' : 'Saved results') : '…'}</b>
          </span>
        </button>

        <div className="account">
          <span className="avatar" aria-hidden="true">
            {me?.user?.picture ? <img src={me.user.picture} alt="" referrerPolicy="no-referrer" /> : (name[0] ?? '?').toUpperCase()}
          </span>
          <span className="who" title={me?.user?.email}>
            {name}
          </span>
          <button type="button" className="signout" onClick={leave} disabled={leaving}>
            Sign out
          </button>
        </div>

        <Button className="side-gear" small aria-label="Open settings" title="Settings" onClick={() => openSettings()}>
          <Icon name="gear" size={16} />
        </Button>
      </aside>

      <main className="main">
        {guest && (
          <div className="guest-note" role="note">
            <span>You're looking around. Sign in to start runs or change settings.</span>
            <Link to="/signin">Sign in</Link>
          </div>
        )}
        {children}
      </main>
      <SettingsDialog />
    </div>
  )
}
