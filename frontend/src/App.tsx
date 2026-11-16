import { Navigate, Route, Routes } from 'react-router-dom'
import { AuthProvider, useAuth } from './auth'
import Agents from './pages/Agents'
import Compare from './pages/Compare'
import Gateway from './pages/Gateway'
import Guide from './pages/Guide'
import Login from './pages/Login'
import Results from './pages/Results'
import Run from './pages/Run'
import Shared from './pages/Shared'
import RunDetails from './pages/RunDetails'
import Studio from './pages/Studio'
import Shell from './shell/Shell'
import { ShellProvider } from './shell/ShellContext'
import { ErrorState, Loading } from './ui'

export default function App() {
  return (
    <AuthProvider>
      <Gate />
    </AuthProvider>
  )
}

/** Asks who is here before showing anything. No session yet means the sign-in page. */
function Gate() {
  const { me, loading, error, reload } = useAuth()
  if (!me) {
    return (
      <div className="splash">
        {error ? <ErrorState error={error} onRetry={reload} /> : loading ? <Loading text="Starting Evalix…" /> : null}
      </div>
    )
  }
  return (
    <Routes>
      <Route path="/signin" element={<Login />} />
      {/* A shared benchmark needs no sign-in. */}
      <Route
        path="/share/:token/*"
        element={
          <ShellProvider>
            <Shared />
          </ShellProvider>
        }
      />
      <Route
        path="*"
        element={
          me.session === null ? (
            <Navigate to="/signin" replace />
          ) : (
            <ShellProvider>
              <Shell>
                <Pages />
              </Shell>
            </ShellProvider>
          )
        }
      />
    </Routes>
  )
}

function Pages() {
  return (
    <Routes>
      <Route path="/run" element={<Run />} />
      <Route path="/run/:benchmarkId" element={<Run />} />
      <Route path="/agents" element={<Agents />} />
      <Route path="/studio" element={<Studio />} />
      <Route path="/gateway" element={<Gateway />} />
      <Route path="/guide" element={<Guide />} />
      <Route path="/" element={<Results />} />
      <Route path="/runs/:id" element={<RunDetails />} />
      <Route path="/compare" element={<Compare />} />
      <Route path="*" element={<p className="muted">That page doesn't exist.</p>} />
    </Routes>
  )
}
