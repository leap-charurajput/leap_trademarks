/**
 * Telemetry configuration — the SINGLE source of truth for this panel's telemetry identity, the
 * log-server endpoints and the shared secret. Editing a new panel = editing this one file.
 *
 * DIRECT-TO-SERVER: telemetry POSTs straight to leap_log_server (no local JSON files). Set
 * TELEMETRY_HOST to your server and TELEMETRY_SECRET to the server's INGEST_SECRET. When
 * TELEMETRY_HOST is empty everything no-ops (safe in dev/browser).
 */

/** Per-panel identity — the only values that differ between LEAP panels. */
export const PANEL = {
	code: 'TMK',
	name: 'LEAP Trademarks',
	version: '1.0.0',
} as const

/**
 * Base URL of the LEAP log server (leap_log_server). Dev default is the local server on :4000.
 * Point this at the deployed server URL in production. Empty string = telemetry disabled.
 */
const TELEMETRY_HOST: string = 'http://localhost:4000'

/**
 * MUST equal the server's INGEST_SECRET (leap_log_server/.env). Sent as the `X-Secret` header on
 * every POST. If you set a different INGEST_SECRET on the server, change this one line.
 */
export const TELEMETRY_SECRET = '9818c14a43cdd32c6e35dc6ab2dd56b8b4cb696363e9b9d3'

/** Server ingest endpoints, all derived from the single host. */
export const ENDPOINTS = {
	roiEvents: TELEMETRY_HOST ? `${TELEMETRY_HOST}/roi-events` : '',
	roiTemplates: TELEMETRY_HOST ? `${TELEMETRY_HOST}/roi-templates` : '',
	errorLog: TELEMETRY_HOST ? `${TELEMETRY_HOST}/errlog` : '',
	machine: TELEMETRY_HOST ? `${TELEMETRY_HOST}/machine` : '',
	login: TELEMETRY_HOST ? `${TELEMETRY_HOST}/login` : '',
	/* Version-check snapshot (panel + machine + OS + Illustrator + environment), one per panel open. */
	versionCheck: TELEMETRY_HOST ? `${TELEMETRY_HOST}/versioncheck` : '',
} as const

/** Schema version stamped on every record. Bump when the JSON shape changes. */
export const SCHEMA = 2

/** True when a server is configured; false = telemetry disabled (no-op). */
export function hasServer(): boolean {
	return TELEMETRY_HOST.length > 0
}
