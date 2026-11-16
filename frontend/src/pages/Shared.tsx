import { useEffect, useState } from 'react'
import { Link, Route, Routes, useParams } from 'react-router-dom'
import { setShareToken } from '../api'
import Compare from './Compare'
import Results from './Results'
import RunDetails from './RunDetails'
import './shared.css'

/**
 * A benchmark someone shared with a link: /share/<token>, /share/<token>/runs/<id>, /share/<token>/compare.
 * No sign-in. Every read carries the token, the backend shows only that benchmark, and nothing can be changed.
 */
export default function Shared() {
  const { token = '' } = useParams()
  // Set before the first child fetches anything (a state initialiser runs during this render).
  useState(() => {
    setShareToken(token)
    return token
  })
  useEffect(() => {
    setShareToken(token)
    return () => setShareToken(null)
  }, [token])

  return (
    <div className="shared">
      <header className="shared-bar">
        <span className="shared-brand">Evalix</span>
        <span className="shared-note">A shared benchmark. Read-only.</span>
        <Link className="shared-try" to="/signin">
          Try Evalix
        </Link>
      </header>
      <main className="shared-main">
        <Routes>
          <Route index element={<Results />} />
          <Route path="runs/:id" element={<RunDetails />} />
          <Route path="compare" element={<Compare />} />
          <Route path="*" element={<p className="muted">A shared link only shows its benchmark.</p>} />
        </Routes>
      </main>
    </div>
  )
}
