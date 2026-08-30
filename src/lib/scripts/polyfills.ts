/**
 * ES3 polyfills for ExtendScript inline scripts.
 * JSON.stringify is forced to support (value, null, 4) pretty-print for Illustrator notes.
 * Same approach as leap_color_separator/src/lib/scripts/polyfills.ts
 */
export const polyfillsCode = `
try {
	if (typeof app !== "undefined" && app !== null && typeof UserInteractionLevel !== "undefined") {
		app.userInteractionLevel = UserInteractionLevel.DONTDISPLAYALERTS;
	}
} catch (e) {}

if (typeof String.prototype.trim !== 'function') {
	String.prototype.trim = function() {
		return this.replace(/^[\\s\\uFEFF\\xA0]+|[\\s\\uFEFF\\xA0]+$/g, '');
	};
}

if (typeof Array.isArray !== 'function') {
	Array.isArray = function(arg) {
		return Object.prototype.toString.call(arg) === '[object Array]';
	};
}

if (typeof Array.prototype.filter !== 'function') {
	Array.prototype.filter = function(callback, thisArg) {
		if (this == null) throw new TypeError('filter called on null or undefined');
		var len = this.length >>> 0;
		var result = [];
		for (var i = 0; i < len; i++) {
			if (i in this) {
				var val = this[i];
				if (callback.call(thisArg, val, i, this)) result.push(val);
			}
		}
		return result;
	};
}

/** ExtendScript (ES3) has no Date.prototype.toISOString — used for settings/lock timestamps. */
if (typeof Date.prototype.toISOString !== 'function') {
	Date.prototype.toISOString = function() {
		function p2(n) { return n < 10 ? '0' + n : '' + n; }
		function p3(n) { return n < 10 ? '00' + n : (n < 100 ? '0' + n : '' + n); }
		return this.getUTCFullYear() + '-' + p2(this.getUTCMonth() + 1) + '-' + p2(this.getUTCDate()) +
			'T' + p2(this.getUTCHours()) + ':' + p2(this.getUTCMinutes()) + ':' + p2(this.getUTCSeconds()) +
			'.' + p3(this.getUTCMilliseconds()) + 'Z';
	};
}

if (typeof JSON === "undefined") {
	var JSON = {};
}

/** Pretty-print notes / presets — always 4-space indent (legacy JSON.stringify(o, null, 4)). */
if (typeof LEAP_JSON !== "object") {
	LEAP_JSON = {};
}
LEAP_JSON.stringifyNote = function(obj) {
	return JSON.stringify(obj, null, 4);
};

// FORCE override — native ExtendScript JSON.stringify ignores the space argument (compact notes).
JSON.stringify = function(value, replacer, space) {

	var gap = "";
	var indent = "";

	if (typeof space === "number") {
		for (var sp = 0; sp < space; sp++) gap += " ";
	} else if (typeof space === "string") {
		gap = space;
	}

	function quote(str) {
		var s = String(str);
		var escaped = "";
		var idx;
		for (idx = 0; idx < s.length; idx++) {
			var code = s.charCodeAt(idx);
			if (code === 92) {
				escaped += "\\\\\\\\";
			} else if (code === 34) {
				escaped += '\\\\"';
			} else if (code === 10) {
				escaped += "\\\\n";
			} else if (code === 13) {
				escaped += "\\\\r";
			} else if (code === 9) {
				escaped += "\\\\t";
			} else if (code < 32) {
				// drop control chars that break JSON.parse in the panel
			} else {
				escaped += s.charAt(idx);
			}
		}
		return '"' + escaped + '"';
	}

	function str(key, holder) {
		var v = holder[key];

		if (v === null) return "null";
		if (typeof v === "string") return quote(v);
		if (typeof v === "number") return isFinite(v) ? String(v) : "null";
		if (typeof v === "boolean") return String(v);

		if (Object.prototype.toString.call(v) === "[object Array]") {

			var partial = [];
			indent += gap;

			for (var i = 0; i < v.length; i++) {
				partial.push(str(i, v) || "null");
			}

			var result;

			if (!gap) {
				result = "[" + partial.join(",") + "]";
			} else {
				result = "[\\n" + indent +
					partial.join(",\\n" + indent) +
					"\\n" + indent.substring(0, indent.length - gap.length) + "]";
			}

			indent = indent.substring(0, indent.length - gap.length);
			return result;
		}

		if (typeof v === "object") {

			var keys = [];
			for (var k in v) {
				if (v.hasOwnProperty(k)) keys.push(k);
			}

			var partialObj = [];
			indent += gap;

			for (var j = 0; j < keys.length; j++) {
				var keyName = keys[j];
				var serialized = str(keyName, v);
				if (serialized) {
					partialObj.push(
						quote(keyName) + (gap ? ": " : ":") + serialized
					);
				}
			}

			var finalResult;

			if (!gap) {
				finalResult = "{" + partialObj.join(",") + "}";
			} else {
				finalResult = "{\\n" + indent +
					partialObj.join(",\\n" + indent) +
					"\\n" + indent.substring(0, indent.length - gap.length) + "}";
			}

			indent = indent.substring(0, indent.length - gap.length);
			return finalResult;
		}

		return undefined;
	}

	return str("", { "": value });
};

if (typeof JSON.parse !== "function") {
	JSON.parse = function(str) {
		return eval("(" + str + ")");
	};
}
`;
