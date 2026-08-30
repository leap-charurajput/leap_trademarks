/**
 * Version-check telemetry — one snapshot per panel open of the panel version + machine / OS /
 * Illustrator / environment identity, POSTed to leap_log_server (`/versioncheck`) into the separate
 * `version_checks` table and surfaced on the dashboard's New Logins tab.
 *
 * Modelled on the legacy SLS Breakouts `versioncheck-client.js`, but instead of loading credentials
 * from a LEAP server settings file it reuses this panel's existing telemetry transport (the shared
 * `queue` + `cepEnv`, the same `TELEMETRY_HOST` / `X-Secret`), so it POSTs straight to leap_log_server
 * like every other record here.
 *
 * Behaviour:
 *   - Fire-and-forget via `postOrQueue` (in-memory retry on server/network failure, same as ROI/errors).
 *   - Keyed on `SESSION_ID` (the same id the login/session ping uses) so the server can join a
 *     version-check to its login row; re-sends with that id are idempotent (server upserts).
 *   - Re-attempts a few times until the LEAP server folder path resolves (it may be empty for the first
 *     few seconds after launch), mirroring the legacy client. Once resolved (or the cap is hit) it stops.
 *   - Fully guarded — a telemetry failure can never throw into the panel.
 */
import { ENDPOINTS, PANEL } from './config'
import {
	currentUsername,
	execShell,
	illustratorVersion,
	isoUtc,
	logobaseLabel,
	logobasePath,
	machineHostname,
	machineId,
	requireNode,
} from './cepEnv'
import { postOrQueue, SESSION_ID } from './queue'

/*
 * Retry cadence: the LEAP folder path can be unset for the first moments after launch, so we retry a
 * handful of times until it resolves. This is NOT the server-failure retry (the queue handles that) —
 * it's only to capture the LEAP path once the panel has finished wiring its settings.
 */
const START_DELAY_MS = 8000
const MAX_RETRIES = 6
const RETRY_DELAY_MS = 5000
let retries = 0
let sentWithLeapPath = false

/* ---- platform helpers -------------------------------------------------------------------------- */

/** OS platform token from Node's os module ('darwin' | 'win32' | …), or '' when unavailable. */
function osPlatform(): string {
	try {
		return requireNode<{ platform?: () => string }>('os')?.platform?.() || ''
	} catch {
		return ''
	}
}

const isMac = (): boolean => osPlatform() === 'darwin'

/**
 * Friendly OS name + version string (e.g. "macOS 14.5", "Windows 11"). macOS product version comes
 * from `sw_vers`; Windows uses os.version(); everything else falls back to platform + release.
 */
function osInfo(): { os: string; os_version: string } {
	try {
		const os = requireNode<{ platform?: () => string; release?: () => string; version?: () => string }>('os')
		const platform = os?.platform?.() || ''
		const release = os?.release?.() || ''
		if (platform === 'darwin') {
			const product = execShell('sw_vers -productVersion') || release
			return { os: `macOS ${product}`.trim(), os_version: product }
		}
		if (platform === 'win32') {
			const version = (os?.version && os.version()) || release
			return { os: version || 'Windows', os_version: release }
		}
		return { os: `${platform} ${release}`.trim(), os_version: release }
	} catch {
		return { os: '', os_version: '' }
	}
}

/** Friendly computer name — macOS `ComputerName`; otherwise the hostname. */
function computerName(): string {
	if (isMac()) return execShell('scutil --get ComputerName') || machineHostname()
	return machineHostname()
}

/** Mac hardware model (macOS only; null elsewhere). */
function macModel(): string | null {
	return isMac() ? execShell('sysctl -n hw.model') : null
}

/** Active Directory domain (macOS only; null elsewhere / when not bound). */
function adDomain(): string | null {
	if (!isMac()) return null
	return execShell("dsconfigad -show 2>/dev/null | awk -F'= ' '/Active Directory Domain/{print $2}'")
}

/** IANA timezone (browser API, guarded). */
function timezone(): string {
	try {
		return Intl.DateTimeFormat().resolvedOptions().timeZone || ''
	} catch {
		return ''
	}
}

/** UI locale (browser API, guarded). */
function locale(): string {
	try {
		return navigator.language || ''
	} catch {
		return ''
	}
}

/* ---- payload ----------------------------------------------------------------------------------- */

/**
 * Assemble the version-check record. `eid` is the session id so this row links to the login row for
 * the same panel open; the server dedupes / upserts on it.
 */
function collect(): Record<string, unknown> {
	const { os, os_version } = osInfo()
	return {
		eid: SESSION_ID,
		t: isoUtc(),
		lb: logobaseLabel(),
		u: currentUsername(),
		p: PANEL.code,
		pv: PANEL.version,
		pn: PANEL.name,
		mid: machineId(),
		machine: machineHostname(),
		computer_name: computerName(),
		os,
		os_version,
		illustrator: illustratorVersion(),
		timezone: timezone(),
		locale: locale(),
		ad_domain: adDomain(),
		mac_model: macModel(),
		leap_path: logobasePath(),
	}
}

/*
 * Retry only until we have captured the LEAP folder path (or the cap is reached). Windows/macOS with
 * no LEAP path configured will simply stop after MAX_RETRIES — harmless.
 */
function scheduleRetry(hasLeapPath: boolean): void {
	if (hasLeapPath) sentWithLeapPath = true
	if (sentWithLeapPath) return
	if (retries >= MAX_RETRIES) return
	retries += 1
	setTimeout(send, RETRY_DELAY_MS)
}

/** POST the version-check now (queued on failure) and schedule a retry if the LEAP path is still empty. */
export function send(): void {
	try {
		const payload = collect()
		const hasLeapPath = !!payload.leap_path
		postOrQueue(ENDPOINTS.versionCheck, payload)
		scheduleRetry(hasLeapPath)
	} catch {
		/* never throws into the panel */
	}
}

/**
 * Bootstrap once at panel start (call alongside errInit / login ping). Defers the first send off the
 * panel's startup path — it's fire-and-forget, so delaying it costs nothing but keeps the blocking
 * shell calls in collect() away from initial load.
 */
let inited = false
export function versionCheckInit(): void {
	if (inited) return
	inited = true
	try {
		setTimeout(send, START_DELAY_MS)
	} catch {
		/* never throws */
	}
}
