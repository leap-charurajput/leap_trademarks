/*
 * Typed wrappers over the document-ops host scripts (add colours, add logo).
 */
import type { HostResult, SwatchColor } from '../host/contracts'
import { runHostScript } from './buildHostScript'

export async function addColorsToDocument(colors: SwatchColor[]): Promise<HostResult<{ created: number }>> {
	return runHostScript<{ created: number }>({
		documentOps: true,
		body: `
(function () {
	try { return tmAddColorsToDocument(${JSON.stringify(colors)}); }
	catch (e) { return JSON.stringify({ success: false, error: (e && e.message) ? e.message : String(e) }); }
})();
`,
	})
}

export async function addLogoToDocument(aiPath: string, note: Record<string, unknown>): Promise<HostResult<{ placed: boolean }>> {
	return runHostScript<{ placed: boolean }>({
		documentOps: true,
		body: `
(function () {
	try { return tmAddLogoToDocument(${JSON.stringify(aiPath)}, ${JSON.stringify(note)}); }
	catch (e) { return JSON.stringify({ success: false, error: (e && e.message) ? e.message : String(e) }); }
})();
`,
	})
}

export async function markSelectionAsTradeMark(): Promise<HostResult<{ marked: number; skipped: number; names: string[] }>> {
	return runHostScript<{ marked: number; skipped: number; names: string[] }>({
		documentOps: true,
		body: `
(function () {
	try { return tmMarkSelectionAsTradeMark(); }
	catch (e) { return JSON.stringify({ success: false, error: (e && e.message) ? e.message : String(e) }); }
})();
`,
	})
}

export interface LogoSetItem {
	aiPath: string
	C?: number
	M?: number
	Y?: number
	K?: number
}

export async function addLogoSetToDocument(items: LogoSetItem[], applyColor: boolean, setName: string, perArtboard: boolean): Promise<HostResult<{ added: number; missing: number }>> {
	return runHostScript<{ added: number; missing: number }>({
		documentOps: true,
		body: `
(function () {
	try { return tmAddLogoSetToDocument(${JSON.stringify(items)}, ${JSON.stringify(!!applyColor)}, ${JSON.stringify(setName)}, ${JSON.stringify(!!perArtboard)}); }
	catch (e) { return JSON.stringify({ success: false, error: (e && e.message) ? e.message : String(e) }); }
})();
`,
	})
}

export async function selectItemsById(ids: string[]): Promise<HostResult<{ selected: number; missing: number }>> {
	return runHostScript<{ selected: number; missing: number }>({
		documentOps: true,
		body: `
(function () {
	try { return tmSelectItemsById(${JSON.stringify(ids)}); }
	catch (e) { return JSON.stringify({ success: false, error: (e && e.message) ? e.message : String(e) }); }
})();
`,
	})
}

export async function applyVerbiageToTextFrame(text: string): Promise<HostResult<{ applied: boolean }>> {
	return runHostScript<{ applied: boolean }>({
		documentOps: true,
		body: `
(function () {
	try { return tmApplyVerbiageToTextFrame(${JSON.stringify(text)}); }
	catch (e) { return JSON.stringify({ success: false, error: (e && e.message) ? e.message : String(e) }); }
})();
`,
	})
}
