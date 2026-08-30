/*
 * HOST CONTRACTS — the platform-agnostic boundary between the app and Illustrator.
 *
 * The UI and `controller` depend ONLY on these interfaces; they do not know whether the work runs
 * through CEP/ExtendScript today or UXP tomorrow. To port to UXP we add `src/lib/host/uxp/*`
 * implementations and flip `getHost()` — nothing else changes. See AGENTS.md §4.
 *
 * Convention: ONE interface (and one implementation file) per domain — `document`, `log`, … — NOT
 * one file per function. Trademarks feature domains (server/logobase, team/league/colours/logos) are
 * added here as their host wiring lands in the functionality phase (see docs/MIGRATION_PLAN.md).
 */

/* Standard result every host call resolves with (never throws across the boundary). */
export interface HostResult<T = unknown> {
	success: boolean
	data?: T
	error?: string
	/* When set, the panel shows a themed OK dialog (not a toast / ScriptUI alert). */
	alertTitle?: string
}

/* ------------------------------------------------------------------------- */
/* Document domain                                                           */
/* ------------------------------------------------------------------------- */

export interface DocumentInfo {
	name: string
	artboardCount: number
	path: string
}

export interface ArtboardInfo {
	index: number
	name: string
}

/* The active document's relevance to the panel (legacy checkIsLogoSheet / isDocOpened). `isLogoSheet`
   is true when an artboard is named "logos:…"; `info` is then "<League>-<Team>" from the doc name. */
export interface ActiveDocumentState {
	docOpen: boolean
	isLogoSheet: boolean
	info: string
}

export interface DocumentHost {
	getInfo(): Promise<HostResult<DocumentInfo>>
	listArtboards(): Promise<HostResult<ArtboardInfo[]>>
	checkActiveDocument(): Promise<HostResult<ActiveDocumentState>>
}

/* ------------------------------------------------------------------------- */
/* Log domain (folder open + read for a future in-panel dashboard)           */
/* ------------------------------------------------------------------------- */

export interface LogHost {
	/* Open the log folder in Finder/Explorer. */
	openFolder(): Promise<HostResult<{ path: string }>>
	/* Read the last `maxLines` log lines (most-recent last). */
	read(maxLines: number): Promise<HostResult<{ lines: string[] }>>
}

/* ------------------------------------------------------------------------- */
/* Document operations domain (Illustrator DOM — add colours / add logo)     */
/* ------------------------------------------------------------------------- */

/* A team colour to add as a CMYK spot swatch (only the fields ExtendScript needs). */
export interface SwatchColor {
	PantoneName?: string
	text?: string
	C: number
	M: number
	Y: number
	K: number
}

export interface DocumentOpsHost {
	/* Create CMYK spot swatches for the given colours in the active document (skips existing/black). */
	addColors(colors: SwatchColor[]): Promise<HostResult<{ created: number }>>
	/* Place + embed a logo .ai file into the front document, tagging it with the note metadata. */
	addLogo(aiPath: string, note: Record<string, unknown>): Promise<HostResult<{ placed: boolean }>>
	/* Name the current selection ™/® by aspect ratio and tag its colours as MARK (parser excludes them). */
	markSelection(): Promise<HostResult<{ marked: number; skipped: number; names: string[] }>>
	/* Place a set of logos (.ai) into the document. applyColor draws a CMYK background each; perArtboard
	   puts each logo on its own artboard (else all on one artboard in a grid). */
	addLogoSet(items: LogoSetItem[], applyColor: boolean, setName: string, perArtboard: boolean): Promise<HostResult<{ added: number; missing: number }>>
	/* Set the selected text frame's contents to the given verbiage (no-op when no text frame selected). */
	applyVerbiage(text: string): Promise<HostResult<{ applied: boolean }>>
	/* Select page items by Illustrator uuid (used by the validation panel's "Select object" action). */
	selectItems(ids: string[]): Promise<HostResult<{ selected: number; missing: number }>>
}

