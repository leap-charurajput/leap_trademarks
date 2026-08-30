/**
 * CEP host glue. The ONLY helper the cep/* domain files use to talk to Illustrator.
 *
 * `runJsx` wraps an ExtendScript body in a try/catch IIFE, runs it via evalScript, and
 * parses the JSON result into a HostResult. Keeping this here means every domain file is a
 * thin list of operations — and the UXP versions will simply not import it.
 *
 * NOTE: the strings passed in are ExtendScript (ES3): `var` only, no const/let/arrow fns.
 */
import { evalScript, parseEvalScriptJson } from '../../helper'
import type { HostResult } from '../contracts'

export function ok<T>(data?: T): HostResult<T> {
	return { success: true, data }
}

export function fail(error: string, meta?: Pick<HostResult<never>, 'alertTitle'>): HostResult<never> {
	return { success: false, error, ...meta }
}

/** Forward a failed script result without dropping panel dialog metadata. */
export function forwardFail<T>(result: HostResult<T>, fallbackError: string): HostResult<never> {
	return fail(result.error ?? fallbackError, result.alertTitle ? { alertTitle: result.alertTitle } : undefined)
}

/**
 * Run an ExtendScript expression that returns a JSON string of shape
 * `{ success, data?, error? }` and resolve it as a typed HostResult.
 *
 * @param body ExtendScript statements; must `return JSON.stringify({...})`.
 */
export async function runJsx<T>(body: string): Promise<HostResult<T>> {
	const script = `(function () {\n\ttry {\n${body}\n\t} catch (e) {\n\t\treturn JSON.stringify({ success: false, error: (e && e.message) ? e.message : String(e) });\n\t}\n})();`
	try {
		const raw = await evalScript(script)
		return parseEvalScriptJson<HostResult<T>>(raw)
	} catch (e) {
		return fail(e instanceof Error ? e.message : String(e))
	}
}
