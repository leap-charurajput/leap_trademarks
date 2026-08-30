/**
 * cepEnv — shared CEP / Node environment access used by both telemetry loggers (roi.ts + errlog.ts).
 *
 * Lives here once so ROI and error logging stay consistent. Every function is fully guarded and
 * returns a safe default: telemetry must never throw into the panel, and must degrade cleanly in the
 * browser/dev build where `cep_node` is absent.
 */

/* CEP Node modules are untyped; alias to keep call sites readable. */
type NodeModule = any // eslint-disable-line @typescript-eslint/no-explicit-any

/** Directory (relative to the user's home) where LEAP writes its machine-local settings. */
const LEAP_SETTINGS_DIR = ['Documents', 'LEAP Settings']

/** Safely require a Node core module through CEP. Returns null when unavailable. */
export function requireNode<T = NodeModule>(moduleName: string): T | null {
	try {
		return (window as any).cep_node?.require?.(moduleName) ?? null // eslint-disable-line @typescript-eslint/no-explicit-any
	} catch {
		return null
	}
}

/** Absolute path to a file inside ~/Documents/LEAP Settings, or null. */
function leapSettingsFilePath(fileName: string): string | null {
	const os = requireNode('os')
	const path = requireNode('path')
	if (!os || !path) return null
	try {
		return path.join(os.homedir(), ...LEAP_SETTINGS_DIR, fileName)
	} catch {
		return null
	}
}

/** Read and JSON-parse a LEAP Settings file. Returns null on any failure. */
function readLeapSettings<T = any>(fileName: string): T | null { // eslint-disable-line @typescript-eslint/no-explicit-any
	try {
		const fs = requireNode('fs')
		const file = leapSettingsFilePath(fileName)
		if (!fs || !file || !fs.existsSync(file)) return null
		return JSON.parse(fs.readFileSync(file, 'utf8')) as T
	} catch {
		return null
	}
}

const pad2 = (value: number): string => (value < 10 ? '0' : '') + value

/** UTC timestamp: YYYY-MM-DDThh:mm:ssZ. */
export function isoUtc(date: Date = new Date()): string {
	return (
		`${date.getUTCFullYear()}-${pad2(date.getUTCMonth() + 1)}-${pad2(date.getUTCDate())}` +
		`T${pad2(date.getUTCHours())}:${pad2(date.getUTCMinutes())}:${pad2(date.getUTCSeconds())}Z`
	)
}

/** Local calendar day: YYYY-MM-DD (used for the per-day event/error file names). */
export function dayLocal(date: Date = new Date()): string {
	return `${date.getFullYear()}-${pad2(date.getMonth() + 1)}-${pad2(date.getDate())}`
}

/** Current OS username, or 'unknown'. */
export function currentUsername(): string {
	try {
		return requireNode('os')?.userInfo?.().username || 'unknown'
	} catch {
		return 'unknown'
	}
}

/** Make a value safe for use in a file name. */
export function sanitizeToken(value: string): string {
	return (value || 'unknown').replace(/[^A-Za-z0-9_-]/g, '_')
}

/** Machine hostname, or ''. */
export function machineHostname(): string {
	try {
		return requireNode('os')?.hostname?.() || ''
	} catch {
		return ''
	}
}

/**
 * Stable machine id. Minted ONCE per machine into ~/Documents/LEAP Settings/leap_machine.json
 * (machine-local — the logobase is shared between machines so it can't live there). Any LEAP panel
 * may mint it; the rest just read. Cached for the session.
 */
let cachedMachineId: string | undefined
export function machineId(): string {
	if (cachedMachineId !== undefined) return cachedMachineId
	cachedMachineId = ''
	try {
		const fs = requireNode('fs')
		const path = requireNode('path')
		const os = requireNode('os')
		if (!fs || !path || !os) return cachedMachineId
		const dir = path.join(os.homedir(), 'Documents', 'LEAP Settings')
		const file = path.join(dir, 'leap_machine.json')
		if (fs.existsSync(file)) {
			cachedMachineId = String(JSON.parse(fs.readFileSync(file, 'utf8')).id || '')
			if (cachedMachineId) return cachedMachineId
		}
		let id = 'M-'
		for (let i = 0; i < 8; i++) id += '0123456789abcdef'[Math.floor(Math.random() * 16)]
		try {
			fs.mkdirSync(dir, { recursive: true })
		} catch {
			/* dir may already exist */
		}
		fs.writeFileSync(file, JSON.stringify({ id, created: new Date().toISOString() }), 'utf8')
		cachedMachineId = id
	} catch {
		cachedMachineId = ''
	}
	return cachedMachineId
}

