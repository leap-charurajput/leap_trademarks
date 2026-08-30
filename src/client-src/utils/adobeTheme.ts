/**
 * Illustrator panel theme detection — port of legacy `updateThemeWithAppSkinInfo()` in variable.js.
 * Uses panel background red channel thresholds (127 / 213 / 52).
 */
import { Theme } from '../enums'
import { getCSInterface, isCEP } from '@lib/helper'

interface RgbColor {
	red: number
	green: number
	blue: number
	alpha?: number
}

interface AppSkinInfo {
	panelBackgroundColor?: { color?: RgbColor }
}

interface HostEnvironment {
	appSkinInfo?: AppSkinInfo
}

/** Legacy: `panelBackgroundColor.color.red > 127` → light family, else dark. */
function themeFromPanelBackgroundRed(red: number): Theme {
	if (red > 127) {
		return red < 213 ? Theme.MediumLight : Theme.Light
	}
	return red > 52 ? Theme.MediumDark : Theme.Dark
}

function readAppSkinInfo(): AppSkinInfo | null {
	if (!isCEP()) return null

	try {
		const cs = getCSInterface()
		const fromCs = cs?.getHostEnvironment?.() as HostEnvironment | undefined
		if (fromCs?.appSkinInfo?.panelBackgroundColor?.color) return fromCs.appSkinInfo

		const cep = (window as unknown as { __adobe_cep__?: { getHostEnvironment?: () => string } }).__adobe_cep__
		const raw = cep?.getHostEnvironment?.()
		if (raw) {
			const parsed = JSON.parse(raw) as HostEnvironment
			return parsed.appSkinInfo ?? null
		}
	} catch {
		/* host env unavailable */
	}

	return null
}

/** Resolve theme from Illustrator host, or null outside CEP / on failure. */
export function detectThemeFromHost(): Theme | null {
	const skin = readAppSkinInfo()
	const red = skin?.panelBackgroundColor?.color?.red
	if (red == null || Number.isNaN(red)) return null
	return themeFromPanelBackgroundRed(red)
}
