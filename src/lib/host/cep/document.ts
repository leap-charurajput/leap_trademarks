/*
 * CEP implementation of DocumentHost. One file = one domain (AGENTS.md §4). All ExtendScript for
 * "document" operations is delegated to lib/scripts/document.script.ts.
 */
import type { ActiveDocumentState, ArtboardInfo, DocumentHost, DocumentInfo, HostResult } from '../contracts'
import { checkActiveDocument, getDocumentInfo, listArtboards } from '../../scripts/document.script'

export const documentHost: DocumentHost = {
	getInfo(): Promise<HostResult<DocumentInfo>> {
		return getDocumentInfo()
	},
	listArtboards(): Promise<HostResult<ArtboardInfo[]>> {
		return listArtboards()
	},
	checkActiveDocument(): Promise<HostResult<ActiveDocumentState>> {
		return checkActiveDocument()
	},
}
