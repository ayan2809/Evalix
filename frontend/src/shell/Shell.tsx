import { useEffect, useState, type ReactNode } from 'react'
import { Link, useLocation } from 'react-router-dom'
import { accountName, useAuth } from '../auth'
import { money } from '../format'
import { Button, Icon, Logo, type IconName } from '../ui'
import { useModelLabel, useShell } from './ShellContext'
import SettingsDialog from './SettingsDialog'
import { Tour, useTour, TOUR } from './Tour'
import './shell.css'

const NAV: { to: string; label: string; icon: IconName; on: (path: string) => boolean }[] = [
  { to: '/', label: 'Results', icon: 'results', on: (p) => p === '/' || p.startsWith('/runs/') },
  { to: '/run', label: 'Start a run', icon: 'play', on: (p) => p === '/run' || p.startsWith('/run/') },
  { to: '/compare', label: 'Compare', icon: 'compare', on: (p) => p.startsWith('/compare') },
  { to: '/agents', label: 'Agents', icon: 'agent', on: (p) => p.startsWith('/agents') },
  { to: '/studio', label: 'Agent Studio', icon: 'plus', on: (p) => p.startsWith('/studio') },
  { to: '/gateway', label: 'Gateway', icon: 'pulse', on: (p) => p.startsWith('/gateway') },
  { to: '/guide', label: 'How it works', icon: 'guide', on: (p) => p.startsWith('/guide') },
]

const RAIL_KEY = 'evalix.rail'

/** The rail can fold down to icons on wide screens. The choice is remembered in this browser only. */
function useRailCollapsed(): [boolean, (v: boolean) => void] {
  const [collapsed, setCollapsed] = useState(() => {
    try {
      return localStorage.getItem(RAIL_KEY) === 'collapsed'
    } catch {
      return false
    }
  })
  useEffect(() => {
    try {
      localStorage.setItem(RAIL_KEY, collapsed ? 'collapsed' : 'open')
    } catch {
      /* storage blocked: the rail still works, it just won't be remembered */
    }
  }, [collapsed])
  return [collapsed, setCollapsed]
}

export default function Shell({ children }: { children: ReactNode }) {
  const { pathname } = useLocation()
  const { me, signOut, reload } = useAuth()
  const { health, openSettings } = useShell()
  const modelLabel = useModelLabel()
  const [leaving, setLeaving] = useState(false)
  const [collapsed, setCollapsed] = useRailCollapsed()
  const guest = me?.role === 'guest'
  const name = accountName(me)
  const { step, setStep } = useTour()
  const tourNav = step === null ? undefined : TOUR[step].nav
  const allowance = me?.role === 'member' ? me.allowance : null

  // A member's allowance changes as runs finish, so ask again on each page change.
  useEffect(() => {
    if (me?.role === 'member') reload()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pathname])

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
    <div className={collapsed ? 'shell collapsed' : 'shell'}>
      <aside className="side">
        <div className="brandrow">
          <Link to="/" className="brand" aria-label="Evalix, go to results">
            <Logo size={22} />
            <span className="rail-text">Evalix</span>
          </Link>
          <button
            type="button"
            className="rail-toggle"
            aria-expanded={!collapsed}
            aria-label={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}
            title={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}
            onClick={() => setCollapsed(!collapsed)}
          >
            <Icon name="chevron" size={16} />
          </button>
        </div>

        <nav className="nav" aria-label="Main">
          {NAV.map((n) => (
            <Link
              key={n.to}
              to={n.to}
              className={[n.on(pathname) ? 'on' : '', tourNav === n.to ? 'tour-on' : ''].join(' ').trim()}
              aria-current={n.on(pathname) ? 'page' : undefined}
              title={collapsed ? n.label : undefined}
            >
              <Icon name={n.icon} size={18} />
              <span className="rail-text">{n.label}</span>
            </Link>
          ))}
        </nav>

        <button
          type="button"
          className="rail-gear"
          aria-label="Running on. Open settings"
          title="Settings"
          onClick={() => openSettings()}
        >
          <Icon name="gear" size={18} />
        </button>

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
          {allowance && allowance.daily_usd !== null && (
            <span className="envrow">
              <span>Today</span>
              <b>
                {money(allowance.spent_today_usd)} of ${allowance.daily_usd.toFixed(2)}
              </b>
            </span>
          )}
        </button>

        <div className="account">
          <span className="avatar" aria-hidden="true">
            {me?.user?.picture ? <img src={me.user.picture} alt="" referrerPolicy="no-referrer" /> : (name[0] ?? '?').toUpperCase()}
          </span>
          <span className="who" title={me?.user?.email}>
            {name}
          </span>
          <button type="button" className="signout" onClick={leave} disabled={leaving} title={collapsed ? 'Sign out' : undefined}>
            <Icon name="sign-out" size={16} />
            <span className="rail-text">Sign out</span>
          </button>
        </div>

        <Button className="side-gear" small aria-label="Open settings" title="Settings" onClick={() => openSettings()}>
          <Icon name="gear" size={16} />
        </Button>
      </aside>

      <main className="main">
        {guest && (
          <div className="guest-note" role="note">
            <span>You're looking at an example workspace. Sign in to get your own and test your agents.</span>
            <Link to="/signin">Sign in</Link>
          </div>
        )}
        {children}
      </main>
      <SettingsDialog />
      {step !== null && <Tour step={step} setStep={setStep} />}
    </div>
  )
}
