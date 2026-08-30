/*
 * Auth token storage — mirrors the legacy LEAP_AUTH_STORAGE so the token location is SHARED with the
 * other LEAP panels: Documents/LEAP Settings/LEAP_Auth/leap_auth_token.json (CEP). In browser dev there
 * is no filesystem, so a localStorage mock is used. This is the single place that persists the token.
 */
import { AUTH_TOKEN_LS_KEY, LeapAuth } from '../constants'
import { ensureDir, getDocumentsPath, isCEP, readTextFile, writeTextFile } from '@lib/helper'

export interface AuthToken {
	token: string
	username?: string
	company_id?: string
	company_name?: string
	timestamp?: string
}

/* Absolute path of the shared token file (CEP only). */
function tokenFilePath(): string | null {
	const docs = getDocumentsPath()
	if (!docs) return null
	return `${docs}/LEAP Settings/LEAP_Auth/${LeapAuth.TOKEN_FILE}`
}

export function loadToken(): AuthToken | null {
	try {
		if (isCEP()) {
			const path = tokenFilePath()
			const text = path ? readTextFile(path) : null
			return text ? (JSON.parse(text) as AuthToken) : null
		}
		const raw = window.localStorage.getItem(AUTH_TOKEN_LS_KEY)
		return raw ? (JSON.parse(raw) as AuthToken) : null
	} catch {
		return null
	}
}

export function saveToken(data: AuthToken & { company_id?: string; company_name?: string }): void {
	const payload: AuthToken = {
		token: data.token,
		username: data.username,
		company_id: data.company_id,
		company_name: data.company_name,
		timestamp: new Date().toISOString(),
	}
	try {
		if (isCEP()) {
			const path = tokenFilePath()
			if (!path) return
			ensureDir(path.replace(/\/[^/]*$/, ''))
			writeTextFile(path, JSON.stringify(payload, null, 2))
			return
		}
		window.localStorage.setItem(AUTH_TOKEN_LS_KEY, JSON.stringify(payload))
	} catch {
		/* best-effort */
	}
}

export function removeToken(): void {
	try {
		if (isCEP()) {
			const path = tokenFilePath()
			/* Overwrite with empty so the other panels see "logged out" on their next read. */
			if (path) writeTextFile(path, '')
			return
		}
		window.localStorage.removeItem(AUTH_TOKEN_LS_KEY)
	} catch {
		/* best-effort */
	}
}
