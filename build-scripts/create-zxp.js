/**
 * Create a signed ZXP from the zxp/plugin folder.
 * The ZXP ships only the redirector + manifest + icons (web-app model, AGENTS.md §4).
 */
import fs from 'node:fs'
import path from 'node:path'
import { execFile } from 'node:child_process'
import { fileURLToPath } from 'node:url'
import { createRequire } from 'node:module'
import * as utils from './utils.js'
import pluginConfig from '../zxp/pluginrc.js'

const require = createRequire(import.meta.url)
const __dirname = path.dirname(fileURLToPath(import.meta.url))
const root = path.resolve(__dirname, '..')
const pluginFolder = path.join(root, 'zxp', 'plugin')
const zxpFile = path.join(root, 'zxp', `${pluginConfig.extensionBundleId}.zxp`)

function getZxpBinary() {
	const provider = require('zxp-provider')
	return (provider.osx || provider.win || '').replace(/^["']|["']$/g, '')
}

function runZxp(args) {
	return new Promise((resolve, reject) => {
		execFile(getZxpBinary(), args, { maxBuffer: 10 * 1024 * 1024 }, (err, stdout, stderr) => {
			if (err) {
				reject(new Error([stderr, stdout, err.message].filter(Boolean).join('\n') || 'ZXPSignCmd failed'))
				return
			}
			resolve(stdout)
		})
	})
}

function resolveCertPath() {
	const { customCert, selfSign } = pluginConfig.certificate
	if (customCert?.path?.trim()) {
		return {
			path: path.isAbsolute(customCert.path) ? customCert.path : path.resolve(root, customCert.path),
			password: customCert.password,
		}
	}
	if (!selfSign?.output) return null
	return {
		path: path.isAbsolute(selfSign.output) ? selfSign.output : path.resolve(root, selfSign.output),
		password: selfSign.password,
		selfSign,
	}
}

async function ensureCertificate(certInfo) {
	if (!certInfo) throw new Error('No certificate configuration in zxp/pluginrc.js')
	if (fs.existsSync(certInfo.path)) {
		utils.log_progress(`Using certificate: ${certInfo.path}`, 'green')
		return certInfo
	}
	const s = certInfo.selfSign
	if (!s) throw new Error(`Certificate not found: ${certInfo.path}`)
	fs.mkdirSync(path.dirname(certInfo.path), { recursive: true })
	utils.log_progress('Generating self-signed certificate...', 'yellow')
	const args = ['-selfSignedCert', s.country, s.province, s.org, s.name, s.password, certInfo.path]
	if (s.locality) args.push('-locality', s.locality)
	if (s.orgUnit) args.push('-orgUnit', s.orgUnit)
	if (s.email) args.push('-email', s.email)
	await runZxp(args)
	utils.log_progress('Certificate created', 'green')
	return certInfo
}

async function createZxp() {
	utils.log_progress('Creating ZXP from zxp/plugin folder', 'blue')
	if (!fs.existsSync(pluginFolder)) {
		utils.log_error(`Plugin folder not found: ${pluginFolder}`)
		process.exit(1)
	}
	if (fs.existsSync(zxpFile)) fs.unlinkSync(zxpFile)
	const certInfo = await ensureCertificate(resolveCertPath())
	utils.log_progress('Signing ZXP package...', 'yellow')
	await runZxp(['-sign', pluginFolder, zxpFile, certInfo.path, certInfo.password])
	utils.log_progress(`ZXP created: ${zxpFile}`, 'green')
}

createZxp().catch((err) => {
	utils.log_error(err.message || String(err))
	process.exit(1)
})
