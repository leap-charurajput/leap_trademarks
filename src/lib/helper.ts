/**
 * Host access layer — the ONLY module allowed to touch CSInterface / __adobe_cep__.
 *
 * This is the CEP→UXP seam (see AGENTS.md §4). When we move to UXP, only this file and
 * `lib/host/cep/*` change; React, controller signatures, contracts and CSS stay the same.
 */

let csInterface: CSInterfaceLike | null = null

/** Minimal CSInterface surface we rely on (the real impl is loaded from libs/CSInterface.js). */
export interface CSInterfaceLike {
	evalScript(script: string, callback?: (result: string) => void): void
	getSystemPath(type: string): string
	getHostEnvironment(): unknown
	addEventListener(type: string, listener: (event?: unknown) => void, obj?: unknown): void
	removeEventListener(type: string, listener: (event?: unknown) => void, obj?: unknown): void
	dispatchEvent(event: unknown): void
	setPanelFlyoutMenu(menu: string): void
	updatePanelMenuItem(menuItemLabel: string, enabled: boolean, checked: boolean): void
	openURLInDefaultBrowser(url: string): void
}

/*
 * Broadcast a CEP application-scoped event to every extension (used for shared login — other LEAP
 * panels listen for these). No-op outside CEP. `data` is JSON-stringified if not already a string.
 */
export function dispatchCSEvent(type: string, data: unknown): void {
	try {
		const w = window as unknown as { CSEvent?: new (type: string, scope: string) => { data: string } }
		const cs = getCSInterface()
		if (!cs || typeof cs.dispatchEvent !== 'function' || !w.CSEvent) return
		const ev = new w.CSEvent(type, 'APPLICATION')
		ev.data = typeof data === 'string' ? data : JSON.stringify(data)
		cs.dispatchEvent(ev)
	} catch (e) {
		console.warn('[helper] dispatchCSEvent failed', e)
	}
}

/* Subscribe to a CEP event (e.g. another panel's login broadcast). Returns an unsubscribe function. */
export function addCSEventListener(type: string, cb: (data: string | undefined) => void): () => void {
	const cs = getCSInterface()
	if (!cs) return () => {}
	const handler = (event?: unknown) => cb((event as { data?: string } | undefined)?.data)
	cs.addEventListener(type, handler)
	return () => cs.removeEventListener?.(type, handler)
}

/** True when running inside an Adobe CEP host (Illustrator panel). */
export function isCEP(): boolean {
	return typeof window !== 'undefined' && typeof (window as unknown as { __adobe_cep__?: unknown }).__adobe_cep__ !== 'undefined'
}

/** Lazily create (and cache) the CSInterface instance. Returns null outside CEP. */
export function getCSInterface(): CSInterfaceLike | null {
	if (csInterface) return csInterface
	if (typeof window === 'undefined' || !isCEP()) return null
	try {
		const Ctor = (window as unknown as { CSInterface?: new () => CSInterfaceLike }).CSInterface
		if (Ctor) csInterface = new Ctor()
	} catch (e) {
		console.warn('[helper] Failed to create CSInterface', e)
	}
	return csInterface
}

/** Wait until CSInterface.js has loaded (it is injected asynchronously by index.html). */
export function waitForCSInterface(timeoutMs = 10000): Promise<CSInterfaceLike | null> {
	const existing = getCSInterface()
	if (existing || !isCEP()) return Promise.resolve(existing)

	return new Promise((resolve) => {
		const started = Date.now()
		const tick = () => {
			const cs = getCSInterface()
			if (cs) return resolve(cs)
			if (Date.now() - started >= timeoutMs) {
				console.warn('[helper] Timed out waiting for CSInterface')
				return resolve(null)
			}
			setTimeout(tick, 50)
		}
		tick()
	})
}

/**
 * Run an ExtendScript string in the host and resolve with the raw string result.
 * Resolves null when not in CEP or on transport failure.
 */
