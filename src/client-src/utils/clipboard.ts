/*
 * Robust clipboard copy for the panel. In a CEP webview `navigator.clipboard.writeText` often rejects
 * silently (non-secure context / no permission), which made the "copied" toast lie — the old clipboard
 * content stayed. So we copy synchronously via a hidden textarea + `document.execCommand('copy')`
 * (reliable in CEF) and only fall back to the async Clipboard API. Returns true only when a copy path
 * actually succeeded, so callers can toast accurately.
 */
export function copyToClipboard(text: string): boolean {
	try {
		const ta = document.createElement('textarea')
		ta.value = text
		ta.setAttribute('readonly', '')
		ta.style.position = 'fixed'
		ta.style.top = '-1000px'
		ta.style.opacity = '0'
		document.body.appendChild(ta)
		ta.focus()
		ta.select()
		ta.setSelectionRange(0, text.length)
		const ok = document.execCommand('copy')
		document.body.removeChild(ta)
		if (ok) return true
	} catch {
		/* fall through to the async API */
	}
	try {
		void navigator.clipboard?.writeText(text)
		return true
	} catch {
		return false
	}
}
