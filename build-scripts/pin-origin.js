/**
 * Re-pin this branch's defaultOrigin after a cross-branch merge (see AGENTS.md §11).
 *
 * Cross-branch merges can silently adopt the SOURCE branch's origin: when only one side changed
 * the origin files since the merge base, git takes that side without a conflict — no merge driver
 * or recipe step ever runs. This script makes the fix deterministic: derive the channel from the
 * CURRENT git branch (main → production, otherwise the branch name), set defaultOrigin from the
 * environments map, and re-run the inject. Idempotent — safe to run any time.
 *
 *   node ./build-scripts/pin-origin.js
 */
import fs from 'node:fs'
import path from 'node:path'
import { execSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'
import { injectPluginOrigin } from './inject-plugin-origin.js'

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), '..')
const configPath = path.join(root, 'plugin-origin.config.json')

const branch = execSync('git branch --show-current', { cwd: root }).toString().trim()
const channel = branch === 'main' ? 'production' : branch
const config = JSON.parse(fs.readFileSync(configPath, 'utf8'))
const origin = config.environments?.[channel]

if (!origin) {
	console.error(`[PIN-ORIGIN] branch "${branch}" is not a release branch (no environments.${channel}) — nothing pinned.`)
	process.exit(1)
}

if (config.defaultOrigin === origin) {
	console.log(`[PIN-ORIGIN] ${branch}: already pinned to ${origin}`)
} else {
	console.log(`[PIN-ORIGIN] ${branch}: ${config.defaultOrigin} → ${origin}`)
	config.defaultOrigin = origin
	fs.writeFileSync(configPath, JSON.stringify(config, null, '\t') + '\n')
}
injectPluginOrigin()
