/*
 * CEP implementation of LogHost — open the log folder and read recent lines.
 */
import type { HostResult, LogHost } from '../contracts'
import { openLogsFolder, readLog } from '../../scripts/logHost.script'

export const logHost: LogHost = {
	openFolder(): Promise<HostResult<{ path: string }>> {
		return openLogsFolder()
	},
	read(maxLines: number): Promise<HostResult<{ lines: string[] }>> {
		return readLog(maxLines)
	},
}
