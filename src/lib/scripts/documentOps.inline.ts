/*
 * ExtendScript for document operations (Illustrator DOM — genuinely requires ExtendScript):
 *   tmAddColorsToDocument  → create CMYK spot swatches for the team colours (legacy addColorsToDocument)
 *   tmAddLogoToDocument    → place + embed a logo .ai into the front document (legacy addLogoToDocument)
 * ES3 only (var, no const/let/arrow). Each function returns a JSON string { success, data?, error? }.
 */
export const documentOpsCode = `
function tmAddColorsToDocument(allColors) {
	try {
		if (app.documents.length === 0) return JSON.stringify({ success: false, error: "No open document" });
		var doc = app.activeDocument;
		var created = 0;
		for (var i = 0; i < allColors.length; i++) {
			var c = allColors[i];
			var name = c.PantoneName || c.text || "";
			if (!name) continue;
			if (String(name).toLowerCase() === "black") continue;
			var exists = false;
			try { doc.spots.getByName(name); exists = true; } catch (e) { exists = false; }
			if (exists) continue;
			var newSpot = doc.spots.add();
			var col = new CMYKColor();
			col.cyan = c.C || 0;
			col.magenta = c.M || 0;
			col.yellow = c.Y || 0;
			col.black = c.K || 0;
			newSpot.name = name;
			newSpot.colorType = ColorModel.SPOT;
			newSpot.color = col;
			created++;
		}
		return JSON.stringify({ success: true, data: { created: created } });
	} catch (e) {
		return JSON.stringify({ success: false, error: (e && e.message) ? e.message : String(e) });
	}
}

/*
 * Add a whole set of logos to the document (legacy addLogoSetLogosToDocument). items = [{ aiPath, C,M,Y,K }];
 * when applyColor is true a CMYK background rectangle is drawn behind each logo. Layout:
 *   - perArtboard = false → all logos on ONE artboard in a 5-column grid (fit artboard to artwork),
 *   - perArtboard = true  → each logo gets its OWN artboard sized to its cell.
 * Logos scale to fit their cell. The bg rect + logo go on the same new named layer (logo in front).
 */
function tmAddLogoSetToDocument(items, applyColor, setName, perArtboard) {
	try {
		if (app.documents.length === 0) return JSON.stringify({ success: false, error: "No open document" });
		var doc = app.activeDocument;
		var w = 150, h = 150, hPad = 10, vPad = 10, cols = 5, pad = 5;
		var layer = doc.layers.add();
		layer.name = setName || "Logos";
		var none = doc.swatches.getByName("[None]");
		var added = 0, missing = 0;
		for (var i = 0; i < items.length; i++) {
			var it = items[i];
			var x = (w + hPad) * (i % cols);
			var y = (h + vPad) * Math.floor((i + 0.01) / cols) * -1;
			app.selection = null;
			var rect = layer.pathItems.rectangle(y, x, w, h);
			if (applyColor) {
				var col = new CMYKColor();
				col.cyan = it.C || 0; col.magenta = it.M || 0; col.yellow = it.Y || 0; col.black = it.K || 0;
				rect.fillColor = col;
			} else {
				rect.fillColor = none.color;
			}
			rect.strokeColor = none.color;

			var f = new File(it.aiPath);
			if (!f.exists) { try { rect.remove(); } catch (eR) {} missing++; continue; }
			var wasLocked = layer.locked;
			if (wasLocked) layer.locked = false;
			var placed = layer.placedItems.add();
			placed.file = f;
			placed.embed();
			var logo = (app.selection && app.selection.length) ? app.selection[0] : placed;
			try {
				/* Fit the logo inside the cell with a 5pt margin on every side, then centre it. */
				var scale = Math.min((w - 2 * pad) / logo.width, (h - 2 * pad) / logo.height);
				if (scale > 0 && isFinite(scale)) { logo.width = logo.width * scale; logo.height = logo.height * scale; }
				logo.left = x + (w - logo.width) / 2;
				logo.top = y - (h - logo.height) / 2;
			} catch (eF) {}
			if (wasLocked) layer.locked = true;
			/* In per-artboard mode, give this logo its own artboard sized to the cell. */
			if (perArtboard) { try { doc.artboards.add([x, y, x + w, y - h]); } catch (eA) {} }
			added++;
		}
		if (!perArtboard) { try { app.executeMenuCommand("Fit Artboard to artwork bounds"); } catch (eFit) {} }
		return JSON.stringify({ success: true, data: { added: added, missing: missing } });
	} catch (e) {
		return JSON.stringify({ success: false, error: (e && e.message) ? e.message : String(e) });
	}
}

/* Apply a verbiage string to the selected text frame (legacy applyVerbiageWordToTextFrame, basic case). */
function tmApplyVerbiageToTextFrame(text) {
	try {
		if (app.documents.length === 0) return JSON.stringify({ success: false, error: "No open document" });
		var sel = app.activeDocument.selection;
		if (sel && sel[0] && sel[0].typename === "TextFrame") {
			sel[0].contents = String(text);
			return JSON.stringify({ success: true, data: { applied: true } });
		}
		return JSON.stringify({ success: true, data: { applied: false } });
	} catch (e) {
		return JSON.stringify({ success: false, error: (e && e.message) ? e.message : String(e) });
	}
}

/* ---- Apply mark name to selection (legacy markSelectionAsTradeMark) -------------------------- */

/* Walk up to the outermost container that still sits directly on a layer. */
function tmTopmostParent(item) {
	while (item.parent && item.parent.typename !== "Layer") { item = item.parent; }
	return item;
}

/* Next free MARK-<n> spot name index. */
function tmNextMarkCount(doc) {
	var n = 1;
	while (true) {
		var exists = false;
		try { doc.swatches.getByName("MARK-" + n); exists = true; } catch (e) { exists = false; }
		if (!exists) return n;
		n++;
	}
}

/* Get a spot named 'name', or create one whose base colour is 'baseColor' (a CMYK/RGB color). */
function tmGetOrCreateSpot(doc, name, baseColor) {
	try { return doc.spots.getByName(name); } catch (e) {}
	var spot = doc.spots.add();
	spot.name = name;
	spot.colorType = ColorModel.SPOT;
	spot.color = baseColor;
	return spot;
}

/* A SpotColor referencing the spot at the given tint (default 100). */
function tmSpotColor(spot, tint) {
	var sc = new SpotColor();
	sc.spot = spot;
	sc.tint = (tint === undefined || tint === null) ? 100 : tint;
	return sc;
}

/* Return a MARK-tagged colour equivalent to the fill (so the logosheet parser excludes mark colours):
   a spot fill becomes "MARK:<spotName>"; a process fill becomes a new "MARK-<n>" spot. */
function tmMarkColorFor(doc, fill, counter) {
	try {
		if (fill && fill.typename === "SpotColor") {
			var sname = String(fill.spot.name);
			if (sname.indexOf("MARK") === 0) return fill;
			var spot = tmGetOrCreateSpot(doc, "MARK:" + sname, fill.spot.color);
			return tmSpotColor(spot, fill.tint);
		}
		var name = "MARK-" + counter.n;
		counter.n++;
		var spot2 = tmGetOrCreateSpot(doc, name, fill);
		return tmSpotColor(spot2, 100);
	} catch (e) {
		return fill;
	}
}

/* Recursively retag the fill colour of every path under the page items as a MARK colour. */
function tmTagMarkColors(doc, pageItems, counter) {
	for (var j = 0; j < pageItems.length; j++) {
		var it = pageItems[j];
		if (it.typename === "GroupItem") {
			tmTagMarkColors(doc, it.pageItems, counter);
		} else if (it.typename === "PathItem") {
			it.fillColor = tmMarkColorFor(doc, it.fillColor, counter);
		} else if (it.typename === "CompoundPathItem") {
			var pis = it.pathItems;
			for (var k = 0; k < pis.length; k++) { pis[k].fillColor = tmMarkColorFor(doc, pis[k].fillColor, counter); }
		}
	}
}

/*
 * Mark the current selection as a ™ / ® trademark (legacy markSelectionAsTradeMark): each selected
 * (non-text) object is grouped, named "™" (wider) or "®" (squarer) by aspect ratio, moved to the top of
 * its top-most container, and its colours retagged as MARK so the logosheet parser ignores them.
 */
function tmMarkSelectionAsTradeMark() {
	try {
		if (app.documents.length === 0) return JSON.stringify({ success: false, error: "No open document" });
		var doc = app.activeDocument;
		var sel = doc.selection;
		if (!sel || sel.length === 0) return JSON.stringify({ success: false, error: "Please select a TM or (R) object and try again." });

		var items = [];
		for (var s = 0; s < sel.length; s++) {
			if (sel[s].typename === "TextFrame") return JSON.stringify({ success: false, error: "Text objects are not allowed for trademarks. Convert to outlines and try again." });
			items.push(sel[s]);
		}

		var counter = { n: tmNextMarkCount(doc) };
		var marked = 0, skipped = 0, names = [];
		for (var i = 0; i < items.length; i++) {
			app.executeMenuCommand("deselectall");
			items[i].selected = true;
			if (app.selection.length > 0 && app.selection.length < 6) {
				app.executeMenuCommand("group");
				var grp = app.selection[0];
				var ratio = grp.width / grp.height;
				if (ratio > 0.5 && ratio < 2.75) {
					grp.name = ratio < 1.2 ? "\\u00AE" : "\\u2122";
					names.push(grp.name);
					try { grp.move(tmTopmostParent(grp), ElementPlacement.PLACEATBEGINNING); } catch (eMove) {}
					tmTagMarkColors(doc, grp.pageItems, counter);
					marked++;
				} else {
					skipped++;
				}
			} else {
				skipped++;
			}
		}
		app.executeMenuCommand("deselectall");
		if (marked === 0) return JSON.stringify({ success: false, error: "Please select a ™ or ® object and try again." });
		return JSON.stringify({ success: true, data: { marked: marked, skipped: skipped, names: names } });
	} catch (e) {
		return JSON.stringify({ success: false, error: (e && e.message) ? e.message : String(e) });
	}
}

/*
 * Select page items by their Illustrator uuid (legacy JSX_MAIN.selectObjectsByID, widened to a list).
 * Used by the validation panel: clicking an issue selects the artwork that caused it, unlocking and
 * unhiding its layer first so the selection is actually visible. Ids that no longer resolve (the user
 * deleted or regrouped the art since validating) are skipped and counted as missing.
 */
function tmSelectItemsById(ids) {
	try {
		if (app.documents.length === 0) return JSON.stringify({ success: false, error: "No open document" });
		var doc = app.activeDocument;
		app.selection = null;
		var selected = 0, missing = 0;
		for (var i = 0; i < ids.length; i++) {
			try {
				var item = doc.getPageItemFromUuid(ids[i]);
				if (!item) { missing++; continue; }
				try {
					var layer = item.layer;
					if (layer) { layer.locked = false; layer.visible = true; }
				} catch (eLayer) {}
				item.locked = false;
				item.hidden = false;
				item.selected = true;
				selected++;
			} catch (eItem) {
				missing++;
			}
		}
		if (selected === 0) return JSON.stringify({ success: false, error: "The object could not be found — it may have been deleted or changed since validating." });
		try { app.redraw(); } catch (eDraw) {}
		return JSON.stringify({ success: true, data: { selected: selected, missing: missing } });
	} catch (e) {
		return JSON.stringify({ success: false, error: (e && e.message) ? e.message : String(e) });
	}
}

function tmAddLogoToDocument(imageFilePath, note) {
	try {
		if (app.documents.length === 0) return JSON.stringify({ success: false, error: "No open document" });
		var logoFile = new File(imageFilePath);
		if (!logoFile.exists) return JSON.stringify({ success: false, error: "Logo file not found: " + imageFilePath });
		var destDoc = app.activeDocument;
		var layer = destDoc.layers[0];
		var wasLocked = layer.locked;
		if (wasLocked) layer.locked = false;
		var placed = layer.placedItems.add();
		placed.file = logoFile;
		placed.embed();
		try { if (app.selection && app.selection.length) app.selection[0].note = JSON.stringify(note); } catch (e2) {}
		if (wasLocked) layer.locked = true;
		return JSON.stringify({ success: true, data: { placed: true } });
	} catch (e) {
		return JSON.stringify({ success: false, error: (e && e.message) ? e.message : String(e) });
	}
}
`
