/*
 * ExtendScript for logosheet VALIDATION (Illustrator DOM — genuinely requires ExtendScript). This is a
 * clean ES3 rewrite of LEAP Librarian's `jsx/logosheetValidator.jsx`: instead of failing on the first
 * problem (what the parser's own `tmLsValidate` guard does), it collects EVERY problem in the sheet and
 * returns it as a structured list the panel can render and act on.
 *
 * Each issue carries `itemIds` — the `uuid`s of the offending page items — so the panel can ask the
 * host to select them in Illustrator (`tmSelectItemsById`), which is the whole point of the feature:
 * the user clicks an issue and Illustrator jumps to the artwork that caused it.
 *
 * Requires the `logosheet` domain in the same bundle: it reuses TM_LS (layer names), tmLsLayer,
 * tmLsContains and tmLsVisibleBounds rather than restating them (AGENTS.md §2.3 — no duplication).
 *
 * Entry point: tmLsvValidateLogosheet() → JSON string
 *   { success, error?, logs:[{level,where,message}],
 *     data?: { isValid, errors:[Issue], warnings:[Issue] } }
 *   Issue = { code, message, severity:'error'|'warning', details:{…}, itemIds:[uuid] }
 *
 * NOTE: validation never mutates the document (no ungrouping, no selection changes) — it only reads.
 */
