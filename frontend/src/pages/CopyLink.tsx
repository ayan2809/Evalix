import { useState } from 'react'
import { useLocation } from 'react-router-dom'
import { api, asApiError, currentShareToken, shareUrl } from '../api'
import { useCanEdit } from '../auth'
import { useShell } from '../shell/ShellContext'
import { Button } from '../ui'

/**
 * Copies a link to this page that someone else can open. Inside a shared view it keeps the share link.
 * Otherwise it uses the benchmark's share link, making one first if you may (it says so), so the link
 * works for people who are not signed in to your workspace.
 */
export function CopyLink({ benchmarkId }: { benchmarkId: number }) {
  const { toast } = useShell()
  const { canEdit } = useCanEdit()
  const { pathname, search } = useLocation()
  const [busy, setBusy] = useState(false)
  const shared = currentShareToken()
  // Inside a shared view the path already starts with /share/<token>; keep only the page part.
  const page = shared ? pathname.replace(/^\/share\/[^/]+/, '') + search : pathname + search

  async function copy() {
    setBusy(true)
    try {
      let token = shared
      let made = false
      if (!token) {
        const found = (await api.listBenchmarks(true)).find((b) => b.id === benchmarkId)
        token = found?.share_token ?? null
        if (!token && canEdit) {
          token = (await api.shareBenchmark(benchmarkId, true)).share_token
          made = true
        }
      }
      await navigator.clipboard.writeText(shareUrl(token, page || '/'))
      toast(
        token
          ? made
            ? 'Link copied. Benchmark #' + benchmarkId + ' is now shared read-only with anyone who has the link.'
            : 'Link copied. It opens read-only, no sign-in needed.'
          : 'Link copied.',
      )
    } catch (e) {
      toast(asApiError(e).message)
    } finally {
      setBusy(false)
    }
  }

  return (
    <Button small variant="quiet" disabled={busy} onClick={copy}>
      {busy ? 'Copying…' : 'Copy link'}
    </Button>
  )
}