/* One logo for addLogoSet: its .ai path + the CMYK of its background (used when applyColor is on). */
export interface LogoSetItem {
	aiPath: string
	C?: number
	M?: number
	Y?: number
	K?: number
}

/* ------------------------------------------------------------------------- */
/* Logosheet domain (Illustrator DOM — parse the open logosheet)             */
/* ------------------------------------------------------------------------- */

/* What the panel passes the parser: the team identity + the on-disk server base path to export into. */
export interface ParseTeamInfo {
	league: string
	teamCode: string
	basePath: string
}

/* A structured log line emitted by the parser (surfaced + written to the panel log). */
export interface ParseLog {
	level: 'info' | 'warn' | 'error'
	where: string
	message: string
}

/* One exported logo version (a single file across ai/png/svg + its metadata). */
export interface ParseLogoVersion {
	fileNameAI: string
	fileNamePNG: string
	fileNameSVG: string
	type: string
	persistantCode: string
	/* The colour columns this single file serves (TC1…TCN / dkbgnd / ltbgnd). A normal per-colour logo
	   has one entry; a single logo placed for a whole row carries all of its row's columns. */
	backgrounds: string[]
	logoColors: string[]
	baseInfo: { baseSize: string; baseSizeDirection: string } | null
	centerLogoInfo: {
		CenterShiftFromLeft: string
		CenterShiftFromLeftValue: string | number
		CenterShiftFromTop: string
		CenterShiftFromTopValue: string | number
	}
}

/* A logo set on a page (legacy MasterLogo set). */
export interface ParseLogoSet {
	name: string
	SetNameDesign: string
	order: number
	rules: string
	logoVersions: ParseLogoVersion[]
}

/* A team colour / logo colour record extracted from the sheet (shape matches SLS_LOGO TeamColors). */
export interface ParseColor {
	PantoneName: string
	TeamColorIndex: string
	TeamColorName: string
	C: number
	M: number
	Y: number
	K: number
	R: number
	G: number
	B: number
	Hex: string
	TintColors?: unknown[]
}

export interface ParseResult {
	isLogosInNewLayer: boolean
	exportedCount: number
	teamColors: ParseColor[]
	/* Spot colours found inside the logos themselves — a separate list from TeamColors. */
	logoColors: ParseColor[]
	customColors: ParseColor[]
	logoSets: ParseLogoSet[]
}

/* A background column on a logosheet to build: a team colour ($TC swatch) or dark / light grey. */
export interface BuildColumn {
	token: string
	label: string
	kind: 'tc' | 'dark' | 'light'
	/* 1-based team-colour index (for $TC<n>) when kind is 'tc'. */
	index?: number
}

/* A set (row) on the logosheet: its name + which SVG disk path sits in each column. */
export interface BuildSet {
	name: string
	cells: Record<string, string>
}

/* A logo type (e.g. "Primary") → its own artboard LOGOS:<name>, with its own columns + sets. */
export interface BuildLogoType {
	name: string
	columns: BuildColumn[]
	sets: BuildSet[]
}

export interface BuildLogosheetArgs {
	logoTypes: BuildLogoType[]
}

export interface BuildLogosheetResult {
	placed: number
	missing: number
	artboards: number
}

/* ------------------------------------------------------------------------- */
/* Export LEAP Assets (full spot reconstruction → AI/PNG/SVG + SLS_LOGO JSON) */
/* ------------------------------------------------------------------------- */

/* A named spot colour to reconstruct in each SVG: its PANTONE name + CMYK (for the swatch) and RGB/hex
   (to match the SVG's existing fills). `token` is TC1…TCN for team colours, or the colour name for a
   custom colour. */
export interface AssignedSpot {
	token: string
	pantoneName: string
	C: number
	M: number
	Y: number
	K: number
	R: number
	G: number
	B: number
	hex: string
}

