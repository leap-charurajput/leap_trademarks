/**
 * ExtendScript ALERTBOX — ScriptUI dialogs matching legacy alert.jsx (Illustrator-themed).
 * Included in every host bundle via buildHostScript BASE.
 */
export const hostDialogCode = `
if (typeof ALERTBOX !== "object") {
	ALERTBOX = {};
}

if (typeof ALERTBOX.showAlert !== "function") {
	ALERTBOX.showAlert = function(title, message) {
		var win = new Window("dialog", title || "Alert");
		win.orientation = "column";
		win.margins = 15;
		var msg = String(message || "");
		if (msg.length < 50) {
			win.preferredSize = [160, 30];
			win.add("statictext", [0, 0, 300, 20], msg);
		} else {
			win.alignChildren = ["fill", "top"];
			win.preferredSize = [500, 70];
			win.add("statictext", [0, 0, 300, 70], msg, { multiline: true });
		}
		win.bottomGroup = win.add("group");
		win.bottomGroup.alignChildren = ["center", "center"];
		win.bottomGroup.okButton = win.bottomGroup.add("button", undefined, "OK", { name: "ok" });
		win.bottomGroup.okButton.onClick = function() {
			win.close();
		};
		win.show();
	};
}

if (typeof ALERTBOX.showPrompt !== "function") {
	ALERTBOX.showPrompt = function(title, message, okbtn, cancelBtn) {
		okbtn = okbtn || "OK";
		cancelBtn = cancelBtn || "Cancel";
		var win;
		var windowResource;
		var value = null;
		var escapeForResource = function(s) {
			return String(s || "").replace(/\\\\/g, "\\\\\\\\").replace(/'/g, "\\\\'");
		};
		windowResource = "dialog {  " +
			"orientation: 'column', " +
			"alignChildren: ['fill', 'top'],  " +
			"preferredSize:[160, 70], " +
			"text: '" + escapeForResource(title) + "',  " +
			"margins:15, " +
			"st: StaticText { text:'" + escapeForResource(message) + "'}," +
			"bottomGroup: Group{ " +
				"cancelButton: Button { text: '" + escapeForResource(cancelBtn) + "', properties:{name:'cancel'}, alignment:['center', 'center'] }, " +
				"okButton: Button { text: '" + escapeForResource(okbtn) + "', properties:{name:'ok'}, alignment:['center', 'center'] }, " +
			"}" +
		"}";
		win = new Window(windowResource);
		win.bottomGroup.cancelButton.onClick = function() {
			win.close();
			value = "cancel";
		};
		win.bottomGroup.okButton.onClick = function() {
			win.close();
			value = "ok";
		};
		win.show();
		return value;
	};
}
`
