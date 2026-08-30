/*
 * BrandComply auth API — login + token validation. Same endpoints/headers as the legacy LEAP_AUTH_API,
 * so the issued token is valid across all LEAP panels.
 */
import { LeapAuth } from '../constants'

export interface LoginResponse {
	token: string
	username?: string
	company_id?: string
	company_name?: string
	servers?: unknown
	message?: string
}

/* Sign in with username/password. Rejects with a message on failure. */
export async function apiLogin(username: string, password: string): Promise<LoginResponse> {
	const res = await fetch(`${LeapAuth.BASE_URL}/leap/api/login`, {
		method: 'POST',
		headers: {
			'Content-Type': 'application/json',
			[LeapAuth.AUTH_HEADER]: LeapAuth.AUTH_TOKEN,
		},
		body: JSON.stringify({ username, password }),
	})
	const data = (await res.json().catch(() => ({}))) as LoginResponse
	if (!res.ok || !data.token) {
		throw new Error(data.message || 'Login failed. Check your username and password.')
	}
	return data
}

/* Validate an existing token. Resolves true when still valid; rejects otherwise. */
export async function apiCheckAuthentication(token: string): Promise<boolean> {
	const res = await fetch(`${LeapAuth.BASE_URL}/leap/api/check/authentication/`, {
		method: 'GET',
		headers: {
			[LeapAuth.AUTH_HEADER]: LeapAuth.AUTH_TOKEN,
			Authorization: `Bearer ${token}`,
			server_guid: LeapAuth.SERVER_GUID,
		},
	})
	if (!res.ok) throw new Error('Invalid token')
	return true
}
