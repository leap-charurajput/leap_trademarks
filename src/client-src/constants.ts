/*
 * App-wide constants. No magic strings scattered through the code (AGENTS.md §6).
 */
import { Theme } from './enums'
import { PANEL } from '@lib/telemetry'
import type { TranslationKey } from './i18n'
import originConfig from '../../plugin-origin.config.json'

export const APP_NAME = 'LEAP Trademarks'

/* Panel build version, shown in the footer. Single source: telemetry identity. */
export const APP_VERSION = PANEL.version

/* Persisted-settings keys (local storage). */
export const StorageKey = {
	Theme: 'leap.trademarks.theme',
	Locale: 'leap-trademarks:locale',
} as const

export const DEFAULT_THEME = Theme.Dark

/* CEP / Illustrator event names used by the panel. */
export const CepEvent = {
	DocumentAfterActivate: 'documentAfterActivate',
	ArtSelectionChanged: 'AI Art Selection Changed Notifier',
	/* Adobe host UI brightness / theme (legacy CSInterface.THEME_COLOR_CHANGED_EVENT). */
	ThemeColorChanged: 'com.adobe.csxs.events.ThemeColorChanged',
} as const

/* CEF remote-debugging URL for this CEP panel (open in Chrome). Port matches zxp/plugin/.debug. */
export const DEBUG_CONSOLE_URL = 'http://localhost:9002'

/*
 * Release channels (web-app deployment model, one git branch → one hosted deployment each). The
 * channel URLS have a single source of truth — plugin-origin.config.json — imported here AND
 * published into the hosted app-config.json by build-scripts/inject-plugin-origin.js, so the panel
 * UI and the ZXP shell's registry can never disagree.
 *
 * Switching channels: LEAP Data Settings writes { Environment, Origin } to
 * Documents/<TrademarksConfig.DIR>/<TrademarksConfig.FILE>; the shell (redirect.html) re-resolves
 * the Environment id against the hosted registry on every panel start. It takes effect after an
 * Illustrator restart (the shell only redirects once, at panel load). The footer shows which
 * channel is actually running (matched against window.location.origin).
 */
export const TrademarksConfig = {
	DIR: 'LEAP Settings/LEAP_Trademarks',
	FILE: 'Trademarks_Config.json',
} as const

export type AppEnvironmentId = 'production' | 'development' | 'beta' | 'localhost'

export interface AppEnvironment {
	id: AppEnvironmentId
	labelKey: TranslationKey
	origin: string
}

export const APP_ENVIRONMENTS: readonly AppEnvironment[] = [
	{ id: 'production', labelKey: 'env.production', origin: originConfig.environments.production },
	{ id: 'development', labelKey: 'env.development', origin: originConfig.environments.development },
	{ id: 'beta', labelKey: 'env.beta', origin: originConfig.environments.beta },
	{ id: 'localhost', labelKey: 'env.localhost', origin: originConfig.environments.localhost },
] as const

/* Match an origin URL to a known environment; null for unknown / missing origins. */
export function environmentForOrigin(origin: string | null | undefined): AppEnvironment | null {
	if (!origin) return null
	const normalized = origin.replace(/\/+$/, '').toLowerCase()
	return APP_ENVIRONMENTS.find((env) => env.origin.toLowerCase() === normalized) ?? null
}

/* The environment this panel is currently served from, if it is a known one. Channel urls carry a
   path (…/panels/trademarks), so match origin+pathname by whole-segment prefix — plain
   window.location.origin would drop the path and never match a hosted channel. */
export function detectRunningEnvironment(): AppEnvironment | null {
	if (typeof window === 'undefined') return null
	const here = `${window.location.origin}${window.location.pathname}`.replace(/\/+$/, '').toLowerCase()
	return (
		APP_ENVIRONMENTS.find((env) => {
			const base = env.origin.toLowerCase().replace(/\/+$/, '')
			return here === base || here.startsWith(`${base}/`)
		}) ?? null
	)
}

/*
 * LEAP shared login (BrandComply). These MUST match the other LEAP panels (Exporter / Color Separator)
 * so login is shared: the same token file + the same CEP event names let a login in one panel notify
 * the others (event-based, no polling). See the legacy js/auth/* module.
 */
export const LeapAuth = {
	BASE_URL: 'https://www.brandcomply.com',
	AUTH_HEADER: 'HTTP-X-BC-API-KEY',
	AUTH_TOKEN: 'InSTf9qtuWueqIRMX6pU0vpPwflpbQjkNXDPtyNb2yWNRcGZJKpXBZcW7NjCyj4s',
	SERVER_GUID: 'fd19b048-1716-4833-8ce7-900a5652613b',
	TOKEN_FILE: 'leap_auth_token.json',
	SERVER_LIST_FILE: 'leap_server_list.json',
	/* Broadcast (APPLICATION scope) when a user logs in from any panel. Data: { token }. */
	EVENT_AUTHENTICATED: 'com.octane5.leapLogin.authenticated',
	/* Broadcast when auth status changes. Data: { authenticated, user }. */
	EVENT_AUTH_STATUS_CHANGED: 'com.octane5.leap.auth.statusChanged',
	/* Login-screen logo (same URL the legacy login.html used). Falls back to a wordmark if it fails. */
	LOGO_URL: 'https://www.brandcomply.com/media/images/marketing/logo.png',
} as const

/* Login gate toggle (legacy LEAP_AUTH_CONFIG.REQUIRE_LOGIN). Default false → guest, panel works as
   today. Set true to require sign-in before the panel is usable. */
export const REQUIRE_LOGIN = false

/* Browser-dev fallback storage key for the mock token (no filesystem outside CEP). */
export const AUTH_TOKEN_LS_KEY = 'leap.trademarks.authtoken'
