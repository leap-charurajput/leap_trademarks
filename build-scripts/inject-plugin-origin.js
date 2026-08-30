/**
 * Web-app deployment helper (see AGENTS.md §11).
 * Reads plugin-origin.config.json and:
 *   - writes public/app-config.json + dist/app-config.json (the hosted registry)
 *   - injects the origin URLs into zxp/plugin/web/public/redirect.html placeholders
 */
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const root = path.join(__dirname, '..')

/* The release channels the panel can switch between (LEAP Data Settings). Every channel must have a
   URL in plugin-origin.config.json so the hosted registry always resolves every saved choice. */
const REQUIRED_ENVIRONMENTS = ['production', 'development', 'beta', 'localhost']

function loadOriginConfig() {
	const raw = fs.readFileSync(path.join(root, 'plugin-origin.config.json'), 'utf8')
	const parsed = JSON.parse(raw)
	if (!parsed.defaultOrigin) throw new Error('[INJECT-ORIGIN] missing defaultOrigin')
	for (const id of REQUIRED_ENVIRONMENTS) {
		if (!parsed.environments?.[id]) throw new Error(`[INJECT-ORIGIN] missing environments.${id}`)
	}
	return {
		defaultOrigin: parsed.defaultOrigin,
		environments: parsed.environments,
		bootstrapConfigUrl: `${parsed.defaultOrigin}/app-config.json`,
	}
}

export function injectPluginOrigin({ writeRedirect = true, writeAppConfig = true } = {}) {
	const { defaultOrigin, environments, bootstrapConfigUrl } = loadOriginConfig()
	/* app-config.json is the HOSTED registry the shipped ZXP shell fetches on every panel start:
	   `environments` lets it resolve the user's saved channel to that channel's CURRENT url, so
	   channel urls can move without ever re-shipping the ZXP. */
	const payload = JSON.stringify({ defaultOrigin, environments }, null, 2) + '\n'

	if (writeAppConfig) {
		for (const target of [path.join(root, 'public', 'app-config.json'), path.join(root, 'dist', 'app-config.json')]) {
			const dir = path.dirname(target)
			if (target.includes(`${path.sep}dist${path.sep}`) && !fs.existsSync(dir)) continue
			fs.mkdirSync(dir, { recursive: true })
			fs.writeFileSync(target, payload)
		}
	}

	if (writeRedirect) {
		// Idempotent: rewrite the three var assignments in redirect.html every time.
		const redirectPath = path.join(root, 'zxp', 'plugin', 'web', 'public', 'redirect.html')
		let html = fs.readFileSync(redirectPath, 'utf8')
		html = html
			.replace(/(var REGISTRY_CONFIG_URL = )"[^"]*";/, `$1"${bootstrapConfigUrl}";`)
			.replace(/(var FALLBACK_URL = )"[^"]*";/, `$1"${defaultOrigin}";`)
			.replace(/(var BAKED_ENVIRONMENTS = )\{[^;]*\};/, `$1${JSON.stringify(environments)};`)
		fs.writeFileSync(redirectPath, html)
	}

	console.log('[INJECT-ORIGIN] defaultOrigin:', defaultOrigin)
}

const isMain = process.argv[1] && path.resolve(process.argv[1]) === path.resolve(fileURLToPath(import.meta.url))
if (isMain) {
	const redirectOnly = process.argv.includes('--redirect-only')
	injectPluginOrigin({ writeRedirect: true, writeAppConfig: !redirectOnly })
}