export function evalScript(script: string): Promise<string | null> {
	return new Promise((resolve) => {
		const cs = getCSInterface()
		if (!cs || typeof cs.evalScript !== 'function') {
			console.warn('[helper] CSInterface not available')
			return resolve(null)
		}
		try {
			cs.evalScript(script, (result: string) => resolve(result === 'null' ? null : result))
		} catch (e) {
			console.error('[helper] evalScript exception', e)
			resolve(null)
		}
	})
}

/** Parse JSON returned from ExtendScript, stripping BOM / control chars / transport noise. */
export function parseEvalScriptJson<T = unknown>(raw: string | null): T {
	if (raw == null || String(raw).trim() === '') throw new Error('Empty result from ExtendScript')
	let text = String(raw).trim()
	if (text.charCodeAt(0) === 0xfeff) text = text.slice(1)
	text = text.replace(/[\x00-\x08\x0B\x0C\x0E-\x1F]/g, '')
	const start = text.indexOf('{')
	const end = text.lastIndexOf('}')
	if (start === -1 || end === -1 || end < start) throw new Error('No JSON object in ExtendScript result')
	return JSON.parse(text.slice(start, end + 1)) as T
}


/*
 * Read a UTF-8 text file from disk inside CEP (used to load the Logobase JSON from a file:// server
 * path, where fetch() is blocked). Accepts a plain path or a file:// URL. Returns null when not in CEP
 * or on any failure. Tries CEP's cep.fs first, then Node's fs (cep_node). This is the only place that
 * reads the local filesystem — same rule as CSInterface access.
 */
