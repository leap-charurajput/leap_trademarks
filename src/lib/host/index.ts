/*
 * Host factory — the SINGLE switch point between CEP (today) and UXP (future).
 *
 * To migrate to UXP:
 *   1. Add `src/lib/host/uxp/<domain>.ts` files implementing the same contracts.
 *   2. Add `src/lib/host/uxp/index.ts` exporting a `uxpHost: Host`.
 *   3. Return `uxpHost` here when the runtime is UXP.
 * The controller, components and CSS stay untouched. See AGENTS.md §4.
 */
import type { Host } from './contracts'
import { cepHost } from './cep'

export type {
	Host,
	HostResult,
	DocumentHost,
	DocumentInfo,
	ArtboardInfo,
	ActiveDocumentState,
	LogHost,
	DocumentOpsHost,
	SwatchColor,
	LogosheetHost,
	ParseTeamInfo,
	ParseResult,
	ParseLog,
	ParseColor,
	ParseLogoSet,
	ParseLogoVersion,
	BuildColumn,
	BuildSet,
	BuildLogoType,
	BuildLogosheetArgs,
	BuildLogosheetResult,
	AssignedSpot,
	ExportAssetsArgs,
	ExportedLogoRecord,
	ExportAssetsResult,
	ExtractedColor,
	ExtractedFile,
	ExtractAiResult,
	ValidationSeverity,
	ValidationIssue,
	ValidationResult,
} from './contracts'

let host: Host | null = null

export function getHost(): Host {
	if (host) return host
	// Future: if (isUXP()) host = uxpHost; else host = cepHost
	host = cepHost
	return host
}
