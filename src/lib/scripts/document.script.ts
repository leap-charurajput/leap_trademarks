/*
 * Typed wrappers over the document/artboard host scripts.
 */
import type { HostResult } from '../host/contracts'
import type { ActiveDocumentState, ArtboardInfo, DocumentInfo } from '../host/contracts'
import { runHostScript } from './buildHostScript'

export async function getDocumentInfo(): Promise<HostResult<DocumentInfo>> {
	return runHostScript<DocumentInfo>({
		document: true,
		body: `
(function () {
	try { return getDocumentInfoRun(); }
	catch (e) { return JSON.stringify({ success: false, error: (e && e.message) ? e.message : String(e) }); }
})();
`,
	})
}

export async function listArtboards(): Promise<HostResult<ArtboardInfo[]>> {
	return runHostScript<ArtboardInfo[]>({
		document: true,
		body: `
(function () {
	try { return listArtboardsRun(); }
	catch (e) { return JSON.stringify({ success: false, error: (e && e.message) ? e.message : String(e) }); }
})();
`,
	})
}

export async function checkActiveDocument(): Promise<HostResult<ActiveDocumentState>> {
	return runHostScript<ActiveDocumentState>({
		document: true,
		body: `
(function () {
	try { return checkActiveDocumentRun(); }
	catch (e) { return JSON.stringify({ success: false, error: (e && e.message) ? e.message : String(e) }); }
})();
`,
	})
}
