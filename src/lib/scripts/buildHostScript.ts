/*
 * Shared ExtendScript bundle builder — assembles the polyfills + logger + dialog preamble with the
 * domain bodies a given call needs, so no script string re-declares the shared helpers. Each domain
 * is opt-in via a flag to keep the evaluated payload small.
 */
import { evalScript, parseEvalScriptJson } from '../helper'
import type { HostResult } from '../host/contracts'
import { errLog } from '@lib/telemetry'
import { hostDialogCode } from './hostDialog.inline'
import { hostLogCode } from './hostLog.inline'
import { polyfillsCode } from './polyfills'
import { documentHostCode } from './document.inline'
import { logHostCode } from './logHost.inline'
import { documentOpsCode } from './documentOps.inline'
import { logosheetCode } from './logosheet.inline'
import { logosheetValidatorCode } from './logosheetValidator.inline'
import { logosheetBuilderCode } from './logosheetBuilder.inline'
import { leapAssetsCode } from './leapAssets.inline'
import { extractAiCode } from './extractAi.inline'

/* Always present: ES3 polyfills (incl. pretty JSON.stringify), file logger, themed dialog. */
const BASE = polyfillsCode + hostLogCode + hostDialogCode

export interface BuildHostScriptOptions {
	/* Include document/artboard inspection helpers. */
	document?: boolean
	/* Include log folder/read helpers. */
	log?: boolean
	/* Include document operations (add colours / add logo) helpers. */
	documentOps?: boolean
	/* Include the logosheet parser. */
	logosheet?: boolean
	/* Include the logosheet validator (collect every issue in the sheet). Requires `logosheet` too. */
	logosheetValidator?: boolean
	/* Include the logosheet builder (create a logosheet from uploaded SVGs). */
	logosheetBuilder?: boolean
	/* Include the LEAP assets exporter (spot reconstruction + AI/PNG/SVG export). */
	leapAssets?: boolean
	/* Include the AI colour extractor (spot swatches + rendered PNG thumbnail). */
	extractAi?: boolean
	/* The call body — must end in an IIFE that returns a JSON string. */
	body: string
}

export function buildHostScript(options: BuildHostScriptOptions): string {
	let script = BASE
	if (options.document) script += documentHostCode
	if (options.log) script += logHostCode
	if (options.documentOps) script += documentOpsCode
	if (options.logosheet) script += logosheetCode
	if (options.logosheetValidator) script += logosheetValidatorCode
	if (options.logosheetBuilder) script += logosheetBuilderCode
	if (options.leapAssets) script += leapAssetsCode
	if (options.extractAi) script += extractAiCode
	return script + options.body
}

export async function runHostScript<T>(options: BuildHostScriptOptions): Promise<HostResult<T>> {
	try {
		const raw = await evalScript(buildHostScript(options))
		if (raw == null) {
			return { success: false, error: 'No result from ExtendScript (not in CEP?)' }
		}
		return parseEvalScriptJson<HostResult<T>>(raw)
	} catch (e) {
		/* Relay a genuine ExtendScript/eval throw to leap_log_server (with its message/stack) so host
		   crashes are traceable in the dashboard's New Errors tab. Guarded — never rethrows. */
		errLog('host.runHostScript', e)
		return { success: false, error: e instanceof Error ? e.message : String(e) }
	}
}
