import { NavLink, Navigate, Route, Routes } from 'react-router-dom'
import { api } from './api'
import { useAsync } from './hooks'
import Agents from './pages/Agents'
import Compare from './pages/Compare'
import Gateway from './pages/Gateway'
import Run from './pages/Run'
import RunDetails from './pages/RunDetails'
import Scoreboard from './pages/Scoreboard'
import Studio from './pages/Studio'

export default function App() {
  const health = useAsync(() => api.health(), [])
  return (
    <div className="app">
      <header className="topbar">
        <span className="brand">Evalix</span>
        <nav>
          <NavLink to="/run">Run</NavLink>
          <NavLink to="/scoreboard">Scoreboard</NavLink>
          <NavLink to="/compare">Compare</NavLink>
          <NavLink to="/agents">Agents</NavLink>
          <NavLink to="/studio">Studio</NavLink>
          <NavLink to="/gateway">Gateway</NavLink>
        </nav>
        {health.data?.mock && (
          <span className="demo-pill" title="Agents are answered by a built-in mock model, no real model is called.">
            Demo mode
          </span>
        )}
      </header>
      <main>
        <Routes>
          <Route path="/" element={<Navigate to="/run" replace />} />
          <Route path="/run" element={<Run />} />
          <Route path="/run/:benchmarkId" element={<Run />} />
          <Route path="/scoreboard" element={<Scoreboard />} />
          <Route path="/runs/:id" element={<RunDetails />} />
          <Route path="/compare" element={<Compare />} />
          <Route path="/agents" element={<Agents />} />
          <Route path="/studio" element={<Studio />} />
          <Route path="/gateway" element={<Gateway />} />
          <Route path="*" element={<p className="muted">Page not found.</p>} />
        </Routes>
      </main>
    </div>
  )
}
