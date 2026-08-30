/*
 * ExtendScript body for document/artboard inspection. Read-only — used by the panel to show the
 * active document name and to list artboards available for per-artboard export settings.
 */
export const documentHostCode = `
function getDocumentInfoRun() {
	try {
		if (!app.documents.length) {
			return JSON.stringify({ success: false, error: "No document open" });
		}
		var doc = app.activeDocument;
		return JSON.stringify({
			success: true,
			data: {
				name: doc.name,
				artboardCount: doc.artboards.length,
				path: (doc.path && doc.path.fsName) ? doc.path.fsName : ""
			}
		});
	} catch (e) {
		return JSON.stringify({ success: false, error: (e && e.message) ? e.message : String(e) });
	}
}

function checkActiveDocumentRun() {
	try {
		if (!app.documents.length) {
			return JSON.stringify({ success: true, data: { docOpen: false, isLogoSheet: false, info: "" } });
		}
		var doc = app.activeDocument;
		var isLogo = false;
		var i;
		for (i = 0; i < doc.artboards.length; i++) {
			if (String(doc.artboards[i].name).toLowerCase().indexOf("logos:") !== -1) { isLogo = true; break; }
		}
		var info = "";
		if (isLogo) {
			var parts = String(doc.name).split("_");
			info = (parts[0] || "") + "-" + (parts[1] || "");
		}
		return JSON.stringify({ success: true, data: { docOpen: true, isLogoSheet: isLogo, info: info } });
	} catch (e) {
		return JSON.stringify({ success: false, error: (e && e.message) ? e.message : String(e) });
	}
}

function listArtboardsRun() {
	try {
		if (!app.documents.length) {
			return JSON.stringify({ success: false, error: "No document open" });
		}
		var doc = app.activeDocument;
		var out = [];
		var i;
		for (i = 0; i < doc.artboards.length; i++) {
			var ab = doc.artboards[i];
			out.push({ index: i, name: String(ab.name) });
		}
		return JSON.stringify({ success: true, data: out });
	} catch (e) {
		return JSON.stringify({ success: false, error: (e && e.message) ? e.message : String(e) });
	}
}
`
