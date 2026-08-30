/*
 * AuthContext — shared LEAP login state for the panel. Ports the legacy leapAuthService:
 *   - checkAuth(): validate the stored token (guest when REQUIRE_LOGIN is off),
 *   - login()/logout(): authenticate and persist the shared token,
 *   - cross-panel sync: on login/logout we BROADCAST a CEP event (no polling) so the other LEAP panels
 *     update instantly; we also LISTEN for those events so a login in another panel logs us in too.
 *
 * The token file is shared (Documents/LEAP Settings/LEAP_Auth), so syncing just re-reads it.
 */
import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import { LeapAuth, REQUIRE_LOGIN } from '../constants'
import { apiCheckAuthentication, apiLogin } from '../auth/api'
import { loadToken, removeToken, saveToken } from '../auth/storage'
import { addCSEventListener, dispatchCSEvent, isCEP } from '@lib/helper'
import { logger } from '@lib/logger'

export interface AuthUser {
	username: string
	company: string
	token: string | null
}

interface AuthContextValue {
	user: AuthUser | null
	loading: boolean
	error: string | null
	authenticated: boolean
	/* Whether the panel is gated behind login (REQUIRE_LOGIN). When false the panel is always usable. */
	requireLogin: boolean
	login: (username: string, password: string) => Promise<boolean>
	logout: () => void
	clearError: () => void
}

const AuthContext = createContext<AuthContextValue | null>(null)

const GUEST: AuthUser = { username: 'Guest', company: 'LEAP', token: null }

export function AuthProvider({ children }: { children: ReactNode }) {
	const [user, setUser] = useState<AuthUser | null>(null)
	const [loading, setLoading] = useState<boolean>(REQUIRE_LOGIN)
	const [error, setError] = useState<string | null>(null)
	/* Avoid feedback loops: ignore the auth event we ourselves just dispatched. */
	const selfDispatch = useRef(false)

	/* Validate the stored token (or activate guest when login isn't required). */
	const checkAuth = useCallback(async (): Promise<boolean> => {
		if (!REQUIRE_LOGIN) {
			setUser(GUEST)
			setLoading(false)
			return true
		}
		setLoading(true)
		const stored = loadToken()
		if (!stored?.token) {
			setUser(null)
			setLoading(false)
			return false
		}
		try {
			await apiCheckAuthentication(stored.token)
			setUser({ username: stored.username || 'User', company: stored.company_name || 'LEAP', token: stored.token })
			return true
		} catch {
			removeToken()
			setUser(null)
			return false
		} finally {
			setLoading(false)
		}
	}, [])

	const login = useCallback(async (username: string, password: string): Promise<boolean> => {
		setLoading(true)
		setError(null)
		try {
			const data = await apiLogin(username, password)
			saveToken(data)
			const u: AuthUser = { username: data.username || username, company: data.company_name || 'LEAP', token: data.token }
			setUser(u)
			/* Notify the other panels (event-based, no polling). */
			selfDispatch.current = true
			dispatchCSEvent(LeapAuth.EVENT_AUTHENTICATED, { token: data.token })
			dispatchCSEvent(LeapAuth.EVENT_AUTH_STATUS_CHANGED, { authenticated: true, user: u })
			return true
		} catch (e) {
			setError(e instanceof Error ? e.message : 'Login failed')
			return false
		} finally {
			setLoading(false)
		}
	}, [])

	const logout = useCallback(() => {
		removeToken()
		setUser(null)
		setError(null)
		selfDispatch.current = true
		dispatchCSEvent(LeapAuth.EVENT_AUTHENTICATED, { token: '' })
		dispatchCSEvent(LeapAuth.EVENT_AUTH_STATUS_CHANGED, { authenticated: false, user: null })
	}, [])

	const clearError = useCallback(() => setError(null), [])

	/* Initial auth check on mount. */
	useEffect(() => {
		void checkAuth()
	}, [checkAuth])

	/* Listen for auth changes broadcast by the other LEAP panels and re-sync from the shared token. */
	useEffect(() => {
		if (!isCEP() || !REQUIRE_LOGIN) return
		const resync = () => {
			if (selfDispatch.current) {
				selfDispatch.current = false
				return
			}
			logger.info('Auth', 'Auth event from another panel — re-syncing')
			void checkAuth()
		}
		const off1 = addCSEventListener(LeapAuth.EVENT_AUTHENTICATED, resync)
		const off2 = addCSEventListener(LeapAuth.EVENT_AUTH_STATUS_CHANGED, resync)
		return () => {
			off1()
			off2()
		}
	}, [checkAuth])

	const value = useMemo<AuthContextValue>(
		() => ({
			user,
			loading,
			error,
			authenticated: !REQUIRE_LOGIN || !!user,
			requireLogin: REQUIRE_LOGIN,
			login,
			logout,
			clearError,
		}),
		[user, loading, error, login, logout, clearError],
	)

	return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}

export function useAuth(): AuthContextValue {
	const ctx = useContext(AuthContext)
	if (!ctx) throw new Error('useAuth must be used within an AuthProvider')
	return ctx
}
