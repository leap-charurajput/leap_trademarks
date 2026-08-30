/**
 * Direct-to-server sender with a bounded in-memory retry queue.
 *
 * Telemetry POSTs straight to leap_log_server — no local JSON files. If a POST fails (server/network
 * down), the record is held in memory and retried on a timer; the queue is capped so a long outage
 * can't grow unbounded. This is the "pure direct + in-memory queue" durability model: on a hard
 * crash/close during an outage, un-sent records are lost (acceptable for adoption/ROI + errors).
 *
 * Every record carries a client `eid` (or template `uuid`) so the server dedupes retries — re-sending
 * the same record is harmless.
 */
import { TELEMETRY_SECRET, hasServer } from './config'
import { nodePost } from './cepEnv'
import { logger } from '../logger'

const MAX_QUEUE = 500
const FLUSH_MS = 30_000
const FLUSH_BATCH = 50
const MIRROR_MAX_CHARS = 600

interface Item {
	url: string
	body: string
}
const queue: Item[] = []
let flushTimer: ReturnType<typeof setInterval> | null = null

/** A unique id for idempotent retries (crypto.randomUUID in CEF; a timestamp+random fallback). */
export function eid(): string {
	try {
		const c = (globalThis as unknown as { crypto?: { randomUUID?: () => string } }).crypto
		if (c?.randomUUID) return c.randomUUID()
	} catch {
		/* fall through */
	}
	return `e-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`
}

/**
 * One id per panel open (module load) — ties together all events/errors/the login from a single
 * session, so the dashboard can group "what happened in one sitting".
 */
export const SESSION_ID = eid()

function headers(): Record<string, string> {
	return { 'Content-Type': 'application/json', 'X-Secret': TELEMETRY_SECRET }
}

function enqueue(url: string, body: string): void {
	if (queue.length < MAX_QUEUE) queue.push({ url, body })
}

/*
 * Mirror one telemetry record into the local daily log file, so the on-disk log is the complete
 * story even when the server is unreachable or telemetry is disabled. Error records mirror at
 * ERROR level so they stand out in the file; everything else is INFO. Bodies are truncated —
 * the mirror is a breadcrumb, the server holds the full record.
 */
function mirrorToLocalLog(url: string, body: string): void {
	try {
		const endpoint = url ? url.slice(url.lastIndexOf('/')) : '(no server)'
		const summary = body.length > MIRROR_MAX_CHARS ? `${body.slice(0, MIRROR_MAX_CHARS)}…` : body
		if (endpoint === '/errlog') logger.error('Telemetry', `${endpoint} ${summary}`)
		else logger.info('Telemetry', `${endpoint} ${summary}`)
	} catch {
		/* the mirror must never interfere with sending */
	}
}

/** POST now; on failure, queue for retry. Every record also mirrors to the local log. Never throws. */
export function postOrQueue(url: string, payload: unknown): void {
	try {
		const body = JSON.stringify(payload)
		mirrorToLocalLog(url, body)
		if (!hasServer() || !url) return
		nodePost(url, headers(), body)
			.then((r) => {
				if (!r.ok) {
					logger.warn('Telemetry', `POST failed (status ${r.status}) — queued for retry: ${url}`)
					enqueue(url, body)
				}
			})
			.catch(() => enqueue(url, body))
	} catch {
		/* never throw into the panel */
	}
}

/** Retry queued records (a batch per tick). Never throws. */
export function flush(): void {
	try {
		if (!hasServer() || !queue.length) return
		const batch = queue.splice(0, FLUSH_BATCH)
		for (const item of batch) {
			nodePost(item.url, headers(), item.body)
				.then((r) => {
					if (!r.ok) enqueue(item.url, item.body)
				})
				.catch(() => enqueue(item.url, item.body))
		}
	} catch {
		/* never throw */
	}
}

/** Start the retry timer once (called from errInit). */
export function startFlushTimer(): void {
	if (flushTimer || !hasServer()) return
	flushTimer = setInterval(flush, FLUSH_MS)
}
