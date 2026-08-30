/*
 * ExtendScript file logger — appends to the DATE-WISE daily log the panel also writes:
 * ~/Documents/LEAP Settings/Logs/LEAP Trademarks/leap_trademarks_YYYY-MM-DD.log.
 * Same file naming and line format as the panel logger (lib/logger.ts) and the legacy Angular
 * panel; the [JSX] source column tells host lines apart from the panel's [JS ] lines.
 */
export const hostLogCode = `
var LEAP_LOG_DIR = "LEAP Settings/Logs/LEAP Trademarks";
var LEAP_LOG_PREFIX = "leap_trademarks_";

function leapLogPad(n, len) {
	var s = "" + n;
	while (s.length < (len || 2)) s = "0" + s;
	return s;
}

function leapLogDay(d) {
	return d.getFullYear() + "-" + leapLogPad(d.getMonth() + 1) + "-" + leapLogPad(d.getDate());
}

function leapLogTimestamp(d) {
	return leapLogDay(d) + " " + leapLogPad(d.getHours()) + ":" + leapLogPad(d.getMinutes()) + ":" +
		leapLogPad(d.getSeconds()) + "." + leapLogPad(d.getMilliseconds(), 3);
}

/* Today's log file name — one file per calendar day, shared with the panel side. */
function leapLogFileName(d) {
	return LEAP_LOG_PREFIX + leapLogDay(d || new Date()) + ".log";
}

function leapLogFormatLine(level, tag, message) {
	var levelLabel = (level + "     ").substring(0, 5);
	return leapLogTimestamp(new Date()) + " [" + levelLabel + "] [JSX] [" + (tag || "General") + "] " + message;
}

/* Folder.create() does not create parents — walk up and create each missing level. */
function leapLogEnsureFolder() {
	var folder = new Folder(Folder.myDocuments + "/" + LEAP_LOG_DIR);
	if (!folder.exists) {
		var missing = [];
		var current = folder;
		while (current && !current.exists) {
			missing.unshift(current);
			current = current.parent;
		}
		for (var i = 0; i < missing.length; i++) missing[i].create();
	}
	return folder;
}

if (typeof LEAP_LOG !== "object") {
	LEAP_LOG = {
		write: function (level, tag, message) {
			try {
				var logFolder = leapLogEnsureFolder();
				var logFile = new File(logFolder.fsName + "/" + leapLogFileName());
				logFile.encoding = "UTF-8";
				logFile.open("a");
				logFile.writeln(leapLogFormatLine(level, tag, String(message)));
				logFile.close();
			} catch (e) {}
		},
		info: function (tag, message) {
			LEAP_LOG.write("INFO", tag, message);
		},
		warn: function (tag, message) {
			LEAP_LOG.write("WARN", tag, message);
		},
		error: function (tag, message) {
			LEAP_LOG.write("ERROR", tag, message);
		}
	};
}
`