/**
 * LEAP server (logobase) root from the shared settings file. Deliberately NOT cached — the user can
 * repoint it at runtime. Same root the panel's host scripts use (leapBasePath).
 */
export function logobasePath(): string {
	return readLeapSettings<{ basePath?: string }>('logobaseDataPathSettings.json')?.basePath || ''
}

/** Last path segment of the logobase root — the tenant key (a short human label for the server). */
export function logobaseLabel(base: string = logobasePath()): string {
	const trimmed = (base || '').replace(/[/\\]+$/, '')
	const parts = trimmed.split(/[/\\]/)
	return parts.length ? parts[parts.length - 1] : ''
}

/** Shared per-user ROI event directory: <logobase>/ADMIN_LOG/EVENT_META. */
export function eventMetaDir(base: string = logobasePath()): string {
	const path = requireNode('path')
	return path && base ? path.join(base, 'ADMIN_LOG', 'EVENT_META') : ''
}

/** Local error-trail directory: <logobase>/ADMIN_LOG/ERROR_META (panel-side JSON-first trail). */
export function errorMetaDir(base: string = logobasePath()): string {
	const path = requireNode('path')
	return path && base ? path.join(base, 'ADMIN_LOG', 'ERROR_META') : ''
}

/** Illustrator host version via CSInterface, or null. */
export function illustratorVersion(): string | null {
	try {
		return new (window as any).CSInterface().getHostEnvironment().appVersion || null // eslint-disable-line @typescript-eslint/no-explicit-any
	} catch {
		return null
	}
}

/** Run a short shell command synchronously; returns trimmed stdout or null. */
export function execShell(command: string, timeoutMs = 4000): string | null {
	try {
		return requireNode('child_process')?.execSync?.(command, { encoding: 'utf8', timeout: timeoutMs })?.trim() || null
	} catch {
		return null
	}
}

/**
 * POST via Node's http/https — NOT browser fetch.
 *
 * A CEP panel served from a REMOTE origin runs under CEF web-security that blocks ALL cross-origin
 * browser requests, even against CORS-perfect endpoints; `fetch` silently fails and telemetry never
 * reaches the server. Node networking has no such restriction, so all server POSTs go through it.
 * Supports both http: and https: (so a local dev server, http://localhost:PORT, works). Falls back to
 * `fetch` only when `cep_node` is unavailable (local file:// / dev). Never rejects — resolves { ok }.
 */
export function nodePost(
	urlStr: string,
	headers: Record<string, string>,
	body: string,
): Promise<{ ok: boolean; status: number }> {
	return new Promise((resolve) => {
		try {
			if (!urlStr) return resolve({ ok: false, status: 0 }) // local-JSON-only mode: no endpoint
			const httpsMod = requireNode('https')
			const httpMod = requireNode('http')
			if (!httpsMod && !httpMod) {
				fetch(urlStr, { method: 'POST', headers, body })
					.then((r) => resolve({ ok: r.ok, status: r.status }))
					.catch(() => resolve({ ok: false, status: 0 }))
				return
			}
			const u = new URL(urlStr)
			const mod = u.protocol === 'http:' ? httpMod : httpsMod
			if (!mod) return resolve({ ok: false, status: 0 })
			const req = mod.request(
				{
					hostname: u.hostname,
					port: u.port || undefined,
					path: u.pathname + u.search,
					method: 'POST',
					headers,
					timeout: 10000,
				},
				(res: any) => { // eslint-disable-line @typescript-eslint/no-explicit-any
					res.resume()
					res.on('end', () => resolve({ ok: res.statusCode >= 200 && res.statusCode < 300, status: res.statusCode || 0 }))
				},
			)
			req.on('error', () => resolve({ ok: false, status: 0 }))
			req.on('timeout', () => {
				try {
					req.destroy()
				} catch {
					/* ignore */
				}
				resolve({ ok: false, status: 0 })
			})
			req.write(body)
			req.end()
		} catch {
			resolve({ ok: false, status: 0 })
		}
	})
}
