/*
 * CEP implementation of DocumentOpsHost — add colours / add logo to the active Illustrator document.
 * All ExtendScript is delegated to lib/scripts/documentOps.script.ts.
 */
import type { DocumentOpsHost, HostResult, LogoSetItem, SwatchColor } from '../contracts'
import { addColorsToDocument, addLogoSetToDocument, addLogoToDocument, applyVerbiageToTextFrame, markSelectionAsTradeMark, selectItemsById } from '../../scripts/documentOps.script'

export const documentOpsHost: DocumentOpsHost = {
	addColors(colors: SwatchColor[]): Promise<HostResult<{ created: number }>> {
		return addColorsToDocument(colors)
	},
	addLogo(aiPath: string, note: Record<string, unknown>): Promise<HostResult<{ placed: boolean }>> {
		return addLogoToDocument(aiPath, note)
	},
	markSelection(): Promise<HostResult<{ marked: number; skipped: number; names: string[] }>> {
		return markSelectionAsTradeMark()
	},
	addLogoSet(items: LogoSetItem[], applyColor: boolean, setName: string, perArtboard: boolean): Promise<HostResult<{ added: number; missing: number }>> {
		return addLogoSetToDocument(items, applyColor, setName, perArtboard)
	},
	applyVerbiage(text: string): Promise<HostResult<{ applied: boolean }>> {
		return applyVerbiageToTextFrame(text)
	},
	selectItems(ids: string[]): Promise<HostResult<{ selected: number; missing: number }>> {
		return selectItemsById(ids)
	},
}
