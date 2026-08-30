/*
 * ExtendScript that EXPORTS LEAP assets from uploaded AI logos (bypasses the parser). The AI files
 * already carry their named spot swatches, so for each unique AI in the builder grid it:
 *   - opens the AI as its own document,
 *   - reads which of the marked spot colours (by name) are present on the document,
 *   - exports the document to AI + PNG + SVG (SVG generated from the AI, not copied),
 *   - records which colours were present (logoColors) + the file names for the SLS_LOGO JSON.
 *
 * args = {
 *   league, teamCode, basePath,
 *   colors:    [{ token, pantoneName, C,M,Y,K, R,G,B, hex }],   // team (TC1…) AND custom colours
 *   logoTypes: [{ name, columns, sets: [{ name, cells: { <token>: <aiDiskPath> } }] }]
 * }
 * Returns JSON { success, data:{ exported, missing, logos:[record] }, error?, logs }.
 * ES3 only (var, no const/let/arrow/template-literals).
 */
export const leapAssetsCode = `
/* Make a CMYK colour. */
function tmLaCmyk(c, m, y, k) {
	var col = new CMYKColor();
	col.cyan = c; col.magenta = m; col.yellow = y; col.black = k;
	return col;
}

/* Get-or-create a named SPOT swatch on a document (keeps each asset self-consistent for missing spots). */
function tmLaEnsureSpot(doc, color) {
	try { return doc.spots.getByName(color.pantoneName); }
	catch (e) {
		var spot = doc.spots.add();
		spot.name = color.pantoneName;
		spot.colorType = ColorModel.SPOT;
		spot.color = tmLaCmyk(color.C, color.M, color.Y, color.K);
		return spot;
	}
}

/* Does the document already carry a named spot with this pantoneName? */
function tmLaHasSpot(doc, pantoneName) {
	try { doc.spots.getByName(pantoneName); return true; }
	catch (e) { return false; }
}

/* Replace any run of non-alphanumeric chars with a single underscore. */
function tmLaSafe(s) {
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

/* Ensure a folder (and its parents) exist. */
function tmLaEnsureDir(path) {
	var f = new Folder(path);
	if (!f.exists) f.create();
	return f.exists;
}

function tmExportLeapAssets(args) {
	var logs = [];
	function log(where, message) { logs.push("[" + where + "] " + String(message)); }

	var restoreDoc = null;
	try { restoreDoc = app.activeDocument; } catch (eAct) { restoreDoc = null; }

	try {
		if (!args) return JSON.stringify({ success: false, error: "No arguments.", logs: logs });
		var colors = args.colors || [];
		var logoTypes = args.logoTypes || [];
		if (!logoTypes.length) return JSON.stringify({ success: false, error: "No logo types.", logs: logs });

		var league = String(args.league || "");
		var teamCode = String(args.teamCode || "");
		var teamRoot = args.basePath + "/LOGOS/" + league + "/" + teamCode;
		var aiDir = teamRoot + "/ai";
		var pngDir = teamRoot + "/png";
		var svgDir = teamRoot + "/svg";
		tmLaEnsureDir(args.basePath + "/LOGOS");
		tmLaEnsureDir(args.basePath + "/LOGOS/" + league);
		tmLaEnsureDir(teamRoot);
		tmLaEnsureDir(aiDir);
		tmLaEnsureDir(pngDir);
		tmLaEnsureDir(svgDir);
		log("dirs", "ai/png/svg ready under " + teamRoot);

		var exported = 0, missing = 0;
		var records = [];

		var lt, si, ck;
		for (lt = 0; lt < logoTypes.length; lt++) {
			var type = logoTypes[lt];
			var sets = type.sets || [];
			var typeName = String(type.name || ("Type" + (lt + 1)));
			var n = 0; /* per-type running filename index */

			for (si = 0; si < sets.length; si++) {
				var set = sets[si];
				var cells = set.cells || {};
				var setName = String(set.name || ("Set" + (si + 1)));

				/* Group this set's cells by aiPath so ONE asset serves MANY backgrounds. */
				var groups = {}; /* aiPath → [tokens] */
				var order = []; /* preserve insertion order of ai paths */
				for (ck in cells) {
					if (!cells.hasOwnProperty(ck)) continue;
					var p = cells[ck];
					if (!p) continue;
					if (!groups[p]) { groups[p] = []; order.push(p); }
					groups[p].push(ck);
				}

				var gi;
				for (gi = 0; gi < order.length; gi++) {
					var aiPath = order[gi];
					var tokens = groups[aiPath];

					var f = new File(aiPath);
					if (!f.exists) { log("ai", "MISSING: " + aiPath); missing++; continue; }

					n++;
					var base = "LEAP_" + tmLaSafe(teamCode) + "_" + tmLaSafe(typeName) + "_" + tmLaSafe(setName) + "_" + n;

					var aiDoc = null;
					try {
						aiDoc = app.open(f);

						/* The AI already carries its named spots. Read which marked colours are present;
						   create any missing marked spot so the asset stays self-consistent. */
						var logoColors = [];
						var ci;
						for (ci = 0; ci < colors.length; ci++) {
							var color = colors[ci];
							if (tmLaHasSpot(aiDoc, color.pantoneName)) {
								logoColors.push(color.pantoneName);
							} else {
								try { tmLaEnsureSpot(aiDoc, color); } catch (eEns) {}
							}
						}

						/* Export AI. */
						var aiOpts = new IllustratorSaveOptions();
						aiOpts.embedRasterImages = true;
						aiDoc.saveAs(new File(aiDir + "/" + base + ".ai"), aiOpts);

						/* Export PNG. */
						var pngOpts = new ExportOptionsPNG24();
						pngOpts.transparency = true;
						pngOpts.antiAliasing = true;
						pngOpts.artBoardClipping = true;
						aiDoc.exportFile(new File(pngDir + "/" + base + ".png"), ExportType.PNG24, pngOpts);

						/* Export SVG (generated from the AI, not copied). */
						var svgOpts = new ExportOptionsSVG();
						try { svgOpts.embedRasterImages = true; } catch (eEmb) {}
						aiDoc.exportFile(new File(svgDir + "/" + base + ".svg"), ExportType.SVG, svgOpts);

						records.push({
							setName: setName,
							type: typeName,
							backgrounds: tokens,
							logoColors: logoColors,
							fileNameAI: base + ".ai",
							fileNamePNG: base + ".png",
							fileNameSVG: base + ".svg",
							persistantCode: base,
							centerLogoInfo: { CenterShiftFromLeft: "NA", CenterShiftFromLeftValue: "0", CenterShiftFromTop: "NA", CenterShiftFromTopValue: "0" }
						});
						exported++;
						log("export", base + " (" + logoColors.length + " spot(s) present, " + tokens.length + " bg)");
					} catch (eExp) {
						log("export", base + " ERROR: " + ((eExp && eExp.message) ? eExp.message : String(eExp)));
						missing++;
					} finally {
						try { if (aiDoc) aiDoc.close(SaveOptions.DONOTSAVECHANGES); } catch (eC) {}
					}
				}
			}
		}

		try { if (restoreDoc) app.activeDocument = restoreDoc; } catch (eR) {}
		log("done", "exported=" + exported + " missing=" + missing);
		return JSON.stringify({ success: true, logs: logs, data: { exported: exported, missing: missing, logos: records } });
	} catch (e) {
		try { if (restoreDoc) app.activeDocument = restoreDoc; } catch (eR2) {}
		log("fatal", (e && e.message) ? e.message : String(e));
		return JSON.stringify({ success: false, error: (e && e.message) ? e.message : String(e), logs: logs });
	}
}
`
