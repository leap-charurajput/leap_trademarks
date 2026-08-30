/**
 * Vite plugin:
 *  - dev: serve /libs (CSInterface.js) from src/libs so index.html can load it
 *  - build: copy src/libs into dist and (re)write app-config.json for the web-app model
 *
 * Host code now lives in src/lib/host/* and is statically imported by the controller, so
 * there is no per-script bundling step any more (see AGENTS.md §4).
 */
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { injectPluginOrigin } from './inject-plugin-origin.js'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const root = path.join(__dirname, '..')
const srcFolder = path.join(root, 'src')

function copyRecursiveSync(src, dest) {
	if (!fs.existsSync(src)) return
	if (fs.statSync(src).isDirectory()) {
		fs.mkdirSync(dest, { recursive: true })
		for (const child of fs.readdirSync(src)) copyRecursiveSync(path.join(src, child), path.join(dest, child))
	} else {
		fs.mkdirSync(path.dirname(dest), { recursive: true })
		fs.copyFileSync(src, dest)
	}
}

export default function viteCopyPlugin() {
	return {
		name: 'leap-vite-copy-plugin',
		configureServer(server) {
			server.middlewares.use('/libs', (req, res, next) => {
				const urlPath = (req.url || '').split('?')[0].replace(/^\//, '') || 'CSInterface.js'
				const filePath = path.join(srcFolder, 'libs', urlPath)
				if (fs.existsSync(filePath) && fs.statSync(filePath).isFile()) {
					res.setHeader('Content-Type', 'application/javascript')
					res.end(fs.readFileSync(filePath))
				} else next()
			})
		},
		closeBundle() {
			const dist = path.join(root, 'dist')
			fs.mkdirSync(dist, { recursive: true })
			injectPluginOrigin({ writeRedirect: false })
			const libsDest = path.join(dist, 'libs')
			if (fs.existsSync(libsDest)) fs.rmSync(libsDest, { recursive: true, force: true })
			copyRecursiveSync(path.join(srcFolder, 'libs'), libsDest)
			console.log('[VITE-PLUGIN] Copied libs into dist')
		},
	}
}
