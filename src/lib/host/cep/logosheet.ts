/*
 * CEP implementation of LogosheetHost. One file = one domain (AGENTS.md §4). All ExtendScript for
 * "logosheet" parsing is delegated to lib/scripts/logosheet.script.ts.
 */
import type { BuildLogosheetArgs, BuildLogosheetResult, ExportAssetsArgs, ExportAssetsResult, ExtractAiResult, HostResult, LogosheetHost, ParseLog, ParseResult, ParseTeamInfo, ValidationResult } from '../contracts'
import { buildLogosheet, exportLeapAssets, extractAiColors, parseLogosheet, validateLogosheet } from '../../scripts/logosheet.script'

export const logosheetHost: LogosheetHost = {
	validate(): Promise<HostResult<ValidationResult> & { logs?: ParseLog[] }> {
		return validateLogosheet()
	},
	extractAiColors(paths: string[]): Promise<HostResult<ExtractAiResult> & { logs?: string[] }> {
		return extractAiColors(paths)
	},
	parse(team: ParseTeamInfo): Promise<HostResult<ParseResult> & { logs?: ParseLog[] }> {
		return parseLogosheet(team)
	},
	create(args: BuildLogosheetArgs): Promise<HostResult<BuildLogosheetResult>> {
		return buildLogosheet(args)
	},
	exportAssets(args: ExportAssetsArgs): Promise<HostResult<ExportAssetsResult> & { logs?: string[] }> {
		return exportLeapAssets(args)
	},
}
