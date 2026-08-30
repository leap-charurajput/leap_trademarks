import path from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const certPath = path.join(__dirname, 'certificate', 'cert.p12')

export default {
	extensionBundleId: 'com.LEAP.LEAPTrademarks',
	extensionBundleName: 'com.LEAP.LEAPTrademarks',
	extensionBundleVersion: '1.0.0',
	cepVersion: '11.0',
	panelName: 'LEAP Trademarks',
	width: '375',
	height: '600',
	certificate: {
		customCert: { path: '', password: 'charurajput' },
		selfSign: {
			country: 'US',
			province: 'CA',
			org: 'org',
			name: 'LEAP',
			password: 'charurajput',
			locality: 'New York',
			orgUnit: 'New York',
			email: 'charurajput89@gmail.com',
			output: certPath,
		},
	},
}
