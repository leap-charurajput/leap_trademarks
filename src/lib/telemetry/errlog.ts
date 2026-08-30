/**
 * Error capture — POSTs errors straight to leap_log_server (/errlog). No local files. Deduped +
 * throttled so a crash loop can't flood; on network failure records are held in the in-memory retry
 * queue. Each record carries the message, JS stack (where it came from), a context tag, the
 * user/machine/tenant, panel version and a machine snapshot. Never throws.
 *
 *   errLog(ctx, err, extra?)  dev-added / auto-captured.
 *   errInit()                 once at bootstrap: hooks window.onerror + unhandledrejection, starts
 *                             the retry timer, and registers this machine.
 */
import { ENDPOINTS, PANEL } from './config'
import {
	currentUsername,
	illustratorVersion,
	isoUtc,
	logobaseLabel,
	machineHostname,
	machineId,
	requireNode,
} from './cepEnv'
import { postOrQueue, startFlushTimer, eid, SESSION_ID } from './queue'
import { logger } from '../logger'

const DEDUP_WINDOW_MS = 120_000
const MAX_POSTS_PER_MINUTE = 20
const SYS_DYNAMIC_TTL_MS = 60_000

/* ---- machine snapshot (attached to every error as `sys`) --------------------------------------- */
interface SysStatic {
	os?: string
	chip?: string
	cores?: number
	ramGB?: number
}
interface SysDynamic {
	freeGB?: number
	diskFreeGB?: number
	apps?: string
}

let sysStaticCache: SysStatic | null = null
let sysDynamicCache: SysDynamic = {}
let sysDynamicAt = 0

function sysStatic(): SysStatic {
	if (sysStaticCache) return sysStaticCache
	try {
		const os = requireNode('os')
		const cpus = (os && os.cpus && os.cpus()) || []
		sysStaticCache = {
			os: os ? `${os.platform()} ${os.version ? os.version() : os.release()}` : '',
			chip: (cpus[0] && cpus[0].model) || '',
			cores: cpus.length,
			ramGB: os ? Math.round(os.totalmem() / 1073741824) : 0,
		}
	} catch {
		sysStaticCache = {}
	}
	return sysStaticCache
}

function refreshSysDynamic(): void {
	try {
		const now = Date.now()
		if (now - sysDynamicAt < SYS_DYNAMIC_TTL_MS) return
		sysDynamicAt = now
		const os = requireNode('os')
		const cp = requireNode('child_process')
		try {
			if (os) sysDynamicCache.freeGB = Math.round(os.freemem() / 107374182.4) / 10
		} catch {
			/* freemem unavailable */
		}
		if (!cp) return
		const isWindows = os && os.platform() === 'win32'
		cp.exec(
			isWindows ? 'powershell -NoProfile -Command "(Get-PSDrive C).Free"' : "df -k / | tail -1 | awk '{print $4}'",
			{ timeout: 3000 },
			(_err: unknown, out: string) => {
				try {
					const value = parseInt(String(out).trim(), 10)
					if (!isNaN(value)) sysDynamicCache.diskFreeGB = Math.round((isWindows ? value / 1073741824 : value / 1048576) * 10) / 10
				} catch {
					/* ignore */
				}
			},
		)
		cp.exec(
			isWindows
				? 'powershell -NoProfile -Command "Get-Process | Where-Object {$_.MainWindowTitle} | Select-Object -ExpandProperty ProcessName -Unique"'
				: 'osascript -e \'tell application "System Events" to get name of (processes where background only is false)\'',
			{ timeout: 4000 },
			(_err: unknown, out: string) => {
				try {
					const apps = String(out || '').trim()
					if (apps) {
						sysDynamicCache.apps = apps
							.split(isWindows ? /\r?\n/ : /,\s*/)
							.map((a) => a.trim())
							.filter(Boolean)
							.slice(0, 25)
							.join(', ')
							.slice(0, 600)
					}
				} catch {
					/* ignore */
				}
			},
		)
	} catch {
		/* never throws */
	}
}

