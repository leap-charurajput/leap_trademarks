/*
 * Structured logger — the panel's local "flight recorder". Every line goes to the console AND, inside
 * CEP, is appended directly (Node fs, no ExtendScript round-trip) to a DATE-WISE file:
 *
 *   ~/Documents/LEAP Settings/Logs/LEAP Trademarks/leap_trademarks_YYYY-MM-DD.log
 *
 * Same folder, file naming and line format as the legacy Angular panel, so support always grabs the
 * same folder regardless of which panel version a machine runs:
 *
 *   2026-08-19 14:05:33.123 [INFO ] [JS ] [Logosheet] message
 *
 * The [JS ] column marks panel-side lines; the ExtendScript host appends [JSX] lines to the SAME file
 * through LEAP_LOG (scripts/hostLog.inline.ts). Files older than RETENTION_DAYS are deleted on the
 * first write of a session. The local file intentionally complements server telemetry: telemetry is
 * curated (events + errors, network-dependent), this file is the complete offline story a client can
 * hand to support via the flyout's "Open logs folder".
 *
 * A bounded in-memory ring buffer keeps the most recent lines; telemetry's errlog attaches them to
 * every server error record (extra.trail) so a dashboard error already carries its local context.
 *
 * Use this everywhere instead of bare console.* (AGENTS.md). Never throws, never blocks the UI.
 */
import { isCEP } from './helper'
import { requireNode } from './telemetry/cepEnv'
import { PANEL } from './telemetry/config'

type LogLevel = 'log' | 'info' | 'warn' | 'error'

const FILE_LEVEL: Record<LogLevel, string> = {
	log: 'INFO',
	info: 'INFO',
	warn: 'WARN',
	error: 'ERROR',
}

const LOG_DIR_SEGMENTS = ['Documents', 'LEAP Settings', 'Logs', 'LEAP Trademarks']
const FILE_PREFIX = 'leap_trademarks_'
const RETENTION_DAYS = 30
const RING_CAPACITY = 200
const MAX_CONSECUTIVE_WRITE_FAILURES = 20

let logDir: string | null = null
let sessionStarted = false
let writeFailures = 0
const ring: string[] = []

const pad = (value: number, len = 2): string => String(value).padStart(len, '0')

/* Local calendar day (YYYY-MM-DD) — one log file per day. */
function dayStamp(date: Date): string {
	return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`
}

/* Full local timestamp with milliseconds, matching the legacy panel's line format. */
function timeStamp(date: Date): string {
	return `${dayStamp(date)} ${pad(date.getHours())}:${pad(date.getMinutes())}:${pad(date.getSeconds())}.${pad(date.getMilliseconds(), 3)}`
}

/* Resolve (and create, once) the log directory. Returns null outside CEP / without Node. */
function resolveLogDir(): string | null {
	if (logDir !== null) return logDir || null
	logDir = ''
	try {
		const fs = requireNode<{ mkdirSync: (p: string, o?: { recursive?: boolean }) => void }>('fs')
		const os = requireNode<{ homedir: () => string }>('os')
		const path = requireNode<{ join: (...parts: string[]) => string }>('path')
		if (!fs || !os || !path) return null
		const dir = path.join(os.homedir(), ...LOG_DIR_SEGMENTS)
		fs.mkdirSync(dir, { recursive: true })
		logDir = dir
	} catch {
		/* stay disabled for this session */
	}
	return logDir || null
}

/* Delete daily log files older than RETENTION_DAYS (matched by the date in the file name). */
function cleanupOldLogs(dir: string): void {
	try {
		const fs = requireNode<{ readdirSync: (p: string) => string[]; unlinkSync: (p: string) => void }>('fs')
		const path = requireNode<{ join: (...parts: string[]) => string }>('path')
		if (!fs || !path) return
		const cutoff = new Date()
		cutoff.setDate(cutoff.getDate() - RETENTION_DAYS)
		for (const name of fs.readdirSync(dir)) {
			if (name.indexOf(FILE_PREFIX) !== 0) continue
			const match = name.match(/(\d{4})-(\d{2})-(\d{2})/)
			if (!match) continue
			const fileDate = new Date(Number(match[1]), Number(match[2]) - 1, Number(match[3]))
			if (fileDate < cutoff) {
				try {
					fs.unlinkSync(path.join(dir, name))
				} catch {
					/* the file may be open elsewhere — retry next session */
				}
			}
		}
	} catch {
		/* housekeeping is best-effort */
	}
}

/* Append one already-formatted line to today's file. Disables itself after repeated failures. */
function appendToFile(line: string): void {
	if (!isCEP() || writeFailures >= MAX_CONSECUTIVE_WRITE_FAILURES) return
	const dir = resolveLogDir()
	if (!dir) return
	try {
		const fs = requireNode<{ appendFileSync: (p: string, d: string) => void }>('fs')
		const os = requireNode<{ platform: () => string }>('os')
		const path = requireNode<{ join: (...parts: string[]) => string }>('path')
		if (!fs || !path) return
		const eol = os && os.platform() === 'win32' ? '\r\n' : '\n'
		const file = path.join(dir, `${FILE_PREFIX}${dayStamp(new Date())}.log`)
		if (!sessionStarted) {
			sessionStarted = true
			cleanupOldLogs(dir)
			const banner =
				`${eol}================================================================================${eol}` +
				`${timeStamp(new Date())} [INFO ] [JS ] [Session] ${PANEL.name} (React) v${PANEL.version} session started | ` +
				`platform=${typeof navigator !== 'undefined' ? navigator.platform : 'unknown'}${eol}`
			fs.appendFileSync(file, banner)
		}
		fs.appendFileSync(file, line + eol)
		writeFailures = 0
	} catch {
		writeFailures++
	}
}

/* Format `[tag] message`, emit to the matching console channel, mirror to the ring + daily file. */
function write(level: LogLevel, tag: string | undefined, msg: string): void {
	const record = tag ? `[${tag}] ${msg}` : msg
	switch (level) {
		case 'log':
			console.log(record)
			break
		case 'info':
			console.info(record)
			break
		case 'warn':
			console.warn(record)
			break
		case 'error':
			console.error(record)
			break
	}
	const line = `${timeStamp(new Date())} [${FILE_LEVEL[level].padEnd(5)}] [JS ] [${tag || 'General'}] ${msg}`
	ring.push(line)
	if (ring.length > RING_CAPACITY) ring.shift()
	appendToFile(line)
}

export const logger = {
	log(tag: string | undefined, msg: string) {
		write('log', tag, msg)
	},
	info(tag: string | undefined, msg: string) {
		write('info', tag, msg)
	},
	warn(tag: string | undefined, msg: string) {
		write('warn', tag, msg)
	},
	error(tag: string | undefined, msg: string) {
		write('error', tag, msg)
	},
	/*
	 * The most recent log lines (oldest first) from the in-memory ring buffer. Telemetry attaches this
	 * to server error records so a dashboard error carries the local context that produced it.
	 */
	lastLines(count = 25): string[] {
		return ring.slice(-Math.max(1, count))
	},
}