export function readTextFile(pathOrFileUrl: string): string | null {
	try {
		const w = window as unknown as {
			cep?: { fs?: { readFile?: (p: string) => { err: number; data?: string } } }
			cep_node?: { require?: (id: string) => { readFileSync: (p: string, enc: string) => string } }
		}
		let path = pathOrFileUrl
		if (path.indexOf('file://') === 0) path = decodeURIComponent(path.replace(/^file:\/\//, ''))
		if (w.cep?.fs?.readFile) {
			const res = w.cep.fs.readFile(path)
			if (res && res.err === 0 && typeof res.data === 'string') return res.data
		}
		const req = w.cep_node?.require
		if (req) {
			const fs = req('fs')
			return fs.readFileSync(path, 'utf8')
		}
	} catch {
		/* fall through to null */
	}
	return null
}


/*
 * Read a binary file from disk as base64 inside CEP (used to show Logobase logo PNGs in a panel that
 * is served from an http(s) origin, where CEF blocks file:// <img> resources). Accepts a path or a
 * file:// URL; returns null outside CEP or on failure. Tries CEP's cep.fs (Base64 encoding) then Node fs.
 */
export function readFileBase64(pathOrFileUrl: string): string | null {
	try {
		const w = window as unknown as {
			cep?: { fs?: { readFile?: (p: string, enc?: string) => { err: number; data?: string } }; encoding?: { Base64?: string } }
			cep_node?: { require?: (id: string) => { readFileSync: (p: string) => { toString: (enc: string) => string } } }
		}
		let path = pathOrFileUrl
		if (path.indexOf('file://') === 0) path = decodeURIComponent(path.replace(/^file:\/\//, ''))
		const base64 = w.cep?.encoding?.Base64 ?? 'Base64'
		if (w.cep?.fs?.readFile) {
			const res = w.cep.fs.readFile(path, base64)
			if (res && res.err === 0 && typeof res.data === 'string') return res.data
		}
		const req = w.cep_node?.require
		if (req) {
			const fs = req('fs')
			return fs.readFileSync(path).toString('base64')
		}
	} catch {
		/* fall through to null */
	}
	return null
}

/*
 * Open a url in the user's DEFAULT SYSTEM BROWSER. `window.open` is not usable here: inside CEP it
 * opens another CEF window owned by Illustrator (which cannot attach to the remote-debugging port),
 * so anything meant for a real browser must go through cep.util. Returns false when it could not
 * open. Falls back to window.open in the dev browser build.
 */
export function openUrlInDefaultBrowser(url: string): boolean {
	try {
		const cs = getCSInterface()
		if (cs?.openURLInDefaultBrowser) {
			cs.openURLInDefaultBrowser(url)
			return true
		}
		const util = (window as unknown as { cep?: { util?: { openURLInDefaultBrowser?: (u: string) => void } } }).cep?.util
		if (util?.openURLInDefaultBrowser) {
			util.openURLInDefaultBrowser(url)
			return true
		}
		if (!isCEP()) return !!window.open(url, '_blank')
	} catch {
		/* fall through */
	}
	return false
}

/* OS path to this panel's INSTALLED extension folder (where CSXS/ and .debug live). Null outside CEP.
   Still the local folder when the panel itself is served from a remote origin by the ZXP shell. */
export function getExtensionPath(): string | null {
	try {
		return getCSInterface()?.getSystemPath?.('extension') ?? null
	} catch {
		return null
	}
}

/* OS path to the user's Documents folder (CEP only); null in the browser. */
export function getDocumentsPath(): string | null {
	const cs = getCSInterface()
	try {
		return cs?.getSystemPath?.('myDocuments') ?? null
	} catch {
		return null
	}
}

/* Normalise a path or file:// URL to a plain filesystem path. */
function toFsPath(pathOrFileUrl: string): string {
	let p = pathOrFileUrl
	if (p.indexOf('file://') === 0) p = decodeURIComponent(p.replace(/^file:\/\//, ''))
	return p
}

/* Lazily resolve Node's fs from the CEP node bridge (only available with --enable-nodejs). */
function nodeFs(): { readFileSync: (p: string, e: string) => string; writeFileSync: (p: string, d: string, e: string) => void; mkdirSync: (p: string, o?: { recursive?: boolean }) => void; existsSync: (p: string) => boolean; rmSync?: (p: string, o?: { recursive?: boolean; force?: boolean }) => void } | null {
	try {
		const req = (window as unknown as { cep_node?: { require?: (id: string) => unknown } }).cep_node?.require
		return req ? (req('fs') as ReturnType<typeof nodeFs>) : null
	} catch {
		return null
	}
}

/* Ensure a directory exists (recursive). Best-effort; no-op outside CEP. */
export function ensureDir(path: string): void {
	const fs = nodeFs()
	try {
		fs?.mkdirSync(toFsPath(path), { recursive: true })
	} catch {
		/* ignore */
	}
}

/* Remove a directory and its contents (recursive). Best-effort; no-op outside CEP / Node. */
export function removeDir(path: string): void {
	const fs = nodeFs()
	try {
		fs?.rmSync?.(toFsPath(path), { recursive: true, force: true })
	} catch {
		/* ignore */
	}
}

/* True when the path exists on disk. False outside CEP / Node (no filesystem to ask). */
export function fileExists(pathOrFileUrl: string): boolean {
	const fs = nodeFs() as unknown as { existsSync?: (p: string) => boolean } | null
	try {
		return !!fs?.existsSync?.(toFsPath(pathOrFileUrl))
	} catch {
		return false
	}
}

/*
 * Delete a single file. Returns true only when the file is gone *because we deleted it* — a path that
 * was already missing returns false, so callers can report "deleted" and "missing" separately instead
 * of claiming to have removed something that was never there. Best-effort; no-op outside CEP / Node.
 */
export function deleteFile(pathOrFileUrl: string): boolean {
	const path = toFsPath(pathOrFileUrl)
	if (!fileExists(path)) return false
	try {
		const fs = nodeFs() as unknown as { unlinkSync?: (p: string) => void } | null
		if (fs?.unlinkSync) {
			fs.unlinkSync(path)
			return !fileExists(path)
		}
		const w = window as unknown as { cep?: { fs?: { deleteFile?: (p: string) => { err: number } } } }
		if (w.cep?.fs?.deleteFile) {
			const res = w.cep.fs.deleteFile(path)
			return !!res && res.err === 0
		}
	} catch {
		/* fall through */
	}
	return false
}

/* Write a UTF-8 text file. Returns true on success. CEP only (cep.fs, then Node fs). */
export function writeTextFile(pathOrFileUrl: string, text: string): boolean {
	const path = toFsPath(pathOrFileUrl)
	try {
		const w = window as unknown as { cep?: { fs?: { writeFile?: (p: string, d: string) => { err: number } } } }
		if (w.cep?.fs?.writeFile) {
			const res = w.cep.fs.writeFile(path, text)
			if (res && res.err === 0) return true
		}
		const fs = nodeFs()
		if (fs) {
			fs.writeFileSync(path, text, 'utf8')
			return true
		}
	} catch {
		/* fall through */
	}
	return false
}

/* Open a native folder picker and return the chosen directory path, or null if cancelled / not CEP. */
export function chooseFolder(title = 'Choose folder', initialPath = ''): string | null {
	try {
		const w = window as unknown as {
			cep?: { fs?: { showOpenDialog?: (multi: boolean, dir: boolean, title: string, initial: string) => { err: number; data?: string[] } } }
		}
		const res = w.cep?.fs?.showOpenDialog?.(false, true, title, initialPath)
		if (res && res.err === 0 && res.data && res.data.length) return res.data[0]
	} catch {
		/* ignore */
	}
	return null
}

/*
 * Open a native file picker and return the chosen file path, or null if cancelled / not CEP.
 * `extensions` limits the picker to those file types (e.g. ['xlsx','xls']).
 */
export function chooseFile(title = 'Choose file', extensions: string[] = [], initialPath = ''): string | null {
	try {
		const w = window as unknown as {
			cep?: { fs?: { showOpenDialog?: (multi: boolean, dir: boolean, title: string, initial: string, types?: string[]) => { err: number; data?: string[] } } }
		}
		const res = w.cep?.fs?.showOpenDialog?.(false, false, title, initialPath, extensions)
		if (res && res.err === 0 && res.data && res.data.length) return res.data[0]
	} catch {
		/* ignore */
	}
	return null
}

/* Open a native multi-file picker; returns the chosen file paths (empty when cancelled / not CEP). */
export function chooseFiles(title = 'Choose files', extensions: string[] = [], initialPath = ''): string[] {
	try {
		const w = window as unknown as {
			cep?: { fs?: { showOpenDialog?: (multi: boolean, dir: boolean, title: string, initial: string, types?: string[]) => { err: number; data?: string[] } } }
		}
		const res = w.cep?.fs?.showOpenDialog?.(true, false, title, initialPath, extensions)
		if (res && res.err === 0 && res.data && res.data.length) return res.data
	} catch {
		/* ignore */
	}
	return []
}

/* List files in a folder whose name ends with one of `extensions` (case-insensitive). Recurses one
   level is NOT done — only the chosen folder. Returns absolute paths. CEP/Node only. */
export function listFilesInFolder(dir: string, extensions: string[]): string[] {
	const fs = nodeFs() as unknown as { readdirSync?: (p: string) => string[] } | null
	const path = toFsPath(dir)
	const out: string[] = []
	try {
		if (!fs?.readdirSync) return out
		const exts = extensions.map((e) => e.toLowerCase().replace(/^\./, ''))
		for (const name of fs.readdirSync(path)) {
			const dot = name.lastIndexOf('.')
			const ext = dot >= 0 ? name.slice(dot + 1).toLowerCase() : ''
			if (exts.indexOf(ext) !== -1) out.push(`${path}/${name}`)
		}
	} catch {
		/* ignore */
	}
	return out
}

/* Open a folder/file in the OS file manager (Finder/Explorer). Returns true if the command ran. */
export function openPath(path: string): boolean {
	try {
		const req = (window as unknown as { cep_node?: { require?: (id: string) => unknown } }).cep_node?.require
		if (!req) return false
		const cp = req('child_process') as { exec: (cmd: string) => void }
		const isWin = navigator.platform.toLowerCase().indexOf('win') !== -1
		const fsPath = toFsPath(path)
		cp.exec(isWin ? `explorer "${fsPath}"` : `open "${fsPath}"`)
		return true
	} catch {
		return false
	}
}
