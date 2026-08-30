/*
 * Typed wrapper over the logosheet parser host script. Returns the parser's HostResult plus its
 * structured `logs` array (surfaced by the controller).
 */
import type { BuildLogosheetArgs, BuildLogosheetResult, ExportAssetsArgs, ExportAssetsResult, ExtractAiResult, HostResult, ParseLog, ParseResult, ParseTeamInfo, ValidationResult } from '../host/contracts'
import { runHostScript } from './buildHostScript'

/* The validator reuses the parser's layer constants + geometry helpers, so both domains are bundled. */
export async function validateLogosheet(): Promise<HostResult<ValidationResult> & { logs?: ParseLog[] }> {
	return runHostScript<ValidationResult>({
		logosheet: true,
		logosheetValidator: true,
		body: `
(function () {
	try { return tmLsvValidateLogosheet(); }
	catch (e) { return JSON.stringify({ success: false, error: (e && e.message) ? e.message : String(e) }); }
})();
`,
	}) as Promise<HostResult<ValidationResult> & { logs?: ParseLog[] }>
}

export async function extractAiColors(paths: string[]): Promise<HostResult<ExtractAiResult> & { logs?: string[] }> {
	return runHostScript<ExtractAiResult>({
		extractAi: true,
		body: '(function(){ try { return tmExtractAiColors(' + JSON.stringify({ paths }) + '); } catch(e){ return JSON.stringify({success:false,error:(e&&e.message)?e.message:String(e)}); } })();',
	}) as Promise<HostResult<ExtractAiResult> & { logs?: string[] }>
}

export async function parseLogosheet(team: ParseTeamInfo): Promise<HostResult<ParseResult> & { logs?: ParseLog[] }> {
	const args = { league: team.league, teamCode: team.teamCode, basePath: team.basePath }
	return runHostScript<ParseResult>({
		logosheet: true,
		body: `
(function () {
	try { return tmLsParseLogosheet(${JSON.stringify(args)}); }
	catch (e) { return JSON.stringify({ success: false, error: (e && e.message) ? e.message : String(e) }); }
})();
`,
	}) as Promise<HostResult<ParseResult> & { logs?: ParseLog[] }>
}

export async function buildLogosheet(args: BuildLogosheetArgs): Promise<HostResult<BuildLogosheetResult> & { logs?: string[] }> {
	return runHostScript<BuildLogosheetResult>({
		logosheetBuilder: true,
		body: `
(function () {
	try { return tmCreateLogosheet(${JSON.stringify(args)}); }
	catch (e) { return JSON.stringify({ success: false, error: (e && e.message) ? e.message : String(e) }); }
})();
`,
	}) as Promise<HostResult<BuildLogosheetResult> & { logs?: string[] }>
}

export async function exportLeapAssets(args: ExportAssetsArgs): Promise<HostResult<ExportAssetsResult> & { logs?: string[] }> {
	return runHostScript<ExportAssetsResult>({
		leapAssets: true,
		body: '(function(){ try { return tmExportLeapAssets(' + JSON.stringify(args) + '); } catch(e){ return JSON.stringify({success:false,error:(e&&e.message)?e.message:String(e)}); } })();',
	}) as Promise<HostResult<ExportAssetsResult> & { logs?: string[] }>
}
