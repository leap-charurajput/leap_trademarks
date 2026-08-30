/*
 * ExtendScript that BUILDS a logosheet from uploaded SVG logos (the reverse of the parser). It creates a
 * new CMYK document laid out as the standard logosheet so it round-trips through tmLsParseLogosheet:
 *   - layers: Logos, Background, Set Names, Color Names
 *   - one artboard "LOGOS:<sheet>", rows = sets, columns = backgrounds (TC1…TCN / Dark / Light)
 *   - team-colour columns use "$TC<n>" SPOT swatches, each a visibly distinct CMYK so the designer can
 *     tell them apart and set the real values later; Dark/Light use the standard greys.
 *   - each assigned SVG is placed + embedded (becomes editable vector) and fitted into its cell (5pt margin).
 *
 * args = {
 *   sheetName,
 *   columns: [{ token, label, kind:'tc'|'dark'|'light', index? }],
 *   sets:    [{ name, cells: { <token>: <svgDiskPath> } }]
 * }
 * Returns JSON { success, data:{ placed, missing, artboard }, error? }.
 * ES3 only (var, no const/let/arrow).
 */
export const logosheetBuilderCode = `
/* Distinct CMYK palette for the $TC swatches (cycled by team-colour index). */
var TM_BLD_PALETTE = [
	{ C: 75, M: 65, Y: 0, K: 0 },
	{ C: 0, M: 90, Y: 85, K: 0 },
	{ C: 80, M: 0, Y: 80, K: 0 },
	{ C: 0, M: 45, Y: 90, K: 0 },
	{ C: 65, M: 0, Y: 15, K: 0 },
	{ C: 35, M: 80, Y: 0, K: 0 },
	{ C: 0, M: 20, Y: 95, K: 0 },
	{ C: 50, M: 50, Y: 50, K: 10 }
];

function tmBldCmyk(c, m, y, k) {
	var col = new CMYKColor();
	col.cyan = c; col.magenta = m; col.yellow = y; col.black = k;
	return col;
}

/* A SpotColor named "$TC<n>" (created once), with a distinct base CMYK from the palette. */
function tmBldTeamSwatch(doc, n) {
	var name = "$TC" + n;
	var spot;
	try { spot = doc.spots.getByName(name); }
	catch (e) {
		var p = TM_BLD_PALETTE[(n - 1) % TM_BLD_PALETTE.length];
		spot = doc.spots.add();
		spot.name = name;
		spot.colorType = ColorModel.SPOT;
		spot.color = tmBldCmyk(p.C, p.M, p.Y, p.K);
	}
	var sc = new SpotColor();
	sc.spot = spot;
	sc.tint = 100;
	return sc;
}

/* Place an SVG as editable VECTOR (placedItems can't take SVG). Opens the SVG as its own document,
   copies its artwork, and pastes it onto the Logos layer of the target document. Returns the pasted
   item (grouped), or null on failure. */
function tmBldPlaceSvg(doc, logoLayer, f) {
	var svgDoc = null;
	try {
		svgDoc = app.open(f);
		app.executeMenuCommand("selectall");
		if (!app.selection || app.selection.length === 0) { return null; }
		app.executeMenuCommand("copy");
		app.activeDocument = doc;
		doc.activeLayer = logoLayer;
		app.executeMenuCommand("paste");
		if (!app.selection || app.selection.length === 0) return null;
		if (app.selection.length > 1) app.executeMenuCommand("group");
		return app.selection[0];
	} catch (e) {
		return null;
	} finally {
		try { if (svgDoc) svgDoc.close(SaveOptions.DONOTSAVECHANGES); } catch (eC) {}
		try { app.activeDocument = doc; } catch (eD) {}
	}
}

/* Fill colour for a column: $TC<n> spot for team colours, fixed greys for dark/light. */
function tmBldColumnColor(doc, col) {
	if (col.kind === "dark") return tmBldCmyk(0, 0, 0, 60);
	if (col.kind === "light") return tmBldCmyk(0, 0, 0, 18);
	var idx = col.index || 1;
	return tmBldTeamSwatch(doc, idx);
}

/* Remove every swatch except [None], [Registration] and the $TC swatches (clears the default palette +
   any swatches the pasted SVGs dragged in). */
function tmBldRemoveUnusedSwatches(doc) {
	try {
		var sw = doc.swatches;
		for (var i = sw.length - 1; i >= 0; i--) {
			try {
				var nm = sw[i].name;
				if (nm === "[None]" || nm === "[Registration]") continue;
				if (nm.indexOf("$TC") === 0) continue;
				sw[i].remove();
			} catch (e) {}
		}
		try { var g = doc.swatchGroups; for (var k = g.length - 1; k >= 1; k--) { try { g[k].remove(); } catch (eg) {} } } catch (eG) {}
	} catch (e) {}
}

function tmCreateLogosheet(args) {
	var logs = [];
	function log(where, message) { logs.push("[" + where + "] " + String(message)); }
	function fail(error) { return JSON.stringify({ success: false, error: String(error), logs: logs }); }

	try {
		if (!args || !args.logoTypes || !args.logoTypes.length) return fail("No logo types defined.");
		log("args", "logoTypes=" + args.logoTypes.length);

		var doc;
		try { doc = app.documents.add(DocumentColorSpace.CMYK); }
		catch (eAdd) { log("doc", "add(CMYK) failed, falling back: " + eAdd); doc = app.documents.add(); }
		try { doc.swatches.removeAll(); } catch (eRm) {}

		/* Layers (z-order top→bottom: Logos, Color Names, Set Names, Background). */
		var bgLayer = doc.layers[0]; bgLayer.name = "Background";
		var setLayer = doc.layers.add(); setLayer.name = "Set Names";
		var colLayer = doc.layers.add(); colLayer.name = "Color Names";
		var logoLayer = doc.layers.add(); logoLayer.name = "Logos";
		log("layers", "Background / Set Names / Color Names / Logos");

		var labelW = 150, headerH = 48, cellW = 200, cellH = 200, gap = 12, pad = 5, typeGap = 80;
		var placed = 0, missing = 0, artboardCount = 0;
		var yCursor = 0; /* top y of the next logo type's region (goes negative downward) */

		for (var lt = 0; lt < args.logoTypes.length; lt++) {
			var type = args.logoTypes[lt];
			var cols = type.columns || [], sets = type.sets || [];
			if (!cols.length || !sets.length) { log("type", (type.name || lt) + ": skipped (no columns/sets)"); continue; }
			var typeTop = yCursor;

			/* Column header labels for this type — horizontal, centred over their column. */
			for (var c = 0; c < cols.length; c++) {
				try {
					var colLeft = labelW + c * (cellW + gap);
					var cn = colLayer.textFrames.add();
					cn.contents = String(cols[c].label || cols[c].token);
					try { cn.textRange.characterAttributes.size = 14; } catch (eS) {}
					cn.left = colLeft + (cellW - cn.width) / 2;
					cn.top = typeTop - (headerH - cn.height) / 2;
				} catch (eCol) { log("colHeader", cols[c].token + ": " + eCol); }
			}

			for (var r = 0; r < sets.length; r++) {
				var set = sets[r];
				var rowTop = typeTop - headerH - r * (cellH + gap);

				/* Set-name AREA text (parser rejects point text on Set Names): VERTICAL, next to the row. */
				try {
					var snRect = setLayer.pathItems.rectangle(0, 0, cellH - 30, 28);
					var sn = setLayer.textFrames.areaText(snRect);
					sn.contents = String(set.name || ("Set " + (r + 1)));
					try { sn.textRange.characterAttributes.size = 13; } catch (eS2) {}
					try { sn.textRange.paragraphAttributes.justification = Justification.CENTER; } catch (eJ) {}
					sn.rotate(90);
					sn.left = labelW - sn.width - 6;
					sn.top = rowTop - (cellH - sn.height) / 2;
				} catch (eSn) { log("setName", (set.name || r) + ": " + eSn); }

				for (var c2 = 0; c2 < cols.length; c2++) {
					var col = cols[c2];
					var cellLeft = labelW + c2 * (cellW + gap);
					var cellTop = rowTop;

					try {
						var rect = bgLayer.pathItems.rectangle(cellTop, cellLeft, cellW, cellH);
						rect.fillColor = tmBldColumnColor(doc, col);
						rect.stroked = false;
					} catch (eBg) { log("bgRect", set.name + "/" + col.token + ": " + eBg); }

					var path = set.cells ? set.cells[col.token] : null;
					if (!path) continue;
					var f = new File(path);
					if (!f.exists) { log("placeLogo", "MISSING file: " + path); missing++; continue; }
					try {
						app.selection = null;
						var logo = tmBldPlaceSvg(doc, logoLayer, f);
						if (!logo) { log("placeLogo", type.name + "/" + set.name + "/" + col.token + " could not open/paste: " + path); missing++; continue; }
						var scale = Math.min((cellW - 2 * pad) / logo.width, (cellH - 2 * pad) / logo.height);
						if (scale > 0 && isFinite(scale)) { logo.width = logo.width * scale; logo.height = logo.height * scale; }
						logo.left = cellLeft + (cellW - logo.width) / 2;
						logo.top = cellTop - (cellH - logo.height) / 2;
						placed++;
					} catch (ePlace) { log("placeLogo", type.name + "/" + set.name + "/" + col.token + " ERROR: " + ePlace); missing++; }
				}
			}

			/* One artboard per logo type: LOGOS:<type>. The first uses the default artboard, rest are added. */
			var typeW = labelW + cols.length * (cellW + gap);
			var typeH = headerH + sets.length * (cellH + gap);
			var abRect = [0, typeTop, typeW, typeTop - typeH];
			var ab;
			if (artboardCount === 0) { ab = doc.artboards[0]; ab.artboardRect = abRect; }
			else { ab = doc.artboards.add(abRect); }
			ab.name = "LOGOS:" + String(type.name || ("Type " + (lt + 1)));
			artboardCount++;
			log("artboard", ab.name + " " + typeW + "x" + typeH);

			yCursor = typeTop - typeH - typeGap;
		}

		tmBldRemoveUnusedSwatches(doc);
		log("done", "placed=" + placed + " missing=" + missing + " artboards=" + artboardCount);
		app.selection = null;
		return JSON.stringify({ success: true, logs: logs, data: { placed: placed, missing: missing, artboards: artboardCount } });
	} catch (e) {
		log("fatal", (e && e.message) ? e.message : String(e));
		return fail((e && e.message) ? e.message : String(e));
	}
}
`
