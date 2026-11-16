import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react'
import { api, asApiError, currentShareToken, type ApiError, type Me } from './api'

export const GUEST_REASON = "Sign in to do this. You're looking around as a guest."
/** A member (any Google account not on EVALIX_OWNER_EMAILS) trying to change Settings, keys or Maxim. */
export const MEMBER_REASON = 'Only the owner of this Evalix can change this.'

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
 * Whether the person may change things in their own workspace (agents, runs, Agent Studio, gateway tests).
 * Owners and members may; guests may only look. `reason` is the tooltip for a disabled button.
 *   <Button needsSignIn>...</Button>  // does the same for you
 */
export function useCanEdit(): { canEdit: boolean; reason: string | undefined } {
  const v = useContext(Ctx)
  // A shared link is always read-only, whoever opens it.
  const canEdit = !currentShareToken() && (!v || !v.me || v.me.role !== 'guest')
  return { canEdit, reason: canEdit ? undefined : GUEST_REASON }
}

/** Whether the person may change Settings, keys and Maxim: the owner only.
 *   <Button ownerOnly>...</Button>  // does the same for you
 */
export function useIsOwner(): { isOwner: boolean; reason: string | undefined } {
  const v = useContext(Ctx)
  const isOwner = !v || !v.me || v.me.role === 'owner'
  if (isOwner) return { isOwner, reason: undefined }
  return { isOwner, reason: v?.me?.role === 'member' ? MEMBER_REASON : GUEST_REASON }
}

/** "Guest", "This computer" or the Google name. */
export function accountName(me: Me | null): string {
  if (!me || !me.session) return ''
  if (me.session === 'guest') return 'Guest'
  if (me.session === 'local') return 'This computer'
  return me.user?.name || me.user?.email || 'Signed in'
}
