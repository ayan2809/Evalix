import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react'
import { api, asApiError, type ApiError, type Me } from './api'

export const GUEST_REASON = "Sign in to do this. You're looking around as a guest."
/** A Google account that isn't on the owner list (EVALIX_OWNER_EMAILS). */
export const VIEWER_REASON = 'Your Google account can look around here but not change things. Ask the owner to add you.'

interface AuthValue {
  /** null until the first answer from GET /api/auth/me */
  me: Me | null
  loading: boolean
  /** set when the backend can't be reached */
  error: ApiError | null
  reload: () => void
  signInGoogle: (credential: string) => Promise<Me>
  signInLocal: () => Promise<Me>
  signInGuest: () => Promise<Me>
  signOut: () => Promise<void>
}

const Ctx = createContext<AuthValue | null>(null)

export function AuthProvider({ children }: { children: ReactNode }) {
  const [me, setMe] = useState<Me | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<ApiError | null>(null)

  const load = useCallback(() => {
    setLoading(true)
    api
      .me()
      .then((m) => {
        setMe(m)
        setError(null)
      })
      .catch((e: unknown) => setError(asApiError(e)))
      .finally(() => setLoading(false))
  }, [])

  useEffect(load, [load])

  const value = useMemo<AuthValue>(
    () => ({
      me,
      loading,
      error,
      reload: load,
      signInGoogle: async (credential) => {
        const m = await api.signInGoogle(credential)
        setMe(m)
        return m
      },
      signInLocal: async () => {
        const m = await api.signInLocal()
        setMe(m)
        return m
      },
      signInGuest: async () => {
        const m = await api.signInGuest()
        setMe(m)
        return m
      },
      signOut: async () => {
        await api.signOut()
        // The cookie is gone, so ask again: this gives session = null.
        setMe(await api.me())
      },
    }),
    [me, loading, error, load],
  )
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>
}

export function useAuth(): AuthValue {
  const v = useContext(Ctx)
  if (!v) throw new Error('useAuth needs <AuthProvider>')
  return v
}

/**
 * Whether the person may change things (start runs, save settings). Guests may only look.
 * `reason` is the sentence to show as a tooltip on a disabled button; undefined when allowed.
 *   const { canEdit, reason } = useCanEdit()
 *   <Button ownerOnly>...</Button>  // does the same for you
 */
export function useCanEdit(): { canEdit: boolean; reason: string | undefined } {
  const v = useContext(Ctx)
  const canEdit = !v || !v.me || v.me.role === 'owner'
  if (canEdit) return { canEdit, reason: undefined }
  return { canEdit, reason: v?.me?.session === 'google' ? VIEWER_REASON : GUEST_REASON }
}

/** "Guest", "This computer" or the Google name. */
export function accountName(me: Me | null): string {
  if (!me || !me.session) return ''
  if (me.session === 'guest') return 'Guest'
  if (me.session === 'local') return 'This computer'
  return me.user?.name || me.user?.email || 'Signed in'
}
