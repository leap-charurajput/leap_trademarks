/*
 * ExtendScript for logosheet parsing (Illustrator DOM — genuinely requires ExtendScript). This is a
 * clean ES3 rewrite of the legacy `logoSheetParser.jsx`, preserving the proven geometry algorithm
 * (an item belongs to a container when the container's bounds strictly enclose the item's bounds) but
 * restructured into small named helpers, with NO alert()s — every recoverable problem is pushed to a
 * structured `logs` array and returned to the panel, and per-logo export failures are isolated so one
 * bad logo never aborts the whole run.
 *
 * Layout of a logosheet (layers): Logos (or "new"), Background, Set Names, Color Names, Titles, Rules,
 * Logo Codes, Center. Artboards named "LOGOS:<page>" hold the laid-out logos; each logo sits on a
 * background rectangle; Set Names text marks a vertical band (the set), Color Names text marks a
 * horizontal band (TC1/TC2/dkbgnd/ltbgnd).
 *
 * Entry point: tmLsParseLogosheet({ league, teamCode, basePath }) → JSON string
 *   { success, error?, logs:[{level,where,message}], data?:{ isLogosInNewLayer, exportedCount,
 *     teamColors:[…], logoColors:[…], customColors:[…], logoSets:[{ name, SetNameDesign, order, rules,
 *     logoVersions:[{ fileNameAI, fileNamePNG, fileNameSVG, type, persistantCode, logoColors:[…],
 *     baseInfo, centerLogoInfo }] }] } }
 *
 * Files are written to <basePath>/LOGOS/<League>/<TeamCode>/{ai,png,svg}/.
 */
