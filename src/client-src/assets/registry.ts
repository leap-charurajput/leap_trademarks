/*
 * Single source for panel SVG assets. ONE monochrome SVG per icon — colour comes from CSS
 * (`icons.css` masks the SVG and paints it with `--panel-icon-color`, set per theme). No light/dark
 * duplicates. `caution` is the only multi-colour exception (kept as a background image).
 *
 * ThemeProvider calls `applyPanelIconTheme()` once; it injects `--panel-icon-<id>` URL vars onto
 * :root for icons.css to consume. UXP port: swap this module only.
 */
import add from './icons/add.svg'
import cad from './icons/cad.svg'
import caution from './icons/caution.svg'
import color from './icons/color.svg'
import deleteIcon from './icons/delete.svg'
import documentIcon from './icons/document.svg'
import duplicate from './icons/duplicate.svg'
import edit from './icons/edit.svg'
import eye from './icons/eye.svg'
import eyeOff from './icons/eye-off.svg'
import exportIcon from './icons/export.svg'
import folder from './icons/folder.svg'
import image from './icons/image.svg'
import popupArrow from './icons/popup-arrow.svg'
import product from './icons/product.svg'
import refresh from './icons/refresh.svg'
import settings from './icons/settings.svg'
import sliders from './icons/sliders.svg'
import target from './icons/target.svg'
import team from './icons/team.svg'
import star from './icons/star.svg'
import starFilled from './icons/star-filled.svg'
import grid from './icons/grid.svg'
import list from './icons/list.svg'
import download from './icons/download.svg'
import addDocument from './icons/add-document.svg'

export type PanelIconId =
	| 'add'
	| 'cad'
	| 'caution'
	| 'color'
	| 'delete'
	| 'document'
	| 'duplicate'
	| 'edit'
	| 'eye'
	| 'eye-off'
	| 'export'
	| 'folder'
	| 'image'
	| 'popup-arrow'
	| 'product'
	| 'refresh'
	| 'settings'
	| 'sliders'
	| 'target'
	| 'team'
	| 'star'
	| 'star-filled'
	| 'grid'
	| 'list'
	| 'download'
	| 'add-document'

/* All panel icons — one SVG URL each (resolved by Vite). */
export const PANEL_ICONS: Record<PanelIconId, string> = {
	add,
	cad,
	caution,
	color,
	delete: deleteIcon,
	document: documentIcon,
	duplicate,
	edit,
	eye,
	'eye-off': eyeOff,
	export: exportIcon,
	folder,
	image,
	'popup-arrow': popupArrow,
	product,
	refresh,
	settings,
	sliders,
	target,
	team,
	star,
	'star-filled': starFilled,
	grid,
	list,
	download,
	'add-document': addDocument,
}

/*
 * Inject `--panel-icon-<id>` URL vars on :root for icons.css. The icon COLOUR is set in CSS via
 * `--panel-icon-color` per theme, so this only needs to run once (re-running is harmless).
 */
export function applyPanelIconTheme(): void {
	const root = document.documentElement
	for (const id of Object.keys(PANEL_ICONS) as PanelIconId[]) {
		root.style.setProperty(`--panel-icon-${id}`, `url("${PANEL_ICONS[id]}")`)
	}
}
