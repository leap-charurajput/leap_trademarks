/**
 * One-time / repeat sync of the CEP shell into Illustrator's extensions folder.
 * Required before first local test — the React app is NOT the legacy com.oppsllc.SLSVariables panel.
 */
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { injectPluginOrigin } from './inject-plugin-origin.js'
import pluginConfig from '../zxp/pluginrc.js'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const projectRoot = path.join(__dirname, '..')
const pluginSource = path.join(projectRoot, 'zxp', 'plugin')
const id = pluginConfig.extensionBundleId

const cepTargets = [
	`/Library/Application Support/Adobe/CEP/extensions/${id}`,
	`${process.env.HOME}/Library/Application Support/Adobe/CEP/extensions/${id}`,
]

function copyRecursiveSync(src, dest) {
	if (!fs.existsSync(src)) return
	if (fs.statSync(src).isDirectory()) {
		fs.mkdirSync(dest, { recursive: true })
		for (const entry of fs.readdirSync(src)) copyRecursiveSync(path.join(src, entry), path.join(dest, entry))
	} else {
		fs.mkdirSync(path.dirname(dest), { recursive: true })
		fs.copyFileSync(src, dest)
	}
}

if (!fs.existsSync(pluginSource)) {
	console.error('[SYNC-CEP] Plugin source not found:', pluginSource)
	process.exit(1)
}

injectPluginOrigin({ writeRedirect: true, writeAppConfig: false })

// Copy into every CEP extensions folder we can write to. The system-wide folder
// (/Library/...) usually needs sudo; the per-user folder (~/Library/...) does not. A failure on
// one target (e.g. EACCES on the system path) must NOT abort the sync — we just skip it and keep
// going, so the user-level copy still succeeds.
let synced = 0
for (const target of cepTargets) {
	try {
		// Ensure the CEP extensions folder exists (created recursively for the per-user path on a
		// fresh machine). copyRecursiveSync also mkdirs, but doing it here makes EACCES explicit.
		fs.mkdirSync(path.dirname(target), { recursive: true })
		copyRecursiveSync(pluginSource, target)
		console.log('[SYNC-CEP] Updated:', target)
		synced++
	} catch (err) {
		const reason = err && err.code === 'EACCES' ? 'permission denied (needs sudo) — skipped' : err.message
		console.warn('[SYNC-CEP] Skipped:', target, '→', reason)
	}
}
if (!synced) {
	console.warn('[SYNC-CEP] Could not write to any CEP folder.')
	console.warn('[SYNC-CEP] The per-user folder is created automatically; if this persists, check folder permissions on:')
	console.warn('[SYNC-CEP]   ' + cepTargets[cepTargets.length - 1])
	process.exit(1)
}
console.log('')
console.log('[SYNC-CEP] Open panel: Window → Extensions → "LEAP Trademarks (New)" (not legacy "LEAP Trademarks").')
console.log('[SYNC-CEP] Then: npm run dev  →  http://localhost:5002')
console.log('[SYNC-CEP] Restart Illustrator if the panel was already open.')