export const logosheetCode = `
var TM_LS = {
	TITLES: "Titles",
	NEW: "new",
	LOGOS: "Logos",
	SET_NAMES: "Set Names",
	COLOR_NAMES: "Color Names",
	BACKGROUND: "Background",
	LOGO_ARTBOARD: "LOGOS:",
	COLOR_ARTBOARD: "COLORS",
	TEAM_COLORS: "Team Colors",
	LOGO_CODES: "Logo Codes",
	CENTER: "Center",
	RULES: "Rules"
};

var TM_LS_TYPE_LABEL = { ltbgnd: "White", dkbgnd: "Black" };

/* Map a Color-Names text (spaces removed, lowercased) to a logo token. Supports any number of team
   colours: "Team Color 1" -> TC1, "Team Color 7" -> TC7, plus the dark / light backgrounds. */
function tmLsColorTypeFor(key) {
	if (key === "darkcolor") return "dkbgnd";
	if (key === "lightcolor") return "ltbgnd";
	var m = key.match(/^teamcolor(\\d+)$/);
	if (m) return "TC" + m[1];
	return "";
}

/* ---- small helpers --------------------------------------------------------------------------- */

/* True when frame bounds [left,top,right,bottom] strictly enclose item bounds (the layout rule). */
function tmLsContains(frame, item) {
	return !!frame && frame[0] < item[0] && frame[1] > item[1] && frame[2] > item[2] && frame[3] < item[3];
}

function tmLsTruncate(n, digits) {
	n = n * Math.pow(10, digits);
	n = n - (n % 1);
	return n * Math.pow(10, -digits);
}

/* ES3-safe array membership test (Array.prototype.indexOf isn't guaranteed in old ExtendScript). */
function tmLsInArray(arr, v) {
	for (var i = 0; i < arr.length; i++) { if (arr[i] === v) return true; }
	return false;
}

/* True when the centre of bounds b [left,top,right,bottom] falls inside frame fb. */
function tmLsCenterIn(fb, b) {
	var cx = (b[0] + b[2]) / 2, cy = (b[1] + b[3]) / 2;
	return cx > fb[0] && cx < fb[2] && cy < fb[1] && cy > fb[3];
}

/* The colour token (TC1…TCN / dkbgnd / ltbgnd) for a background cell, from the Color-Names header that
   sits above its column. snItem is the set-name frame (its width tunes the horizontal overlap test). */
function tmLsBgColorType(bg, fb, colorNames, snItem) {
	var bgLeft = bg.geometricBounds[0] - fb[0];
	for (var t = 0; t < colorNames.length; t++) {
		var ct = colorNames[t];
		if (!tmLsContains(fb, ct.geometricBounds)) continue;
		var ctLeft = ct.left - fb[0];
		if (bgLeft < ctLeft && bgLeft + bg.width > ctLeft + snItem.width) {
			var tn = String(ct.contents).replace(/^\\s+|\\s+$/g, "");
			if (tn) return tmLsColorTypeFor(tn.toLowerCase().replace(/\\s/gi, ""));
		}
	}
	return "";
}

function tmLsComponentToHex(c) {
	c = Math.round(c);
	if (c < 0) c = 0; if (c > 255) c = 255;
	var hex = c.toString(16);
	return hex.length === 1 ? "0" + hex : hex;
}

function tmLsCmykToRgbHex(cmyk) {
	var c = cmyk.cyan / 100, m = cmyk.magenta / 100, y = cmyk.yellow / 100, k = cmyk.black / 100;
	var r = (1 - Math.min(1, c * (1 - k) + k)) * 255;
	var g = (1 - Math.min(1, m * (1 - k) + k)) * 255;
	var b = (1 - Math.min(1, y * (1 - k) + k)) * 255;
	return { R: Math.round(r), G: Math.round(g), B: Math.round(b), Hex: "#" + tmLsComponentToHex(r) + tmLsComponentToHex(g) + tmLsComponentToHex(b) };
}

/* Safe layer lookup; returns null instead of throwing. */
function tmLsLayer(doc, name) {
	try { return doc.layers.getByName(name); } catch (e) { return null; }
}

/* Visible bounds of an object, resolving clipped groups (ported getVisibleBounds). */
function tmLsVisibleBounds(object) {
	if (object.typename !== "GroupItem") return object.geometricBounds;
	if (object.clipped) {
		var clippedItem = null, i, curItem;
		for (i = 0; i < object.pageItems.length; i++) {
			curItem = object.pageItems[i];
			if (curItem.clipping) { clippedItem = curItem; break; }
			if (curItem.typename === "CompoundPathItem" && curItem.pathItems.length && curItem.pathItems[0].clipping) { clippedItem = curItem; break; }
			if (curItem.typename !== "CompoundPathItem") { clippedItem = curItem; break; }
		}
		return clippedItem ? clippedItem.geometricBounds : object.geometricBounds;
	}
	var pts = [[], [], [], []], sub;
	for (var j = 0; j < object.pageItems.length; j++) {
		sub = tmLsVisibleBounds(object.pageItems[j]);
		pts[0].push(sub[0]); pts[1].push(sub[1]); pts[2].push(sub[2]); pts[3].push(sub[3]);
	}
	return [Math.min.apply(Math, pts[0]), Math.max.apply(Math, pts[1]), Math.max.apply(Math, pts[2]), Math.min.apply(Math, pts[3])];
}

/* ---- validation ------------------------------------------------------------------------------ */

function tmLsValidate(doc) {
	if (!tmLsLayer(doc, TM_LS.LOGOS)) return "Layer 'Logos' is required but is not present in the document.";
	var setLayer = tmLsLayer(doc, TM_LS.SET_NAMES);
	if (!setLayer) return "Layer 'Set Names' is required but is not present in the document.";
	for (var i = 0; i < setLayer.textFrames.length; i++) {
		if (setLayer.textFrames[i].kind === TextType.POINTTEXT) {
			return "The 'Set Names' layer cannot contain point-text objects. Convert them to outlines and parse again.";
		}
	}
	if (!tmLsLayer(doc, TM_LS.COLOR_NAMES)) return "Layer 'Color Names' is required but is not present in the document.";
	if (!tmLsLayer(doc, TM_LS.BACKGROUND)) return "Layer 'Background' is required but is not present in the document.";
	for (var a = 0; a < doc.artboards.length; a++) {
		if (doc.artboards[a].name.indexOf("/") !== -1) return "'/' is not allowed in artboard names (" + doc.artboards[a].name + ").";
	}
	return null;
}

/* ---- pairing: each logo to its background rectangle ------------------------------------------ */

/* Ungroup the Background layer's groups so each background rectangle is a direct page item. */
function tmLsUngroupBackground(doc, log) {
	var bgLayer = tmLsLayer(doc, TM_LS.BACKGROUND);
	if (!bgLayer) return null;
	try {
		app.selection = null;
		if (bgLayer.locked) bgLayer.locked = false;
		var groups = bgLayer.groupItems, g;
		for (g = 0; g < groups.length; g++) { groups[g].locked = false; groups[g].selected = true; }
		if (groups.length) { app.executeMenuCommand("ungroup"); }
		app.selection = null;
	} catch (e) { log("warn", "ungroupBackground", e); }
	return bgLayer;
}

/* The "graphics" of a logo: the non-clip child when the logo is a clip group, else the logo itself. */
function tmLsGraphicsOf(logo) {
	if (logo.typename === "CompoundPathItem") return { graphics: logo, isClip: false };
	var isClip = false, gi = logo.groupItems, cg;
	if (gi) { for (cg = 0; cg < gi.length; cg++) { if (gi[cg].clipped) { isClip = true; break; } } }
	if (!isClip) return { graphics: logo, isClip: false };
	var cp = logo.pageItems;
	for (var x = 0; x < cp.length; x++) { if (cp[x].clipped === false) return { graphics: cp[x], isClip: true }; }
	return { graphics: logo, isClip: true };
}

/* Pair every logo on the Logos/new layer with the Background rectangle that encloses it. */
function tmLsPairLogos(doc, log) {
	var logoLayer = tmLsLayer(doc, TM_LS.NEW);
	var inNew = false;
	if (logoLayer && logoLayer.pageItems.length > 0) { inNew = true; }
	else { logoLayer = tmLsLayer(doc, TM_LS.LOGOS); }
	if (!logoLayer) { log("error", "pairLogos", "No Logos layer"); return { inNew: false, items: [] }; }

	var bgLayer = tmLsUngroupBackground(doc, log);
	var backgrounds = bgLayer ? bgLayer.pageItems : [];
	var logoCodes = [];
	var codeLayer = tmLsLayer(doc, TM_LS.LOGO_CODES);
	if (codeLayer) logoCodes = codeLayer.textFrames;

	var logos = logoLayer.pageItems;
	var remainBg = [];
	for (var r = 0; r < backgrounds.length; r++) { if (backgrounds[r].locked) backgrounds[r].locked = false; remainBg.push(backgrounds[r]); }

	var items = [];
	for (var i = 0; i < logos.length; i++) {
		var logo = logos[i];
		var gr = tmLsGraphicsOf(logo);
		var gBounds = tmLsVisibleBounds(gr.graphics);
		var info = { logo: logo, background: null, colorType: "", isClip: gr.isClip, logoCode: null };
		var keep = [];
		for (var b = 0; b < remainBg.length; b++) {
			var fb = remainBg[b].geometricBounds;
			if (tmLsContains(fb, gBounds) && !info.background) {
				info.background = remainBg[b];
				for (var c = 0; c < logoCodes.length; c++) {
					var lcB = logoCodes[c].geometricBounds;
					if (fb[0] < lcB[0] && fb[1] * 1.1 > lcB[1] && fb[2] * 1.1 > lcB[2] && fb[3] * 1.1 < lcB[3]) info.logoCode = logoCodes[c];
				}
			} else {
				keep.push(remainBg[b]);
			}
		}
		remainBg = keep;
		items.push(info);
	}
	/* Keep the full background list (incl. empty cells) so single-logo sets can learn every colour
	   column drawn in their row. */
	var bgItems = [];
	for (var z = 0; z < backgrounds.length; z++) bgItems.push(backgrounds[z]);
	var withBg = 0;
	for (var w = 0; w < items.length; w++) { if (items[w].background) withBg++; }
	log("info", "pairLogos", "layer=" + (inNew ? "new" : "Logos") + " logos=" + items.length + " (withBackground=" + withBg + ") backgroundCells=" + bgItems.length);
	return { inNew: inNew, items: items, backgrounds: bgItems };
}

/* ---- pages: assign paired logos to artboards / sets / colour types --------------------------- */

function tmLsBaseInfoFromTitle(title) {
	var parts = String(title).split("\\r");
	if (parts.length !== 3) return null;
	var t = parts[2].replace(/ACTUAL SIZE: /i, "");
	if (t === "N/A") return null;
	var m = t.match(/[\\d\\.]+/);
	if (!m) return null;
	return { baseSize: m.toString(), baseSizeDirection: t.toLowerCase().indexOf("wide") !== -1 ? "WIDE" : "HIGH" };
}

function tmLsCenterInfo(centerItems) {
	if (!centerItems || centerItems.length !== 2) {
		return { CenterShiftFromLeft: "NO", CenterShiftFromLeftValue: "NA", CenterShiftFromTop: "NO", CenterShiftFromTopValue: "NA" };
	}
	var centerItem = centerItems[0].name.toLowerCase() === "center" ? centerItems[0] : centerItems[1];
	var logoItem = centerItems[0].name.toLowerCase() === "center" ? centerItems[1] : centerItems[0];
	var cx = centerItem.position[0] + centerItem.width / 2;
	var cy = centerItem.position[1] * -1 + centerItem.height / 2;
	var sx = tmLsTruncate(Math.abs((cx - logoItem.position[0]) / logoItem.width), 2);
	var sy = tmLsTruncate(Math.abs((cy - logoItem.position[1] * -1) / logoItem.height), 2);
	return {
		CenterShiftFromLeft: sx === 0.5 ? "NO" : "YES", CenterShiftFromLeftValue: sx,
		CenterShiftFromTop: sy === 0.5 ? "NO" : "YES", CenterShiftFromTopValue: sy
	};
}

/* Build the page to set to logo tree from the paired logos and the document's text layers.
   allBackgrounds is every background cell (incl. empty ones) so a single-logo set can record which
   colour columns it serves (the auto-generate-versions case). */
function tmLsBuildPages(doc, paired, allBackgrounds, log) {
	var art = doc.artboards;
	var setLayer = tmLsLayer(doc, TM_LS.SET_NAMES);
	var remainSetNames = [];
	if (setLayer) { for (var s0 = 0; s0 < setLayer.pageItems.length; s0++) remainSetNames.push(setLayer.pageItems[s0]); }
	var colorLayer = tmLsLayer(doc, TM_LS.COLOR_NAMES);
	var colorNames = colorLayer ? colorLayer.pageItems : [];
	var titleLayer = tmLsLayer(doc, TM_LS.TITLES);
	var titles = titleLayer ? titleLayer.textFrames : [];
	var rulesLayer = tmLsLayer(doc, TM_LS.RULES);
	var rules = rulesLayer ? rulesLayer.textFrames : [];
	var centerLayer = tmLsLayer(doc, TM_LS.CENTER);

	var remain = paired;
	var pages = [];
	for (var a = 0; a < art.length; a++) {
		var an = art[a].name;
		if (an.toLowerCase().indexOf(TM_LS.LOGO_ARTBOARD.toLowerCase()) === -1) continue;
		var fb = art[a].artboardRect;
		var pageName = an.split(TM_LS.LOGO_ARTBOARD)[1];
		pageName = pageName ? pageName.replace(/^\\s+|\\s+$/g, "") : "";
		var page = { pageName: pageName, order: a + 1, title: "", rules: "", centerLogoItems: [], allSets: [] };

		/* Center items inside this artboard. */
		if (centerLayer) {
			try {
				var ci = centerLayer.pageItems;
				for (var c = 0; c < ci.length; c++) { if (tmLsContains(fb, ci[c].geometricBounds)) page.centerLogoItems.push(ci[c]); }
			} catch (e) { log("warn", "centerItems", e); }
		}
		/* Title + rules text in this artboard. */
		for (var ti = 0; ti < titles.length; ti++) { if (tmLsContains(fb, titles[ti].geometricBounds)) page.title = titles[ti].contents; }
		for (var ri = 0; ri < rules.length; ri++) { if (tmLsContains(fb, rules[ri].geometricBounds)) page.rules = rules[ri].contents; }

		/* Set-name text frames in this artboard (others carried to the next artboard). */
		var setsHere = [], keepSets = [];
		for (var sn = 0; sn < remainSetNames.length; sn++) {
			if (tmLsContains(fb, remainSetNames[sn].geometricBounds)) setsHere.push(remainSetNames[sn]); else keepSets.push(remainSetNames[sn]);
		}
		remainSetNames = keepSets;

		if (an.toLowerCase() !== "logos:other") {
			for (var s = 0; s < setsHere.length; s++) {
				var snItem = setsHere[s];
				var sname = String(snItem.contents).replace(/^\\s+|\\s+$/g, "");
				var snTop = fb[1] - snItem.geometricBounds[1];
				var set = { setName: sname, logos: [] };
				for (var i = 0; i < remain.length; i++) {
					var bg = remain[i].background; if (!bg) continue;
					var lb = remain[i].logo.geometricBounds;
					if (!tmLsContains(fb, lb)) continue;
					var bgTop = fb[1] - bg.geometricBounds[1];
					if (bgTop < snTop && bgTop + bg.height > snTop + snItem.height) {
						remain[i].logo.name = pageName + " " + sname;
						bg.name = pageName + " " + sname;
						remain[i].colorType = tmLsBgColorType(bg, fb, colorNames, snItem);
						set.logos.push(remain[i]);
					}
				}
				/* Decide each logo's colour coverage (the "Backgrounds" list written to the JSON). The
				   designer places a logo only where the artwork changes and leaves a cell empty to mean
				   "same logo as the column to my left". So we walk every cell in the row left-to-right and
				   give each placed logo its own column plus all following empty columns until the next
				   logo. Example: a logo at TC2 with TC3/Dark/Light empty → ["TC2","TC3","dkbgnd","ltbgnd"]. */
				var cells = [];
				for (var ab = 0; ab < allBackgrounds.length; ab++) {
					var abg = allBackgrounds[ab];
					if (!tmLsCenterIn(fb, abg.geometricBounds)) continue;
					var abgTop = fb[1] - abg.geometricBounds[1];
					if (!(abgTop < snTop && abgTop + abg.height > snTop + snItem.height)) continue;
					var owner = null;
					for (var li = 0; li < set.logos.length; li++) { if (set.logos[li].background === abg) { owner = set.logos[li]; break; } }
					cells.push({ x: abg.geometricBounds[0], colorType: tmLsBgColorType(abg, fb, colorNames, snItem), logo: owner });
				}
				cells.sort(function (a, b) { return a.x - b.x; });
				for (var lz = 0; lz < set.logos.length; lz++) set.logos[lz].backgrounds = [];
				var current = null;
				var leading = [];
				for (var ci = 0; ci < cells.length; ci++) {
					var cell = cells[ci];
					if (cell.logo) current = cell.logo;
					if (!cell.colorType) continue;
					if (current) { if (!tmLsInArray(current.backgrounds, cell.colorType)) current.backgrounds.push(cell.colorType); }
					else { leading.push(cell.colorType); }
				}
				/* Empty cells before the very first logo attach to that first logo. */
				if (leading.length) {
					var firstLogo = null;
					for (var ck = 0; ck < cells.length; ck++) { if (cells[ck].logo) { firstLogo = cells[ck].logo; break; } }
					if (firstLogo) {
						var merged = [];
						for (var le = 0; le < leading.length; le++) { if (!tmLsInArray(merged, leading[le])) merged.push(leading[le]); }
						for (var ex = 0; ex < firstLogo.backgrounds.length; ex++) { if (!tmLsInArray(merged, firstLogo.backgrounds[ex])) merged.push(firstLogo.backgrounds[ex]); }
						firstLogo.backgrounds = merged;
					}
				}
				/* Fallback: any logo still without columns gets its own. */
				for (var lf = 0; lf < set.logos.length; lf++) { if (!set.logos[lf].backgrounds.length && set.logos[lf].colorType) set.logos[lf].backgrounds = [set.logos[lf].colorType]; }
				/* Concise per-row log: logo count + each logo's colour coverage. */
				var dbgCov = "";
				for (var ld = 0; ld < set.logos.length; ld++) { dbgCov += "[" + set.logos[ld].backgrounds.join(",") + "] "; }
				log("info", "set " + pageName + " " + sname, "logos=" + set.logos.length + " coverage=" + dbgCov);
				page.allSets.push(set);
			}
		} else {
			var otherSet = { setName: "OTHER", logos: [] };
			for (var oi = 0; oi < remain.length; oi++) {
				if (tmLsContains(fb, remain[oi].logo.geometricBounds)) {
					remain[oi].logo.name = pageName + " " + otherSet.setName;
					if (remain[oi].background) remain[oi].background.name = pageName + " " + otherSet.setName;
					remain[oi].colorType = "Logo_" + oi;
					remain[oi].backgrounds = [remain[oi].colorType];
					otherSet.logos.push(remain[oi]);
				}
			}
			page.allSets.push(otherSet);
		}
		pages.push(page);
	}
	return pages;
}

/* ---- colours --------------------------------------------------------------------------------- */

function tmLsSplitSwatchName(swatchName) {
	if (swatchName.indexOf(" (") !== -1) {
		var name = swatchName.replace(/\\([^)]*\\)/, "").replace(/^\\s+|\\s+$/g, "");
		var pms = swatchName.substring(swatchName.indexOf("(") + 1, swatchName.length - 1).replace(/^\\s+|\\s+$/g, "");
		if (pms.toLowerCase().indexOf("black") === -1 && pms.toLowerCase().indexOf("white") === -1) pms = "PMS " + pms;
		return { name: name, pms: pms };
	}
	return { name: swatchName.replace(/^\\s+|\\s+$/g, ""), pms: "" };
}

function tmLsColorRecord(swatchName, index, spotColor) {
	var split = tmLsSplitSwatchName(swatchName);
	var rgb = tmLsCmykToRgbHex(spotColor);
	return {
		PantoneName: split.name, TeamColorIndex: index, TeamColorName: split.pms,
		C: Math.round(spotColor.cyan), M: Math.round(spotColor.magenta), Y: Math.round(spotColor.yellow), K: Math.round(spotColor.black),
		R: rgb.R, G: rgb.G, B: rgb.B, Hex: rgb.Hex, TintColors: []
	};
}

/* Extract team colours (background swatch column on artboard 0) + the logo's own spot colours. */
function tmLsExtractColors(doc, log) {
	var teamColors = [];
	/* Logo colours are collected into their OWN array (not mixed into teamColors), so the SLS_LOGO JSON
	   can expose a separate LogoColors list alongside TeamColors / CustomColors. */
	var logoColors = [];
	try {
		app.executeMenuCommand("doc-color-cmyk");
		var bgLayer = tmLsLayer(doc, TM_LS.BACKGROUND);
		app.selection = null;
		doc.artboards.setActiveArtboardIndex(0);
		app.executeMenuCommand("selectallinartboard");
		var backgrounds = [];
		for (var s = 0; s < app.selection.length; s++) { if (app.selection[s].parent === bgLayer) backgrounds.push(app.selection[s]); }
		app.selection = null;
		if (backgrounds.length) {
			/* The top-left-most background starts the team-colour column. */
			var first = backgrounds[0];
			for (var b = 1; b < backgrounds.length; b++) {
				if (Math.abs(first.geometricBounds[1]) >= Math.abs(backgrounds[b].geometricBounds[1]) && first.geometricBounds[0] >= backgrounds[b].geometricBounds[0]) first = backgrounds[b];
			}
			var column = [first];
			var xBound = first.geometricBounds[0] + first.width * 2;
			for (var b2 = 0; b2 < backgrounds.length; b2++) {
				if (backgrounds[b2].geometricBounds[0] !== first.geometricBounds[0] && xBound > backgrounds[b2].geometricBounds[0]
					&& Math.abs((first.geometricBounds[1]).toFixed(4)) === Math.abs((backgrounds[b2].geometricBounds[1]).toFixed(4))) column.push(backgrounds[b2]);
			}
			for (var c = 0; c < column.length; c++) {
				try {
					var rec = tmLsColorRecord(column[c].fillColor.spot.name, (c + 1).toString(), column[c].fillColor.spot.color);
					/* Tints flagged in swatch names as "Name|TC<n>|". */
					var tintCount = 1, code = "|TC" + (c + 1) + "|";
					for (var sw = 0; sw < doc.swatches.length; sw++) {
						var nm = doc.swatches[sw].name;
						if (nm !== "[Registration]" && nm !== "[None]" && nm.indexOf(code) !== -1) {
							try {
								var tc = doc.swatches[sw].color.spot.color, trgb = tmLsCmykToRgbHex(tc);
								rec.TintColors.push({ Name: nm.split("|")[0], TeamColorIndex: "Tint Color " + tintCount, C: Math.round(tc.cyan), M: Math.round(tc.magenta), Y: Math.round(tc.yellow), K: Math.round(tc.black), R: trgb.R, G: trgb.G, B: trgb.B, Hex: trgb.Hex });
								tintCount++;
							} catch (e3) { log("warn", "tint", e3); }
						}
					}
					teamColors.push(rec);
				} catch (e2) { log("warn", "teamColor", e2); }
			}
		}
		/* Logo colours: copy the Logos layer artwork to a temp doc and read its spot swatches. */
		try {
			var logoLayer = tmLsLayer(doc, TM_LS.LOGOS);
			if (logoLayer) {
				doc.activeLayer = logoLayer;
				doc.activeLayer.hasSelectedArtwork = true;
				app.executeMenuCommand("copy");
				var tmp = app.documents.add();
				tmp.swatches.removeAll();
				app.executeMenuCommand("paste");
				for (var ls = 0; ls < tmp.swatches.length; ls++) {
					var lsn = tmp.swatches[ls].name.replace(/^\\s+|\\s+$/g, "");
					if (lsn === "[Registration]" || lsn === "[None]") continue;
					var dup = false;
					for (var ti = 0; ti < teamColors.length; ti++) { if (lsn.toLowerCase().indexOf(teamColors[ti].PantoneName.toLowerCase()) !== -1) { dup = true; break; } }
					if (dup) continue;
					/* Push into the separate logoColors array (previously pushed into teamColors). */
					try { if (tmp.swatches[ls].color.typename !== "GradientColor") { var lrec = tmLsColorRecord(lsn, "Logo Colors", tmp.swatches[ls].color.spot.color); logoColors.push(lrec); } } catch (e5) {}
				}
				tmp.close(SaveOptions.DONOTSAVECHANGES);
			}
		} catch (e4) { log("warn", "logoColors", e4); }
		app.selection = null;
	} catch (e) {
		log("error", "extractColors", e);
	}
	return { teamColors: teamColors, logoColors: logoColors, customColors: tmLsExtractCustomColors(doc, log) };
}

/* Extract custom colours from the optional COLORS artboard (legacy exportColorsArtboard + the live
   panel's Team Color 3 fixes, Aug 2026: Freshdesk 224429 / BSC-1190). The Team Colors layer holds
   spot-filled rectangles (possibly nested in groups); the Color Names layer holds the labels. Rows
   are ordered by distance from the artboard top: row 0 is the team-colour row (skipped — already
   captured as TeamColors); rows 1+ are custom colours. Labels pair to chips GEOMETRICALLY (closest
   non-empty label in the chip's column, else nearest overall) — never by row/column index, which
   mis-paired sheets with offset or missing labels. Top-row labels are claimed first so custom chips
   can never steal them, and each label pairs at most once. Custom colours dedupe on their VARIABLE
   label, not the PANTONE name — two variables can legitimately share the same PANTONE. */
function tmLsExtractCustomColors(doc, log) {
	var out = [];
	try {
		var artIndex = -1;
		for (var n = 0; n < doc.artboards.length; n++) { if (doc.artboards[n].name === TM_LS.COLOR_ARTBOARD) { artIndex = n; break; } }
		if (artIndex === -1) return out;

		var tcLayer = tmLsLayer(doc, TM_LS.TEAM_COLORS);
		var cnLayer = tmLsLayer(doc, TM_LS.COLOR_NAMES);
		if (!tcLayer) return out;

		app.selection = null;
		doc.artboards.setActiveArtboardIndex(artIndex);
		app.executeMenuCommand("selectallinartboard");
		var rects = [], labels = [];
		for (var s = 0; s < app.selection.length; s++) {
			tmLsCollectTyped(app.selection[s], tcLayer, "PathItem", rects);
			if (cnLayer) tmLsCollectTyped(app.selection[s], cnLayer, "TextFrame", labels);
		}
		app.selection = null;
		if (!rects.length) return out;

		var rows = tmLsGroupRows(rects);
		/* Order rows from the COLORS artboard's top down, so row 0 is reliably the team-colour row
		   even when stray content sits above or below the swatch table. */
		var artTop = doc.artboards[artIndex].artboardRect[1];
		rows.sort(function (a, b) { return Math.abs(a[0].y - artTop) - Math.abs(b[0].y - artTop); });

		/* Claim the top row's labels (Team Color 1/2/…) so custom rows cannot pair with them. */
		var assigned = [];
		for (var t = 0; t < rows[0].length; t++) {
			var topLabel = tmLsClosestLabel(labels, rows[0][t].item, assigned);
			if (topLabel) assigned.push(topLabel);
		}

		for (var r = 1; r < rows.length; r++) {
			var row = rows[r];
			for (var i = 0; i < row.length; i++) {
				try {
					var fill = row[i].item.fillColor;
					if (!fill || fill.typename !== "SpotColor") continue;
					var variable = "";
					var labelFrame = tmLsClosestLabel(labels, row[i].item, assigned);
					if (labelFrame) {
						variable = String(labelFrame.contents || "").replace(/^\\s+|\\s+$/g, "");
						assigned.push(labelFrame);
					}
					var dup = false;
					for (var d = 0; d < out.length; d++) { if (out[d].CustomColorVariable === variable) { dup = true; break; } }
					if (dup) continue;
					var rec = tmLsColorRecord(fill.spot.name, "Custom Color", fill.spot.color);
					rec.CustomColorVariable = variable;
					out.push(rec);
				} catch (eC) { log("warn", "customColor", eC); }
			}
		}
	} catch (e) {
		log("warn", "extractCustomColors", e);
	}
	return out;
}

/* True when item sits on layer — directly or nested inside groups. Walks the parent chain. */
function tmLsItemOnLayer(item, layer) {
	try {
		var p = item;
		while (p) {
			if (p === layer) return true;
			if (!p.parent || p.typename === "Document") break;
			p = p.parent;
		}
	} catch (e) {}
	return false;
}

/* Collect items of a typename that live on a layer, walking into groups; dedupes on identity. */
function tmLsCollectTyped(item, layer, typename, out) {
	if (!item) return;
	if (item.typename === typename && tmLsItemOnLayer(item, layer)) {
		var seen = false;
		for (var i = 0; i < out.length; i++) { if (out[i] === item) { seen = true; break; } }
		if (!seen) out.push(item);
	}
	if (item.typename === "GroupItem") {
		try { for (var g = 0; g < item.pageItems.length; g++) tmLsCollectTyped(item.pageItems[g], layer, typename, out); } catch (e) {}
	}
}

/* The Color-Names label for a chip: prefer a non-empty text frame whose x-range overlaps the chip's
   column, else the nearest by centre distance. Frames in exclude are already claimed and skipped. */
function tmLsClosestLabel(labels, chip, exclude) {
	if (!labels || !labels.length || !chip) return null;
	var cb = chip.geometricBounds;
	var cx = (cb[0] + cb[2]) / 2, cy = (cb[1] + cb[3]) / 2;
	var left = Math.min(cb[0], cb[2]), right = Math.max(cb[0], cb[2]);
	var colBest = null, colDist = Infinity, anyBest = null, anyDist = Infinity;
	for (var j = 0; j < labels.length; j++) {
		var tf = labels[j];
		if (!tf) continue;
		var claimed = false;
		for (var e = 0; e < exclude.length; e++) { if (exclude[e] === tf) { claimed = true; break; } }
		if (claimed) continue;
		var contents = "";
		try { contents = String(tf.contents || "").replace(/^\\s+|\\s+$/g, ""); } catch (eT) { contents = ""; }
		if (!contents) continue;
		var tb = tf.geometricBounds;
		var dx = cx - (tb[0] + tb[2]) / 2, dy = cy - (tb[1] + tb[3]) / 2;
		var dist = Math.sqrt(dx * dx + dy * dy);
		var inCol = Math.max(tb[0], tb[2]) >= left && Math.min(tb[0], tb[2]) <= right;
		if (inCol && dist < colDist) { colDist = dist; colBest = tf; }
		if (dist < anyDist) { anyDist = dist; anyBest = tf; }
	}
	return colBest || anyBest;
}

/* Group page items into rows by rounded y (descending y = top first); each row sorted by x ascending. */
function tmLsGroupRows(itemsArr) {
	var entries = [];
	for (var i = 0; i < itemsArr.length; i++) {
		entries.push({ x: Math.round(itemsArr[i].position[0]), y: Math.round(itemsArr[i].position[1]), item: itemsArr[i] });
	}
	var yKeys = [];
	var byY = {};
	for (var e = 0; e < entries.length; e++) {
		var k = String(entries[e].y);
		if (!byY[k]) { byY[k] = []; yKeys.push(entries[e].y); }
		byY[k].push(entries[e]);
	}
	yKeys.sort(function (a, b) { return b - a; });
	var rows = [];
	for (var yk = 0; yk < yKeys.length; yk++) {
		var row = byY[String(yKeys[yk])];
		row.sort(function (a, b) { return a.x - b.x; });
		rows.push(row);
	}
	return rows;
}

/* ---- export logo files (ai / png / svg) ----------------------------------------------------- */

function tmLsEnsureFolder(path) { var f = new Folder(path); if (!f.exists) f.create(); return f; }

/* Export the front document (the isolated single-logo temp doc) to ai + png + svg. Returns names. */
function tmLsExportFiles(teamFolder, teamCode, postfix, sep, log) {
	var baseName = teamCode + "_" + postfix;
	var names = { ai: "", png: "", svg: "" };
	var doc = app.documents[0];
	try {
		var aiFolder = tmLsEnsureFolder(teamFolder + sep + "ai");
		var aiFile = new File(aiFolder + sep + baseName + ".ai");
		doc.saveAs(aiFile);
		names.ai = aiFile.name;
	} catch (e) { log("error", "export.ai", baseName + ": " + e); }
	try {
		var pngFolder = tmLsEnsureFolder(teamFolder + sep + "png");
		var pngFile = new File(pngFolder + sep + baseName + ".png");
		var pngOpt = new ExportOptionsPNG24();
		pngOpt.antiAliasing = false; pngOpt.transparency = true; pngOpt.saveAsHTML = false;
		doc.exportFile(pngFile, ExportType.PNG24, pngOpt);
		names.png = baseName + ".png";
	} catch (e) { log("error", "export.png", baseName + ": " + e); }
	try {
		var svgFolder = tmLsEnsureFolder(teamFolder + sep + "svg");
		var svgFile = new File(svgFolder + sep + baseName + ".svg");
		var svgOpt = new ExportOptionsSVG();
		/* Self-contained SVG: embed any raster art and outline fonts so the file has no external
		   references (a data-URL <img> in the panel can't resolve external links → blank thumbnail). */
		svgOpt.embedRasterImages = true;
		svgOpt.coordinatePrecision = 3;
		try { svgOpt.fontType = SVGFontType.OUTLINEFONT; } catch (eF) {}
		doc.exportFile(svgFile, ExportType.SVG, svgOpt);
		names.svg = baseName + ".svg";
	} catch (e) { log("error", "export.svg", baseName + ": " + e); }
	return names;
}

/* For each page/set/logo: isolate into a single-logo temp doc, fit the artboard, export, collect. */
function tmLsExportLogos(srcDoc, pages, team, basePath, sep, log) {
	var teamFolder = basePath + sep + "LOGOS" + sep + team.League + sep + team.TeamCode;
	tmLsEnsureFolder(teamFolder);
	var logoSets = [];
	var exported = 0;
	var tempDoc = app.documents.add();
	try {
		for (var p = 0; p < pages.length; p++) {
			var page = pages[p];
			var baseInfo = tmLsBaseInfoFromTitle(page.title);
			var centerInfo = tmLsCenterInfo(page.centerLogoItems);
			for (var s = 0; s < page.allSets.length; s++) {
				var set = page.allSets[s];
				var fullSetName = (page.pageName + " " + set.setName).replace(/^\\s+|\\s+$/g, "");
				var versions = [];
				for (var k = 0; k < set.logos.length; k++) {
					var entry = set.logos[k];
					var logo = entry.logo;
					try {
						app.activeDocument = tempDoc;
						tempDoc.pageItems.removeAll();
						tempDoc.swatches.removeAll();
						tempDoc.graphicStyles.removeAll();
						tempDoc.symbols.removeAll();
						tempDoc.artboards[0].artboardRect = [0, 0, logo.width, -(logo.height)];
						logo.duplicate(tempDoc, ElementPlacement.PLACEATEND);
						app.executeMenuCommand("Fit Artboard to artwork bounds");
						var logoColors = [];
						var spots = tempDoc.spots;
						for (var sp = 0; sp < spots.length; sp++) {
							try {
								var spn = spots[sp].name;
								if (spn !== "[Registration]" && spn.indexOf("MARK") === -1) { spots[sp].name = spn.replace(/^\\s+|\\s+$/g, ""); logoColors.push(spots[sp].name); }
							} catch (e2) {}
						}
						var postfix = String(logo.name).replace(/\\s/gi, "_") + "_" + entry.colorType;
						var names = tmLsExportFiles(teamFolder, team.TeamCode, postfix, sep, log);
						var typeLabel = TM_LS_TYPE_LABEL[entry.colorType] || entry.colorType;
						versions.push({
							fileNameAI: names.ai, fileNamePNG: names.png, fileNameSVG: names.svg,
							type: typeLabel, persistantCode: entry.logoCode ? entry.logoCode.contents : "",
							backgrounds: entry.backgrounds && entry.backgrounds.length ? entry.backgrounds : (entry.colorType ? [entry.colorType] : []),
							logoColors: logoColors, baseInfo: baseInfo, centerLogoInfo: centerInfo
						});
						if (names.ai) exported++;
						app.activeDocument = srcDoc;
					} catch (e) {
						log("error", "exportLogo", (logo && logo.name ? logo.name : "logo " + k) + ": " + e);
						try { app.activeDocument = srcDoc; } catch (e9) {}
					}
				}
				logoSets.push({ name: fullSetName, SetNameDesign: page.pageName, order: page.order, rules: page.rules, logoVersions: versions });
			}
		}
	} finally {
		try { tempDoc.close(SaveOptions.DONOTSAVECHANGES); } catch (eC) {}
	}
	return { logoSets: logoSets, exported: exported };
}

/* ---- entry point ----------------------------------------------------------------------------- */

function tmLsParseLogosheet(args) {
	var logs = [];
	function log(level, where, message) { logs.push({ level: level, where: where, message: String(message) }); }
	function fail(error) { return JSON.stringify({ success: false, error: String(error), logs: logs }); }

	try {
		if (!app.documents.length) return fail("No document open.");
		var doc = app.activeDocument;
		var sep = ($.os.toLowerCase().indexOf("mac") !== -1) ? "/" : "\\\\";

		if (!args || !args.league || !args.teamCode) return fail("Missing league / team code for parse.");
		if (!args.basePath) return fail("No server path configured for export.");

		var invalid = tmLsValidate(doc);
		if (invalid) return fail(invalid);

		var paired = tmLsPairLogos(doc, log);
		if (!paired.items.length) { log("warn", "pairLogos", "No logos paired with backgrounds."); }

		var pages = tmLsBuildPages(doc, paired.items, paired.backgrounds, log);
		var colors = tmLsExtractColors(doc, log);
		var team = { League: args.league, TeamCode: args.teamCode };
		var exportResult = tmLsExportLogos(doc, pages, team, args.basePath, sep, log);

		return JSON.stringify({
			success: true,
			logs: logs,
			data: {
				isLogosInNewLayer: paired.inNew,
				exportedCount: exportResult.exported,
				teamColors: colors.teamColors,
				logoColors: colors.logoColors,
				customColors: colors.customColors,
				logoSets: exportResult.logoSets
			}
		});
	} catch (e) {
		return fail((e && e.message) ? e.message : String(e));
	}
}
`