/* What the panel passes the exporter: the team identity, server base path, the spot colours to
   reconstruct, and the same logo-type grid the builder uses. */
export interface ExportAssetsArgs {
	league: string
	teamCode: string
	basePath: string
	colors: AssignedSpot[]
	logoTypes: BuildLogoType[]
}

/* One exported asset record (a single SVG serving one or more backgrounds), mirrored into SLS_LOGO. */
export interface ExportedLogoRecord {
	setName: string
	type: string
	backgrounds: string[]
	logoColors: string[]
	fileNameAI: string
	fileNamePNG: string
	fileNameSVG: string
	persistantCode: string
	centerLogoInfo: {
		CenterShiftFromLeft: string
		CenterShiftFromLeftValue: string | number
		CenterShiftFromTop: string
		CenterShiftFromTopValue: string | number
	}
}

export interface ExportAssetsResult {
	exported: number
	missing: number
	logos: ExportedLogoRecord[]
}

/* ------------------------------------------------------------------------- */
/* Extract AI colours (spot/PANTONE swatches + rendered PNG thumbnail)        */
/* ------------------------------------------------------------------------- */

/* One spot/PANTONE swatch extracted from an AI file: its AI swatch name + CMYK/RGB/hex. */
export interface ExtractedColor {
	name: string
	C: number
	M: number
	Y: number
	K: number
	R: number
	G: number
	B: number
	hex: string
}

/* One uploaded AI file: its disk path, basename, rendered PNG thumbnail path + extracted spots. */
export interface ExtractedFile {
	path: string
	name: string
	preview: string
	spots: ExtractedColor[]
}

export interface ExtractAiResult {
	files: ExtractedFile[]
}

/* ------------------------------------------------------------------------- */
/* Logosheet validation (report every issue, don't just fail on the first)   */
/* ------------------------------------------------------------------------- */

export type ValidationSeverity = 'error' | 'warning'

/* One problem found in the open logosheet. `itemIds` are Illustrator uuids — when non-empty the panel
   offers "Select object", which hands them straight back to `documentOps.selectItems`. */
export interface ValidationIssue {
	code: string
	message: string
	severity: ValidationSeverity
	details: Record<string, unknown>
	itemIds: string[]
}

/* `isValid` reflects errors only — warnings never block a parse. */
export interface ValidationResult {
	isValid: boolean
	errors: ValidationIssue[]
	warnings: ValidationIssue[]
}

export interface LogosheetHost {
	/* Validate the active logosheet and return EVERY issue found (never mutates the document). */
	validate(): Promise<HostResult<ValidationResult> & { logs?: ParseLog[] }>
	/* Extract the spot/PANTONE swatches + a rendered PNG thumbnail from each uploaded AI file. */
	extractAiColors(paths: string[]): Promise<HostResult<ExtractAiResult> & { logs?: string[] }>
	/* Parse the active logosheet: export each logo to ai/png/svg and return colours + set metadata. */
	parse(team: ParseTeamInfo): Promise<HostResult<ParseResult> & { logs?: ParseLog[] }>
	/* Build a new logosheet document from uploaded SVGs (rows = sets, columns = backgrounds). */
	create(args: BuildLogosheetArgs): Promise<HostResult<BuildLogosheetResult> & { logs?: string[] }>
	/* Export LEAP assets: per SVG, reconstruct named PANTONE spot swatches, recolour matching fills,
	   export AI/PNG, copy SVG, and return the per-logo records for the SLS_LOGO JSON. */
	exportAssets(args: ExportAssetsArgs): Promise<HostResult<ExportAssetsResult> & { logs?: string[] }>
}

/* ------------------------------------------------------------------------- */
/* Aggregate host                                                            */
/* ------------------------------------------------------------------------- */

export interface Host {
	document: DocumentHost
	log: LogHost
	documentOps: DocumentOpsHost
	logosheet: LogosheetHost
}
