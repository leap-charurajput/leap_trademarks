/*
 * ExtendScript for log file utilities: open the log folder in Finder/Explorer, and read the last N
 * lines of TODAY's date-wise log (for a future in-panel dashboard). Depends on hostLogCode
 * (LEAP_LOG_DIR / leapLogFileName / leapLogEnsureFolder) being included first.
 */
export const logHostCode = `
function openLogsFolderRun() {
	try {
		var folder = leapLogEnsureFolder();
		folder.execute();
		return JSON.stringify({ success: true, data: { path: folder.fsName } });
	} catch (e) {
		return JSON.stringify({ success: false, error: (e && e.message) ? e.message : String(e) });
	}
}

/* Return the last maxLines lines of today's log as an array (most-recent last). */
function readLogRun(maxLines) {
	try {
		var file = new File(leapLogEnsureFolder().fsName + "/" + leapLogFileName());
		if (!file.exists) return JSON.stringify({ success: true, data: { lines: [] } });
		file.encoding = "UTF-8";
		file.open("r");
		var raw = file.read();
		file.close();
		var all = String(raw).replace(/\\r/g, "").split("\\n");
		var cleaned = [];
		var i;
		for (i = 0; i < all.length; i++) {
			if (all[i] !== "") cleaned.push(all[i]);
		}
		var limit = maxLines && maxLines > 0 ? maxLines : 200;
		var start = cleaned.length > limit ? cleaned.length - limit : 0;
		return JSON.stringify({ success: true, data: { lines: cleaned.slice(start) } });
	} catch (e) {
		return JSON.stringify({ success: false, error: (e && e.message) ? e.message : String(e) });
	}
}
`
