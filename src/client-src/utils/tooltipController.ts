/**
 * Global tooltip gate — Illustrator CEP fires mouseenter/mousemove on click.
 * All Tooltip instances subscribe; document capture suppresses on any pointer down.
 */

type Listener = () => void

const listeners = new Set<Listener>()

let suppressUntilMs = 0
let suppressEpoch = 0
let actionBarMenuOpen = false
let globalListenersInstalled = false

const DEFAULT_SUPPRESS_MS = 900

function notifyListeners(): void {
	listeners.forEach((listener) => listener())
}

export function subscribeTooltipSuppress(listener: Listener): () => void {
	listeners.add(listener)
	return () => listeners.delete(listener)
}

/** Block tooltips until timestamp (and notify mounted tooltips to hide). */
export function suppressAllTooltips(_reason: string, durationMs = DEFAULT_SUPPRESS_MS): void {
	suppressEpoch += 1
	suppressUntilMs = Math.max(suppressUntilMs, Date.now() + durationMs)
	notifyListeners()
}

export function getTooltipSuppressEpoch(): number {
	return suppressEpoch
}

export function isTooltipGloballySuppressed(): boolean {
	return actionBarMenuOpen || Date.now() < suppressUntilMs
}

/** While an action-bar dropdown is open, never show tooltips on footer buttons. */
export function setActionBarMenuOpen(open: boolean): void {
	if (actionBarMenuOpen === open) return
	actionBarMenuOpen = open
	if (open) suppressEpoch += 1
	notifyListeners()
}

export function installGlobalTooltipSuppressListeners(): void {
	if (globalListenersInstalled || typeof document === 'undefined') return
	globalListenersInstalled = true

	const onPointerActivity = () => {
		suppressAllTooltips('document-pointer', DEFAULT_SUPPRESS_MS)
	}

	document.addEventListener('pointerdown', onPointerActivity, true)
	document.addEventListener('mousedown', onPointerActivity, true)
	document.addEventListener('click', onPointerActivity, true)
}