export const logosheetValidatorCode = `
var TM_LSV_CODE = {
	NO_DOCUMENT: "NO_DOCUMENT",
	MISSING_LAYER: "MISSING_LAYER",
	INVALID_SET_LAYER_CONTENT: "INVALID_SET_LAYER_CONTENT",
	MISSING_TITLES_LAYER: "MISSING_TITLES_LAYER",
	INVALID_TITLES_LAYER_CONTENT: "INVALID_TITLES_LAYER_CONTENT",
	NO_ARTBOARDS: "NO_ARTBOARDS",
	INVALID_ARTBOARD_NAME: "INVALID_ARTBOARD_NAME",
	INVALID_COLORS_ARTBOARD_NAME: "INVALID_COLORS_ARTBOARD_NAME",
	MISSING_COLORS_ARTBOARD: "MISSING_COLORS_ARTBOARD",
	MISSING_LOGO_ARTBOARD: "MISSING_LOGO_ARTBOARD",
	UNGROUPED_LOGO: "UNGROUPED_LOGO",
	LOGO_OUTSIDE_BACKGROUND: "LOGO_OUTSIDE_BACKGROUND",
	MULTIPLE_LOGOS_IN_BACKGROUND: "MULTIPLE_LOGOS_IN_BACKGROUND",
	NO_SET_NAMES: "NO_SET_NAMES",
	SET_NAME_OUTSIDE_BACKGROUND: "SET_NAME_OUTSIDE_BACKGROUND",
	SET_NAME_NOT_IN_BACKGROUND: "SET_NAME_NOT_IN_BACKGROUND",
	OTHER_NO_SET_NAMES: "OTHER_NO_SET_NAMES",
	MISSING_BACKGROUND_COLOR: "MISSING_BACKGROUND_COLOR",
	INVALID_BACKGROUND_COLOR: "INVALID_BACKGROUND_COLOR",
	EMPTY_COLOR_NAME: "EMPTY_COLOR_NAME",
	MISSING_TEAM_COLORS_LAYER: "MISSING_TEAM_COLORS_LAYER",
	VALIDATION_ERROR: "VALIDATION_ERROR"
};

var TM_LSV_ROW_TOLERANCE = 10;

/* ---- issue helpers --------------------------------------------------------------------------- */

/* Build one issue record. itemIds are Illustrator uuids the panel can hand back to select the art. */
function tmLsvIssue(code, message, severity, details, itemIds) {
	return {
		code: code,
		message: message,
		severity: severity || "error",
		details: details || {},
		itemIds: itemIds || []
	};
}

/* A page item's uuid, or "" when the item type doesn't expose one (never throws). */
function tmLsvId(item) {
	try { return (item && item.uuid) ? String(item.uuid) : ""; } catch (e) { return ""; }
}

function tmLsvIds(items) {
	var out = [], id;
	for (var i = 0; i < items.length; i++) {
		id = tmLsvId(items[i]);
		if (id) out.push(id);
	}
	return out;
}

function tmLsvName(item) {
	try { return (item && item.name) ? String(item.name) : "Unnamed"; } catch (e) { return "Unnamed"; }
}

/* Join up to 4 item names for a message, so a long list never floods the 250px panel. */
function tmLsvNameList(items) {
	var names = [];
	for (var i = 0; i < items.length && i < 4; i++) names.push(tmLsvName(items[i]));
	if (items.length > 4) names.push("+" + (items.length - 4) + " more");
	return names.join(", ");
}

/* ---- layers ---------------------------------------------------------------------------------- */

/* The four layers the parser cannot work without, plus the "Set Names must be outlined" rule that the
   parser's fast guard also enforces (point text has no usable contents once exported). */
function tmLsvCheckLayers(doc, out) {
	var required = [TM_LS.LOGOS, TM_LS.SET_NAMES, TM_LS.COLOR_NAMES, TM_LS.BACKGROUND];
	for (var i = 0; i < required.length; i++) {
		if (!tmLsLayer(doc, required[i])) {
			out.errors.push(tmLsvIssue(
				TM_LSV_CODE.MISSING_LAYER,
				"Layer '" + required[i] + "' is required for this process but is not present in the document.",
				"error",
				{ layer: required[i] }
			));
		}
	}

	var setLayer = tmLsLayer(doc, TM_LS.SET_NAMES);
	if (!setLayer) return;
	var pointText = [];
	for (var t = 0; t < setLayer.textFrames.length; t++) {
		if (setLayer.textFrames[t].kind === TextType.POINTTEXT) pointText.push(setLayer.textFrames[t]);
	}
	if (pointText.length) {
		out.errors.push(tmLsvIssue(
			TM_LSV_CODE.INVALID_SET_LAYER_CONTENT,
			"The '" + TM_LS.SET_NAMES + "' layer cannot contain point-text objects (" + pointText.length + " found). Remove them, or convert them to outlines, and validate again.",
			"error",
			{ layer: TM_LS.SET_NAMES, count: pointText.length },
			tmLsvIds(pointText)
		));
	}
}

/* Titles hold the "ACTUAL SIZE" caption the parser reads for baseInfo. A missing Titles layer only
   costs that metadata (warning); non-text artwork parked on it is an error — it would be read as a
   caption. (Librarian reported a missing Titles layer as a missing LOGOS layer; that was wrong.) */
function tmLsvCheckTitlesLayer(doc, out) {
	var titles = tmLsLayer(doc, TM_LS.TITLES);
	if (!titles) {
		out.warnings.push(tmLsvIssue(
			TM_LSV_CODE.MISSING_TITLES_LAYER,
			"Layer '" + TM_LS.TITLES + "' was not found — base-size information will be skipped.",
			"warning",
			{ layer: TM_LS.TITLES }
		));
		return;
	}
	var bad = [];
	for (var i = 0; i < titles.pageItems.length; i++) {
		if (titles.pageItems[i].typename !== "TextFrame") bad.push(titles.pageItems[i]);
	}
	if (bad.length) {
		out.errors.push(tmLsvIssue(
			TM_LSV_CODE.INVALID_TITLES_LAYER_CONTENT,
			"The '" + TM_LS.TITLES + "' layer contains " + bad.length + " item(s) that are not text frames (" + tmLsvNameList(bad) + "). Only text frames are allowed.",
			"error",
			{ layer: TM_LS.TITLES, count: bad.length },
			tmLsvIds(bad)
		));
	}
}

/* ---- artboards ------------------------------------------------------------------------------- */

/* Every sheet needs exactly one "COLORS" artboard and at least one "LOGOS:<page>" artboard, and no
   name may contain "/" (artboard names become folder/file names on export). */
function tmLsvCheckArtboards(doc, out) {
	var artboards = doc.artboards;
	if (!artboards || artboards.length === 0) {
		out.errors.push(tmLsvIssue(TM_LSV_CODE.NO_ARTBOARDS, "No artboards found in the document.", "error"));
		return;
	}

	var hasColors = false, hasLogos = false, hasInvalidNames = false;
	for (var i = 0; i < artboards.length; i++) {
		var name = String(artboards[i].name);
		var lower = name.replace(/^\\s+|\\s+$/g, "").toLowerCase();

		if (name.indexOf("/") !== -1) {
			out.errors.push(tmLsvIssue(
				TM_LSV_CODE.INVALID_ARTBOARD_NAME,
				"Artboard '" + name + "' contains '/'. Artboard names cannot contain '/' characters.",
				"error",
				{ artboardName: name }
			));
			hasInvalidNames = true;
		}

		if (name === TM_LS.COLOR_ARTBOARD) {
			hasColors = true;
		} else if (lower.indexOf(TM_LS.COLOR_ARTBOARD.toLowerCase()) !== -1) {
			out.errors.push(tmLsvIssue(
				TM_LSV_CODE.INVALID_COLORS_ARTBOARD_NAME,
				"The colors artboard must be named exactly '" + TM_LS.COLOR_ARTBOARD + "'. Found '" + name + "'.",
				"error",
				{ artboardName: name }
			));
			hasInvalidNames = true;
		}

		if (lower.indexOf(TM_LS.LOGO_ARTBOARD.toLowerCase()) === 0) hasLogos = true;
	}

	/* A misspelt name already explains the missing artboard — don't report the same thing twice. */
	if (hasInvalidNames) return;

	if (!hasColors) {
		out.errors.push(tmLsvIssue(
			TM_LSV_CODE.MISSING_COLORS_ARTBOARD,
			"No artboard named exactly '" + TM_LS.COLOR_ARTBOARD + "' was found. This artboard holds the team colours.",
			"error"
		));
	}
	if (!hasLogos) {
		out.errors.push(tmLsvIssue(
			TM_LSV_CODE.MISSING_LOGO_ARTBOARD,
			"No artboard starting with '" + TM_LS.LOGO_ARTBOARD + "' was found. At least one is required.",
			"error"
		));
	}
}

/* ---- logo placement -------------------------------------------------------------------------- */

/* Every background cell on the Background layer, flattened out of any groups it was drawn in. The
   parser ungroups them before pairing; validation must NOT modify the document, so it walks instead —
   a group's union bounds would otherwise swallow several logos and fake a "multiple logos" error. */
function tmLsvBackgroundCells(bgLayer) {
	var cells = [];
	function walk(items) {
		for (var i = 0; i < items.length; i++) {
			if (items[i].typename === "GroupItem") walk(items[i].pageItems);
			else cells.push(items[i]);
		}
	}
	if (bgLayer) walk(bgLayer.pageItems);
	return cells;
}

/* The layer the logos actually live on — "new" when it holds artwork, else "Logos" (mirrors the
   parser's tmLsPairLogos, so validation judges exactly what the parser would read). */
function tmLsvLogoLayer(doc) {
	var newLayer = tmLsLayer(doc, TM_LS.NEW);
	if (newLayer && newLayer.pageItems.length > 0) return newLayer;
	return tmLsLayer(doc, TM_LS.LOGOS);
}

/* True for the item types the parser can export as a logo. Anything else (a loose path, a text frame)
   means the artwork was left ungrouped on the Logos layer. */
function tmLsvIsLogoItem(item) {
	var t = item.typename;
	return t === "GroupItem" || t === "RasterItem" || t === "PlacedItem" || t === "CompoundPathItem";
}

/* Each logo must be one grouped object sitting inside exactly one background cell, and no cell may
   hold two logos (the parser pairs one logo per cell — the second would be dropped silently). */
function tmLsvCheckLogoPlacement(doc, out, log) {
	var logoLayer = tmLsvLogoLayer(doc);
	var bgLayer = tmLsLayer(doc, TM_LS.BACKGROUND);
	if (!logoLayer || !bgLayer) return;

	var cells = tmLsvBackgroundCells(bgLayer);
	var logos = logoLayer.pageItems;
	var owners = [];

	for (var i = 0; i < logos.length; i++) {
		var logo = logos[i];

		if (!tmLsvIsLogoItem(logo)) {
			out.errors.push(tmLsvIssue(
				TM_LSV_CODE.UNGROUPED_LOGO,
				"'" + tmLsvName(logo) + "' on the '" + logoLayer.name + "' layer is a " + logo.typename + ", not a group. Group the logo artwork and validate again.",
				"error",
				{ logoName: tmLsvName(logo), logoType: logo.typename },
				tmLsvIds([logo])
			));
			continue;
		}

		var bounds;
		try { bounds = tmLsVisibleBounds(logo); } catch (e) { log("warn", "logoBounds", tmLsvName(logo) + ": " + e); continue; }

		var owner = -1;
		for (var c = 0; c < cells.length; c++) {
			if (tmLsContains(cells[c].geometricBounds, bounds)) { owner = c; break; }
		}

		if (owner === -1) {
			out.errors.push(tmLsvIssue(
				TM_LSV_CODE.LOGO_OUTSIDE_BACKGROUND,
				"'" + tmLsvName(logo) + "' is not inside any background rectangle.",
				"error",
				{ logoName: tmLsvName(logo) },
				tmLsvIds([logo])
			));
			continue;
		}

		if (!owners[owner]) owners[owner] = [];
		owners[owner].push(logo);
	}

	for (var o = 0; o < cells.length; o++) {
		if (!owners[o] || owners[o].length < 2) continue;
		out.errors.push(tmLsvIssue(
			TM_LSV_CODE.MULTIPLE_LOGOS_IN_BACKGROUND,
			owners[o].length + " logos share one background rectangle (" + tmLsvNameList(owners[o]) + "). Each background can hold only one logo.",
			"error",
			{ backgroundName: tmLsvName(cells[o]), logoCount: owners[o].length, logoNames: tmLsvNameList(owners[o]) },
			tmLsvIds(owners[o])
		));
	}
}

/* ---- set names ------------------------------------------------------------------------------- */

function tmLsvCheckSetNames(doc, out) {
	var setLayer = tmLsLayer(doc, TM_LS.SET_NAMES);
	if (!setLayer) return;
	if (setLayer.pageItems.length === 0) {
		/* A sheet whose only logo artboard is "LOGOS:Other" legitimately has an empty Set Names
		   layer (the parser exports those logos into the "OTHER" set automatically) — warn there
		   instead of blocking the parse with an error. */
		var onlyOther = true;
		for (var a = 0; a < doc.artboards.length; a++) {
			var an = String(doc.artboards[a].name);
			if (an === TM_LS.COLOR_ARTBOARD) continue;
			if (an.toLowerCase() !== "logos:other") { onlyOther = false; break; }
		}
		out[onlyOther ? "warnings" : "errors"].push(tmLsvIssue(
			TM_LSV_CODE.NO_SET_NAMES,
			"No set names found on the '" + TM_LS.SET_NAMES + "' layer." +
				(onlyOther ? " Expected here: only the 'LOGOS:Other' artboard is present." : ""),
			onlyOther ? "warning" : "error",
			{ layer: TM_LS.SET_NAMES }
		));
	}
}

/* ---- set-name positioning -------------------------------------------------------------------- */

/* True when item bounds overlap the artboard rect at all (both are [left, top, right, bottom]). */
function tmLsvOverlapsArtboard(itemBounds, abBounds) {
	return !(itemBounds[2] < abBounds[0] || itemBounds[0] > abBounds[2] ||
		itemBounds[3] > abBounds[1] || itemBounds[1] < abBounds[3]);
}

/* Group background cells into rows by their centre Y (a row = one set), each row sorted left→right
   and the rows themselves sorted top→bottom. */
function tmLsvGroupRows(cells) {
	var rows = [], i, j;
	for (i = 0; i < cells.length; i++) {
		var b = cells[i].geometricBounds;
		var cy = (b[1] + b[3]) / 2;
		var placed = false;
		for (j = 0; j < rows.length; j++) {
			if (Math.abs(cy - rows[j].y) <= TM_LSV_ROW_TOLERANCE) { rows[j].cells.push(cells[i]); placed = true; break; }
		}
		if (!placed) rows.push({ y: cy, cells: [cells[i]] });
	}
	rows.sort(function (a, b2) { return b2.y - a.y; });
	for (i = 0; i < rows.length; i++) {
		rows[i].cells.sort(function (a, b3) {
			return ((a.geometricBounds[0] + a.geometricBounds[2]) / 2) - ((b3.geometricBounds[0] + b3.geometricBounds[2]) / 2);
		});
	}
	return rows;
}

/* The set-name frame belonging to a row: the one nearest the row's centre X, with frames far above or
   below the row pushed back (ported from Librarian's findClosestTextFrameToRow). */
function tmLsvClosestSetName(frames, row) {
	if (!frames.length || !row.cells.length) return null;
	var total = 0, i;
	for (i = 0; i < row.cells.length; i++) {
		var cb = row.cells[i].geometricBounds;
		total += (cb[0] + cb[2]) / 2;
	}
	var rowCenterX = total / row.cells.length;

	var best = null, bestDistance = null;
	for (i = 0; i < frames.length; i++) {
		var fb = frames[i].geometricBounds;
		var dx = Math.abs(((fb[0] + fb[2]) / 2) - rowCenterX);
		var dy = Math.abs(((fb[1] + fb[3]) / 2) - row.y);
		var weighted = dx * (dy > 100 ? 2 : 1);
		if (bestDistance === null || weighted < bestDistance) { bestDistance = weighted; best = frames[i]; }
	}
	return best;
}

/* Each row's set name must sit inside its row's first background cell — a name that spills out of the
   cell is picked up by the wrong set (or by none) when the sheet is parsed. */
function tmLsvCheckSetNamePositioning(doc, out) {
	var setLayer = tmLsLayer(doc, TM_LS.SET_NAMES);
	var bgLayer = tmLsLayer(doc, TM_LS.BACKGROUND);
	if (!setLayer || !bgLayer) return;

	var frames = setLayer.textFrames;
	var cells = tmLsvBackgroundCells(bgLayer);

	for (var a = 0; a < doc.artboards.length; a++) {
		var artboard = doc.artboards[a];
		if (artboard.name === TM_LS.COLOR_ARTBOARD) continue;
		var abBounds = artboard.artboardRect;

		var abFrames = [], abCells = [], i;
		for (i = 0; i < frames.length; i++) {
			if (tmLsvOverlapsArtboard(frames[i].geometricBounds, abBounds)) abFrames.push(frames[i]);
		}
		for (i = 0; i < cells.length; i++) {
			if (tmLsvOverlapsArtboard(cells[i].geometricBounds, abBounds)) abCells.push(cells[i]);
		}
		if (!abCells.length) continue;

		/* The "LOGOS:Other" artboard is the designed exception: it carries NO set names — the parser
		   exports its logos into the "OTHER" set automatically. Matching its rows against set-name
		   frames would flood the report with misleading per-row messages, so surface one informational
		   warning instead and skip the row matching. */
		if (String(artboard.name).toLowerCase() === "logos:other") {
			out.warnings.push(tmLsvIssue(
				TM_LSV_CODE.OTHER_NO_SET_NAMES,
				"Artboard '" + artboard.name + "' has no set names — this is expected: its logos are exported into the 'OTHER' set automatically.",
				"warning",
				{ artboardName: String(artboard.name), logoCount: abCells.length }
			));
			continue;
		}

		var rows = tmLsvGroupRows(abCells);
		for (var r = 0; r < rows.length; r++) {
			var frame = tmLsvClosestSetName(abFrames, rows[r]);
			if (!frame) {
				out.warnings.push(tmLsvIssue(
					TM_LSV_CODE.SET_NAME_NOT_IN_BACKGROUND,
					"Row " + (r + 1) + " of artboard '" + artboard.name + "' has no set name near it.",
					"warning",
					{ artboardName: String(artboard.name), rowNumber: r + 1 }
				));
				continue;
			}
			var first = rows[r].cells[0];
			/* Top edge at or above the cell's top edge = the name is outside its background. */
			if (frame.geometricBounds[1] >= first.geometricBounds[1]) {
				out.errors.push(tmLsvIssue(
					TM_LSV_CODE.SET_NAME_OUTSIDE_BACKGROUND,
					"The set name in row " + (r + 1) + " of artboard '" + artboard.name + "' sits outside its background rectangle.",
					"error",
					{ artboardName: String(artboard.name), rowNumber: r + 1, textFrameName: tmLsvName(frame), backgroundName: tmLsvName(first) },
					tmLsvIds([frame])
				));
			}
		}
	}
}

/* ---- colours --------------------------------------------------------------------------------- */

/* The COLORS artboard's swatch rectangles must be filled with named spot colours — that fill IS the
   team colour the parser records, so a process/gradient fill or a nameless spot loses the colour. */
function tmLsvCheckColors(doc, out) {
	var tcLayer = tmLsLayer(doc, TM_LS.TEAM_COLORS);
	if (!tcLayer) {
		out.warnings.push(tmLsvIssue(
			TM_LSV_CODE.MISSING_TEAM_COLORS_LAYER,
			"Layer '" + TM_LS.TEAM_COLORS + "' was not found — team colours will be read from the background cells instead.",
			"warning",
			{ layer: TM_LS.TEAM_COLORS }
		));
		return;
	}

	var items = tcLayer.pageItems;
	for (var i = 0; i < items.length; i++) {
		var item = items[i];
		if (item.typename !== "PathItem") continue;
		var name = tmLsvName(item);

		if (!item.fillColor || item.fillColor.typename === "NoColor") {
			out.errors.push(tmLsvIssue(
				TM_LSV_CODE.MISSING_BACKGROUND_COLOR,
				"Colour swatch '" + name + "' has no fill colour.",
				"error",
				{ objectName: name },
				tmLsvIds([item])
			));
			continue;
		}

		if (item.fillColor.typename !== "SpotColor") {
			out.errors.push(tmLsvIssue(
				TM_LSV_CODE.INVALID_BACKGROUND_COLOR,
				"Colour swatch '" + name + "' must use a spot colour. Found " + item.fillColor.typename + ".",
				"error",
				{ objectName: name, colorType: String(item.fillColor.typename) },
				tmLsvIds([item])
			));
			continue;
		}

		var swatchName = "";
		try { swatchName = String(item.fillColor.spot.name || ""); } catch (e) { swatchName = ""; }
		if (!swatchName.replace(/^\\s+|\\s+$/g, "")) {
			out.warnings.push(tmLsvIssue(
				TM_LSV_CODE.EMPTY_COLOR_NAME,
				"Colour swatch '" + name + "' uses a spot colour with no name.",
				"warning",
				{ objectName: name },
				tmLsvIds([item])
			));
		}
	}
}

/* ---- entry point ----------------------------------------------------------------------------- */

/* Run every check against the active document. One failing check never aborts the rest — its own
   failure is reported as a VALIDATION_ERROR issue so the user still sees everything else. */
function tmLsvValidateLogosheet() {
	var logs = [];
	function log(level, where, message) { logs.push({ level: level, where: where, message: String(message) }); }

	var out = { errors: [], warnings: [] };

	try {
		if (!app.documents.length) {
			return JSON.stringify({
				success: true, logs: logs,
				data: { isValid: false, errors: [tmLsvIssue(TM_LSV_CODE.NO_DOCUMENT, "No active document found.", "error")], warnings: [] }
			});
		}
		var doc = app.activeDocument;

		var checks = [
			{ name: "layers", run: tmLsvCheckLayers },
			{ name: "titles", run: tmLsvCheckTitlesLayer },
			{ name: "artboards", run: tmLsvCheckArtboards },
			{ name: "setNames", run: tmLsvCheckSetNames },
			{ name: "colors", run: tmLsvCheckColors }
		];
		for (var i = 0; i < checks.length; i++) {
			try { checks[i].run(doc, out); }
			catch (eCheck) {
				log("error", checks[i].name, eCheck);
				out.errors.push(tmLsvIssue(TM_LSV_CODE.VALIDATION_ERROR, "The '" + checks[i].name + "' check could not be completed: " + ((eCheck && eCheck.message) ? eCheck.message : String(eCheck)), "error", { check: checks[i].name }));
			}
		}

		/* Geometry checks need the log channel for unreadable artwork, so they run separately. */
		try { tmLsvCheckLogoPlacement(doc, out, log); }
		catch (ePlace) {
			log("error", "logoPlacement", ePlace);
			out.errors.push(tmLsvIssue(TM_LSV_CODE.VALIDATION_ERROR, "The logo-placement check could not be completed: " + ((ePlace && ePlace.message) ? ePlace.message : String(ePlace)), "error", { check: "logoPlacement" }));
		}
		try { tmLsvCheckSetNamePositioning(doc, out); }
		catch (ePos) {
			log("error", "setNamePositioning", ePos);
			out.errors.push(tmLsvIssue(TM_LSV_CODE.VALIDATION_ERROR, "The set-name positioning check could not be completed: " + ((ePos && ePos.message) ? ePos.message : String(ePos)), "error", { check: "setNamePositioning" }));
		}

		log("info", "validate", doc.name + ": " + out.errors.length + " error(s), " + out.warnings.length + " warning(s)");

		return JSON.stringify({
			success: true,
			logs: logs,
			data: { isValid: out.errors.length === 0, errors: out.errors, warnings: out.warnings }
		});
	} catch (e) {
		return JSON.stringify({ success: false, error: (e && e.message) ? e.message : String(e), logs: logs });
	}
}
`