function sysSnapshot(): SysStatic & SysDynamic {
	refreshSysDynamic()
	return { ...sysStatic(), ...sysDynamicCache }
}

/* ---- dedup / throttle -------------------------------------------------------------------------- */
interface SeenEntry {
	at: number
	count: number
}
const seen: Record<string, SeenEntry> = {}
let minuteCount = 0
let minuteStart = 0

/** Dev-added / auto-captured error. POSTs to /errlog (queued on failure). Never throws. */
export function errLog(ctx: string, err?: unknown, extra?: Record<string, unknown>): void {
	try {
		const asErr = err as { message?: string; stack?: string } | undefined
		const msg = err == null ? '' : asErr?.message ? String(asErr.message) : String(err)
		const stack = asErr?.stack ? String(asErr.stack) : ''
		const now = Date.now()

		const key = `${ctx}|${msg}`
		const previous = seen[key]
		if (previous && now - previous.at < DEDUP_WINDOW_MS) {
			previous.count++
			return
		}
		const repeats = previous && previous.count ? previous.count : 0
		seen[key] = { at: now, count: 0 }

		if (now - minuteStart > 60_000) {
			minuteStart = now
			minuteCount = 0
		}
		if (++minuteCount > MAX_POSTS_PER_MINUTE) return

		const record: Record<string, unknown> = {
			eid: eid(),
			t: isoUtc(),
			lb: logobaseLabel(),
			u: currentUsername(),
			p: PANEL.code,
			pv: PANEL.version,
			machine: machineHostname(),
			mid: machineId(),
			ctx: String(ctx || ''),
			msg,
			stack,
			sys: sysSnapshot(),
		}
		/* trail: the last local log lines, so the dashboard error carries the context that led to it. */
		record.extra = { sid: SESSION_ID, trail: logger.lastLines(25), ...(extra || {}) }
		if (repeats) (record.extra as Record<string, unknown>).repeatsSuppressed = repeats
		postOrQueue(ENDPOINTS.errorLog, record)
	} catch {
		/* never throws */
	}
}

/* ---- machine register ------------------------------------------------------------------------- */
function registerMachine(): void {
	try {
		const id = machineId()
		if (!id) return
		const st = sysStatic()
		const specs = {
			hostname: machineHostname(),
			user: currentUsername(),
			os: st.os,
			chip: st.chip,
			cores: st.cores,
			ramGB: st.ramGB,
			lb: logobaseLabel(),
			p: PANEL.code,
			pv: PANEL.version,
		}
		const env = {
			freeGB: sysDynamicCache.freeGB,
			diskFreeGB: sysDynamicCache.diskFreeGB,
			apps: sysDynamicCache.apps || '',
		}
		postOrQueue(ENDPOINTS.machine, { id, specs, env })
	} catch {
		/* best-effort */
	}
}

/* ---- login / session (one per panel open) ----------------------------------------------------- */
function postLogin(): void {
	try {
		const st = sysStatic()
		postOrQueue(ENDPOINTS.login, {
			eid: SESSION_ID, // one login row per session
			t: isoUtc(),
			lb: logobaseLabel(),
			u: currentUsername(),
			p: PANEL.code,
			pv: PANEL.version,
			mid: machineId(),
			machine: machineHostname(),
			os: st.os,
			illustrator: illustratorVersion(),
		})
	} catch {
		/* best-effort */
	}
}

/* ---- init ------------------------------------------------------------------------------------- */
let inited = false
export function errInit(): void {
	if (inited) return
	inited = true
	try {
		window.addEventListener('error', (ev: ErrorEvent) => {
			errLog('uncaught', ev?.error || ev?.message || 'unknown error', ev?.filename ? { file: ev.filename, line: ev.lineno } : undefined)
		})
		window.addEventListener('unhandledrejection', (ev: PromiseRejectionEvent) => {
			errLog('unhandledrejection', ev?.reason || 'unknown rejection')
		})
		startFlushTimer()
		refreshSysDynamic() // warm the snapshot
		postLogin() // record this panel-open (session) right away
		setTimeout(registerMachine, 8000) // register once, after the snapshot has settled
	} catch {
		/* never throws */
	}
}
