/*
 * ExtendScript that EXTRACTS spot/PANTONE swatches + a rendered PNG thumbnail from each uploaded AI.
 * For every path it:
 *   - opens the AI,
 *   - collects its named SPOT swatches (doc.spots, excluding [Registration]/[None], colorType SPOT),
 *     deriving CMYK + RGB + hex for each (converting RGB spot values to CMYK first),
 *   - renders an ~80px PNG24 thumbnail to the temp folder (returned as `preview`),
 *   - closes the doc without saving and restores the previously-active document.
 *
 * args = { paths: [aiDiskPath, ...] }
 * Returns JSON { success, data:{ files:[{ path, name, preview, spots:[{name,C,M,Y,K,R,G,B,hex}] }] }, error?, logs }.
 * Never throws across the boundary. ES3 only (var, no const/let/arrow/template-literals).
 */
export const extractAiCode = `
/* Two-digit hex for a 0-255 channel. */
function tmAiHex2(n) {
	var v = Math.round(n);
	if (v < 0) v = 0;
	if (v > 255) v = 255;
	var s = v.toString(16);
	if (s.length < 2) s = "0" + s;
	return s;
}

/* Replace any run of non-alphanumeric chars with a single underscore. */
function tmAiSafe(s) {
	var out = "";
	var prevUs = false;
	var str = String(s);
	var i;
	for (i = 0; i < str.length; i++) {
		var ch = str.charAt(i);
		var ok = (ch >= "0" && ch <= "9") || (ch >= "a" && ch <= "z") || (ch >= "A" && ch <= "Z");
		if (ok) { out += ch; prevUs = false; }
		else if (!prevUs) { out += "_"; prevUs = true; }
	}
	return out;
}

/* Basename (file name with extension) from a disk path. */
function tmAiBaseName(path) {
	var str = String(path);
	var slash = str.lastIndexOf("/");
	var back = str.lastIndexOf("\\\\");
	var cut = slash > back ? slash : back;
	return cut >= 0 ? str.substring(cut + 1) : str;
}

/* CMYK [0-100] -> RGB [0-255] (3-tuple). */
function tmAiCmykToRgb(c, m, y, k) {
	return app.convertSampleColor(ImageColorSpace.CMYK, [c, m, y, k], ImageColorSpace.RGB, ColorConvertPurpose.defaultpurpose);
}

/* RGB [0-255] -> CMYK [0-100] (4-tuple). */
function tmAiRgbToCmyk(r, g, b) {
	return app.convertSampleColor(ImageColorSpace.RGB, [r, g, b], ImageColorSpace.CMYK, ColorConvertPurpose.defaultpurpose);
}

/* Build one extracted-colour record from a spot's name + colour value. */
function tmAiSpotRecord(name, colorVal) {
	var c = 0, m = 0, y = 0, k = 0;
	if (colorVal && colorVal.typename === "CMYKColor") {
		c = colorVal.cyan; m = colorVal.magenta; y = colorVal.yellow; k = colorVal.black;
	} else if (colorVal && colorVal.typename === "RGBColor") {
		var cmyk = tmAiRgbToCmyk(colorVal.red, colorVal.green, colorVal.blue);
		c = cmyk[0]; m = cmyk[1]; y = cmyk[2]; k = cmyk[3];
	}
	var rgb = tmAiCmykToRgb(c, m, y, k);
	var r = rgb[0], g = rgb[1], b = rgb[2];
	return {
		name: String(name),
		C: c, M: m, Y: y, K: k,
		R: r, G: g, B: b,
		hex: "#" + tmAiHex2(r) + tmAiHex2(g) + tmAiHex2(b)
	};
}

function tmExtractAiColors(args) {
	var logs = [];
	function log(where, message) { logs.push("[" + where + "] " + String(message)); }

	var restoreDoc = null;
	try { restoreDoc = app.activeDocument; } catch (eAct) { restoreDoc = null; }

	try {
		if (!args) return JSON.stringify({ success: false, error: "No arguments.", logs: logs });
		var paths = args.paths || [];
		var files = [];

		var pi;
		for (pi = 0; pi < paths.length; pi++) {
			var path = paths[pi];
			var f = new File(path);
			if (!f.exists) {
				log("open", "MISSING: " + path);
				files.push({ path: String(path), missing: true });
				continue;
			}

			var doc = null;
			try {
				doc = app.open(f);

				/* Collect spot swatches. */
				var spots = [];
				var si;
				for (si = 0; si < doc.spots.length; si++) {
					var spot = doc.spots[si];
					try {
						if (spot.name === "[Registration]" || spot.name === "[None]") continue;
						if (spot.colorType !== ColorModel.SPOT) continue;
						spots.push(tmAiSpotRecord(spot.name, spot.color));
					} catch (eSpot) {
						log("spot", "skip: " + ((eSpot && eSpot.message) ? eSpot.message : String(eSpot)));
					}
				}

				/* Render an ~80px PNG24 thumbnail to the temp folder. */
				var preview = "";
				try {
					var ab = doc.artboards[0].artboardRect;
					var w = ab[2] - ab[0];
					var h = ab[1] - ab[3];
					var maxSide = Math.max(w, h);
					if (maxSide <= 0) maxSide = 1;
					var scale = Math.max(1, Math.min(100, 8000 / maxSide));
					var safeName = tmAiSafe(tmAiBaseName(path));
					var pngPath = Folder.temp + "/leap_thumb_" + safeName + "_" + (new Date().getTime()) + ".png";
					var pngOpts = new ExportOptionsPNG24();
					pngOpts.transparency = true;
					pngOpts.antiAliasing = true;
					pngOpts.artBoardClipping = true;
					pngOpts.horizontalScale = scale;
					pngOpts.verticalScale = scale;
					var pngFile = new File(pngPath);
					doc.exportFile(pngFile, ExportType.PNG24, pngOpts);
					preview = pngFile.fsName;
				} catch (ePng) {
					log("thumb", ((ePng && ePng.message) ? ePng.message : String(ePng)));
				}

				files.push({ path: String(path), name: tmAiBaseName(path), preview: preview, spots: spots });
				log("file", tmAiBaseName(path) + " (" + spots.length + " spot(s))");
			} catch (eFile) {
				log("open", path + " ERROR: " + ((eFile && eFile.message) ? eFile.message : String(eFile)));
				files.push({ path: String(path), name: tmAiBaseName(path), preview: "", spots: [] });
			} finally {
				try { if (doc) doc.close(SaveOptions.DONOTSAVECHANGES); } catch (eC) {}
			}
		}

		try { if (restoreDoc) app.activeDocument = restoreDoc; } catch (eR) {}
		log("done", "files=" + files.length);
		return JSON.stringify({ success: true, logs: logs, data: { files: files } });
	} catch (e) {
		try { if (restoreDoc) app.activeDocument = restoreDoc; } catch (eR2) {}
		log("fatal", (e && e.message) ? e.message : String(e));
		return JSON.stringify({ success: false, error: (e && e.message) ? e.message : String(e), logs: logs });
	}
}
`
