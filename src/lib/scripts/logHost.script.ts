/*
 * Typed wrappers over the log host scripts (open folder, read recent lines).
 */
import type { HostResult } from '../host/contracts'
import { runHostScript } from './buildHostScript'

export async function openLogsFolder(): Promise<HostResult<{ path: string }>> {
	return runHostScript<{ path: string }>({
		log: true,
		body: `
(function () {
	try { return openLogsFolderRun(); }
	catch (e) { return JSON.stringify({ success: false, error: (e && e.message) ? e.message : String(e) }); }
})();
`,
	})
}

export async function readLog(maxLines: number): Promise<HostResult<{ lines: string[] }>> {
	return runHostScript<{ lines: string[] }>({
		log: true,
		body: `
(function () {
	try { return readLogRun(${Number(maxLines) || 200}); }
	catch (e) { return JSON.stringify({ success: false, error: (e && e.message) ? e.message : String(e) }); }
})();
`,
	})
}
