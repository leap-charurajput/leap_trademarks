/*
 * Controller — the single facade between React and the Illustrator host.
 *
 * UI imports ONLY this. It delegates to the domain-grouped host (`getHost().<domain>.*`), which is
 * CEP today and UXP later with no change here. No component imports `lib/host/*` or `lib/helper`
 * directly. See AGENTS.md §4.
 *
 * The UI phase only needs document info (for the "current document team" hint) and the log helpers.
 * Trademarks feature operations (load leagues/teams/colours/logos from the server, add logo/colours
 * to the document, change/manage servers, parse logosheets, import Excel) are added here as their
 * host domains land in the functionality phase (see docs/MIGRATION_PLAN.md).
 */
import {
	getCSInterface,
	isCEP,
	readTextFile,
	readFileBase64,
	writeTextFile,
	chooseFolder,
	chooseFile,
	chooseFiles,
	listFilesInFolder,
	openPath,
	getDocumentsPath,
	ensureDir,
	removeDir,
	deleteFile,
} from '@lib/helper'
import { TrademarksConfig } from './constants'
import * as XLSX from 'xlsx'
import { getHost, type ActiveDocumentState, type ArtboardInfo, type AssignedSpot, type BuildLogoType, type BuildLogosheetArgs, type DocumentInfo, type ExportedLogoRecord, type ExtractedColor, type ParseColor, type ParseResult, type SwatchColor, type ValidationResult } from '@lib/host'
import { logger } from '@lib/logger'
import { errInit, errLog, roiLogEvent, versionCheckInit } from '@lib/telemetry'

/* A colour from the server-only COLOR_PALETTES.json library. R/G/B are 0–255; C/M/Y/K are 0–100. */
export interface PaletteColor {
	ColorName: string
	R: number
	G: number
	B: number
	C: number
	M: number
	Y: number
	K: number
	Hex: string
}

/* A configured Logobase server folder (mirrors data/types ServerFolder; kept here to avoid a UI import). */
export interface SettingsServer {
	name: string
	path: string
	enable: boolean
	active: boolean
}

/* The locally-persisted data settings: the active Logobase path + the configured server folders. */
export interface DataSettings {
	basePath: string
	servers: SettingsServer[]
}

/* ---- Manage Logos --------------------------------------------------------------------------- */

/*
 * One logo *version* as stored on the server: the AI/PNG/SVG trio plus the JSON entry that describes
 * it. This is the unit the Manage Logos tab deletes — deliberately NOT the `Logo` the grids render,
 * which is expanded once per background colour (several UI logos can share one file).
 */
export interface ManagedLogo {
	/* Stable identity for selection + deletion: the JSON `Id` when present, else "<set>::<file>". */
	id: string
	setName: string
	fileNameAI: string
	fileNamePNG: string
	fileNameSVG: string
	type: string
	/* Colour columns this file serves (TC1…TCN / dkbgnd / ltbgnd). */
	backgrounds: string[]
	/* Thumbnail source (SVG when available) + its raster fallback. */
	previewUrl: string
	previewFallbackUrl: string
}

/* A logo set (one `MasterLogo[]` entry) and its versions, as shown in Manage Logos. */
export interface ManagedLogoSet {
	setName: string
	updatedTime: string
	logos: ManagedLogo[]
}

/* What a delete removed: JSON entries, files actually unlinked, files that were already gone, and
   sets dropped because they ended up empty. */
export interface DeleteLogosResult {
	ok: boolean
	error?: string
	removed: number
	filesDeleted: number
	filesMissing: number
	setsRemoved: number
}

/* Raw SLS_LOGO shapes — only the fields Manage Logos reads or rewrites. Everything else on an entry
   is preserved untouched, so a delete never rewrites data it doesn't understand. */
interface RawManagedLogoVersion {
	Id?: string
	FileName?: string
	FileNamePNG?: string
	FileNameSVG?: string
	Type?: string
	Backgrounds?: string[]
}
interface RawManagedLogoSet {
	SetName?: string
	UpdatedTime?: string
	MasterLogos?: RawManagedLogoVersion[]
}
interface RawManagedLogoFile {
	MasterLogo?: RawManagedLogoSet[]
}

/* A persisted favourite team (mirrors data/types FavouriteTeam; kept here to avoid a UI import). */
export interface FavouriteTeam {
	teamID: string
	teamName: string
	leagueCode: string
	leagueCodeTeamName: string
}

const DATA_SETTINGS_LS_KEY = 'leap.trademarks.datasettings'
const FAVOURITES_LS_KEY = 'leap.trademarks.favourites'

/* A league parsed from an Excel sheet, ready to be incorporated. `teams` are the raw row objects
   (keys cleaned of spaces/commas, values trimmed). */
export interface ParsedLeague {
	code: string
	fullName: string
	sport: string
	teamCount: number
	teams: Record<string, string>[]
}

/* A row in the Import-Excel league list: existing leagues (from SLS_MASTER) and/or new ones parsed
   from the chosen Excel. `inExcel` rows can be (re)imported; rows only `inMaster` are kept as-is. */
export interface ImportLeagueRow {
	code: string
	name: string
	inExcel: boolean
	inMaster: boolean
	teamCount: number
}

/* The result of choosing + parsing an Excel file: the parsed leagues plus the merged, ordered row
   list to show in the modal (existing master order first, then any new Excel leagues). */
export interface ExcelImportSession {
	filePath: string
	parsed: ParsedLeague[]
	rows: ImportLeagueRow[]
}

/* One league entry in SLS_MASTER.json (array order = league display order). */
interface MasterLeagueEntry {
	Code: string
	Teams: { TeamCode: string; TeamGroup?: string; FullName?: string; TeamCity?: string }[]
}

/* Convert a plain disk path to a file:// URL (encoded) for the catalog loader / <img> in CEP. */
function diskToFileUrl(disk: string): string {
	if (disk.indexOf('file://') === 0) return disk
	return 'file://' + disk.split('/').map((seg) => encodeURIComponent(seg)).join('/')
}

/* Convert a file:// URL (or plain path) back to a disk path for ExtendScript File(). */
function fileUrlToDisk(base: string): string {
	return base.indexOf('file://') === 0 ? decodeURIComponent(base.replace(/^file:\/\//, '')) : base
}

class Controller {
	/* Initialise the host bridge once the panel has mounted. */
	async init(): Promise<void> {
		getCSInterface()
		logger.info('Controller', 'Initialised LEAP Trademarks controller')
		/* Telemetry: hook uncaught-error capture + start the direct-POST retry timer + register this
		   machine + login, and send the version-check snapshot. Guarded so it can never block init.
		   Events/errors POST straight to leap_log_server. */
		try {
			errInit()
			versionCheckInit()
		} catch {
			/* telemetry must never block init */
		}
	}

	/* True when an Illustrator host session is available. */
	hasSession(): boolean {
		return isCEP() && !!getCSInterface()
	}

	get name(): string {
		return 'LEAP Trademarks Controller'
	}

	/*
	 * Log a named ROI event from the UI (e.g. "opened the Logosheet builder"). A thin passthrough to the
	 * telemetry logger so the UI keeps importing only the controller (AGENTS.md §4). Never throws.
	 */
	logEvent(action: string, extra?: Record<string, unknown>): void {
		try {
			roiLogEvent({ action, extra })
		} catch {
			/* logging must never break the UI */
		}
	}

	/*
	 * Log an error from the UI to leap_log_server (dashboard New Errors tab). A thin passthrough so the
	 * UI keeps importing only the controller. Never throws.
	 */
	logError(ctx: string, err?: unknown, extra?: Record<string, unknown>): void {
		try {
			errLog(ctx, err, extra)
		} catch {
			/* logging must never break the UI */
		}
	}

	/*
	 * Relay ExtendScript host-script ERROR logs to leap_log_server so they surface on the dashboard's
	 * New Errors tab. ExtendScript has no network, so host errors ride back in the eval result's `logs`
	 * array; here we forward the error-level ones via errLog (with their `where` tag). Never throws.
	 */
	private relayHostErrors(ctx: string, logs?: { level: string; where?: string; message: string }[]): void {
		try {
			for (const l of logs ?? []) {
				if (l && l.level === 'error') errLog(ctx, new Error(`${l.where ? l.where + ': ' : ''}${l.message}`))
			}
		} catch {
			/* never throw */
		}
	}

	/*
	 * Resolve the Logobase base path the catalog loader reads from. Today the representative dataset is
	 * served with the app (public/logobase), so it resolves against the panel origin in both browser dev
	 * and the hosted CEP panel. The configurable on-disk server path (legacy
	 * `fetchLogobaseDataSettingFilePath`) becomes a host call in the server-domain phase; this method is
	 * the single seam where that swap happens.
	 */
	async getLogobaseBasePath(): Promise<string> {
		/* Browser dev always reads the bundled representative dataset under public/logobase. */
		if (!this.hasSession()) return 'logobase'
		/* In Illustrator, use the folder the user chose. Order of precedence:
		   1) logobaseDataPathSettings.json — the canonical "active" path, SHARED with the legacy
		      panel (with a one-time fallback migration from the early new-panel server_path.json),
		   2) the active/first enabled server in server_path_list.json — covers the case where the list
		      exists but no active path was ever written; we adopt one and persist it as canonical,
		   3) the saved basePath.
		   Empty string means no server is configured — the UI shows "Server not mounted". */
		let disk = this.readServerPath()
		if (!disk) {
			const settings = this.getDataSettings()
			const fromList = settings.servers.find((s) => s.active && s.enable)
				|| settings.servers.find((s) => s.enable)
				|| settings.servers[0]
			disk = fromList?.path || settings.basePath || ''
			/* Adopt the chosen server as the canonical active path so it persists across restarts. */
			if (disk) this.setActiveServer(disk)
		}
		return disk ? diskToFileUrl(disk) : ''
	}

	/* ---- LEAP Data Settings (local config: Logobase path + server folders) ---------------------- */

	/* Absolute path of the server_path_list.json file (CEP only). */
	private dataSettingsPath(): string | null {
		const docs = getDocumentsPath()
		if (!docs) return null
		return `${docs}/LEAP Settings/server_path_list.json`
	}

	/* Canonical store for the chosen LEAP server path. Deliberately the LEGACY panel's file —
	   ~/Documents/LEAP Settings/logobaseDataPathSettings.json, shape { basePath } — so the old and
	   new Trademarks panels stay in sync while both are in use: switching the server in either
	   panel is picked up by the other. (The legacy panel reads/writes this exact file/shape in
	   Illustrator.jsx getLogobasePath / updateLogobaseDataSettingsLocation.) */
	private serverPathFile(): string | null {
		const docs = getDocumentsPath()
		if (!docs) return null
		return `${docs}/LEAP Settings/logobaseDataPathSettings.json`
	}

	/* Early new-panel builds wrote server_path.json ({ serverPath }) instead; kept as a read-only
	   migration source so an existing choice survives the switch to the shared legacy file. */
	private legacyNewPanelServerPathFile(): string | null {
		const docs = getDocumentsPath()
		if (!docs) return null
		return `${docs}/LEAP Settings/server_path.json`
	}

	/* Read the saved server path, or null if unset / unreadable. Accepts the legacy { basePath }
	   shape (canonical) and { serverPath }; when the shared file is missing, falls back to the old
	   new-panel server_path.json ONCE and seeds the shared file from it. */
	private readServerPath(): string | null {
		const parse = (text: string | null): string | null => {
			if (!text) return null
			try {
				const parsed = JSON.parse(text) as { basePath?: string; serverPath?: string }
				const value = parsed.basePath || parsed.serverPath
				return value ? fileUrlToDisk(value) : null
			} catch {
				return null
			}
		}
		try {
			const file = this.serverPathFile()
			const shared = parse(file ? readTextFile(file) : null)
			if (shared) return shared
			const migrated = parse((() => { const f = this.legacyNewPanelServerPathFile(); return f ? readTextFile(f) : null })())
			if (migrated) this.writeServerPath(migrated)
			return migrated
		} catch {
			return null
		}
	}

	/* Persist the chosen server path in the shared legacy shape ({ basePath }) the old panel reads. */
	private writeServerPath(path: string): void {
		const file = this.serverPathFile()
		if (!file) return
		ensureDir(file.replace(/\/[^/]*$/, ''))
		writeTextFile(file, JSON.stringify({ basePath: path }, null, 2))
	}

	/* The default settings when nothing has been saved yet. */
	private defaultDataSettings(): DataSettings {
		return { basePath: '', servers: [] }
	}

	/* Normalise stored paths to plain on-disk paths (strip any legacy file:// prefix + decode). */
	private normalizeSettings(s: DataSettings): DataSettings {
		return {
			basePath: s.basePath ? fileUrlToDisk(s.basePath) : '',
			servers: (s.servers ?? []).map((x) => ({ ...x, path: fileUrlToDisk(x.path) })),
		}
	}

	/* The shared logobaseDataPathSettings.json is the source of truth for WHICH server is active —
	   the legacy panel rewrites it without touching our server_path_list.json, so the list's `active`
	   flags can go stale (the ServerBar would then name the wrong server while the catalog loads the
	   shared path). Re-flag the list to match the shared path — appending an entry when the shared
	   path isn't listed yet — and persist so the files converge. No-op when already consistent. */
	private reconcileActiveServer(settings: DataSettings): DataSettings {
		const shared = this.readServerPath()
		if (!shared) return settings
		const strip = (p: string) => p.replace(/\/+$/, '')
		const target = strip(shared)
		const flagged = settings.servers.find((s) => s.active)
		if (flagged && strip(flagged.path) === target) return settings
		const servers = settings.servers.map((s) => ({ ...s, active: strip(s.path) === target }))
		if (!servers.some((s) => s.active)) {
			const name = target.split('/').filter(Boolean).pop() || shared
			servers.push({ name, path: shared, enable: true, active: true })
		}
		const reconciled = { basePath: shared, servers }
		this.saveDataSettings(reconciled)
		return reconciled
	}

	/* Build a single-server settings object from the active shared path file (the default when no
	   server_path_list.json exists yet). Returns empty settings when no server path is saved either. */
	private settingsFromServerPath(): DataSettings {
		const picked = this.readServerPath()
		if (!picked) return this.defaultDataSettings()
		const name = picked.split('/').filter(Boolean).pop() || picked
		return { basePath: picked, servers: [{ name, path: picked, enable: true, active: true }] }
	}

	/* Read the data settings (CEP: server_path_list.json; browser: localStorage). Never throws.
	   When no list file exists yet, the active shared path file is used as the sole default server. */
	getDataSettings(): DataSettings {
		try {
			if (isCEP()) {
				const path = this.dataSettingsPath()
				const text = path ? readTextFile(path) : null
				if (text) {
					const parsed = this.normalizeSettings({ ...this.defaultDataSettings(), ...(JSON.parse(text) as Partial<DataSettings>) })
					if (parsed.servers.length) return this.reconcileActiveServer(parsed)
				}
				return this.settingsFromServerPath()
			} else {
				const raw = window.localStorage.getItem(DATA_SETTINGS_LS_KEY)
				if (raw) {
					const parsed = this.normalizeSettings({ ...this.defaultDataSettings(), ...(JSON.parse(raw) as Partial<DataSettings>) })
					if (parsed.servers.length) return parsed
				}
			}
		} catch (e) {
			logger.warn('DataSettings', e instanceof Error ? e.message : String(e))
			errLog('getDataSettings', e)
		}
		return this.defaultDataSettings()
	}

	/* Persist the data settings. Returns true on success. */
	saveDataSettings(settings: DataSettings): boolean {
		try {
			if (isCEP()) {
				const path = this.dataSettingsPath()
				if (!path) return false
				ensureDir(path.replace(/\/[^/]*$/, ''))
				return writeTextFile(path, JSON.stringify(settings, null, 2))
			}
			window.localStorage.setItem(DATA_SETTINGS_LS_KEY, JSON.stringify(settings))
			return true
		} catch (e) {
			logger.error('DataSettings', e instanceof Error ? e.message : String(e))
			return false
		}
	}

	/*
	 * LEAP Data Settings — let the user pick the Logobase data folder, persist it as the active base
	 * path (and add it to the server list), and report the chosen path. Returns null when cancelled or
	 * not in CEP (no native folder picker in the browser).
	 */
	chooseDataFolder(): string | null {
		const raw = chooseFolder('Locate the LEAP Logobase data folder')
		if (!raw) return null
		/* The native dialog can return a file:// URL and/or URL-encoded segments (e.g. %20 for spaces).
		   Normalise to a plain on-disk path so what we persist + show is e.g. "/Users/…", not
		   "file:///Users/…". */
		const picked = fileUrlToDisk(raw)
		const settings = this.getDataSettings()
		const name = picked.split('/').filter(Boolean).pop() || picked
		const servers = settings.servers.map((s) => ({ ...s, active: false }))
		const existing = servers.find((s) => s.path === picked)
		if (existing) {
			existing.active = true
			existing.enable = true
		} else {
			servers.push({ name, path: picked, enable: true, active: true })
		}
		this.saveDataSettings({ basePath: picked, servers })
		this.writeServerPath(picked)
		logger.info('DataSettings', `Logobase folder set to ${picked}`)
		/* ROI: the user chose / changed the LEAP server (logobase) folder. */
		roiLogEvent({ action: 'serverFolderChosen', extra: { name, path: picked } })
		return picked
	}

	/* Make a configured server folder the active Logobase path (Choose…). Returns its path. */
	setActiveServer(path: string): boolean {
		const settings = this.getDataSettings()
		const servers = settings.servers.map((s) => ({ ...s, active: s.path === path }))
		this.writeServerPath(path)
		const ok = this.saveDataSettings({ basePath: path, servers })
		/* ROI: the user switched the active server folder. */
		roiLogEvent({ action: 'serverSwitched', extra: { path } })
		return ok
	}

	/* Open a folder in Finder/Explorer (current server folder, manage list). */
	openFolder(path: string): boolean {
		return openPath(path)
	}

	/* ---- Favourites (persisted pinned teams) --------------------------------------------------- */

	/* Absolute path of the favourites file (CEP only): ~/Documents/LEAP Settings/LEAP_Trademarks/favourites.json. */
	private favouritesPath(): string | null {
		const docs = getDocumentsPath()
		if (!docs) return null
		return `${docs}/LEAP Settings/LEAP_Trademarks/favourites.json`
	}

	/* Read the saved favourites (CEP: favourites.json; browser: localStorage). Never throws → []. */
	readFavourites(): FavouriteTeam[] {
		try {
			if (isCEP()) {
				const path = this.favouritesPath()
				const text = path ? readTextFile(path) : null
				if (text) return JSON.parse(text) as FavouriteTeam[]
			} else {
				const raw = window.localStorage.getItem(FAVOURITES_LS_KEY)
				if (raw) return JSON.parse(raw) as FavouriteTeam[]
			}
		} catch (e) {
			logger.warn('Favourites', e instanceof Error ? e.message : String(e))
		}
		return []
	}

	/* Persist the favourites list. Returns true on success. */
	saveFavourites(favourites: FavouriteTeam[]): boolean {
		try {
			if (isCEP()) {
				const path = this.favouritesPath()
				if (!path) return false
				ensureDir(path.replace(/\/[^/]*$/, ''))
				return writeTextFile(path, JSON.stringify(favourites, null, 2))
			}
			window.localStorage.setItem(FAVOURITES_LS_KEY, JSON.stringify(favourites))
			return true
		} catch (e) {
			logger.error('Favourites', e instanceof Error ? e.message : String(e))
			return false
		}
	}

	/* Active document summary, or null when none is open / not in CEP. */
	async getDocumentInfo(): Promise<DocumentInfo | null> {
		if (!this.hasSession()) return null
		const result = await getHost().document.getInfo()
		if (!result.success) {
			logger.warn('Document', result.error ?? 'getInfo failed')
			return null
		}
		return result.data ?? null
	}

	/* Artboards in the active document, or [] when none / not in CEP. */
	async listArtboards(): Promise<ArtboardInfo[]> {
		if (!this.hasSession()) return []
		const result = await getHost().document.listArtboards()
		if (!result.success) {
			logger.warn('Document', result.error ?? 'listArtboards failed')
			return []
		}
		return result.data ?? []
	}

	/*
	 * Validate the active logosheet (ported from LEAP Librarian's logosheetValidator). Unlike the parser's
	 * own fail-fast guard this reports EVERY problem, so the panel can list them and let the user select
	 * the offending artwork. Read-only: it never changes the document. Warnings do not make it invalid.
	 */
	async validateLogosheet(): Promise<{ ok: boolean; error?: string; result?: ValidationResult }> {
		if (!this.hasSession()) return { ok: false, error: 'Validating a logosheet is available inside Illustrator.' }

		const res = await getHost().logosheet.validate()
		for (const l of res.logs ?? []) {
			const line = `validate[${l.where}] ${l.message}`
			if (l.level === 'error') logger.error('Logosheet', line)
			else if (l.level === 'warn') logger.warn('Logosheet', line)
			else logger.info('Logosheet', line)
		}
		this.relayHostErrors('logosheet.validate', res.logs)

		if (!res.success || !res.data) {
			const error = res.error ?? 'Logosheet validation failed.'
			errLog('logosheet.validate', new Error(error))
			return { ok: false, error }
		}

		const { isValid, errors, warnings } = res.data
		logger.info('Logosheet', `Validated: ${errors.length} error(s), ${warnings.length} warning(s).`)
		roiLogEvent({ action: 'validateLogosheet', extra: { isValid, errors: errors.length, warnings: warnings.length } })
		return { ok: true, result: res.data }
	}

	/*
	 * Parse the active logosheet (legacy parseLogoSheet flow). Calls the host parser — which exports each
	 * logo to ai/png/svg and returns colours + set metadata — then assembles SLS_LOGO_<team>.json (the
	 * shape the catalog loader reads) and writes it to JSON/TEAM_LOGOS/<League>/ React-side. Every parser
	 * log line is forwarded to the panel log. `info` is the "<League>-<Team>" string from the doc.
	 */
	async parseLogosheet(info: string): Promise<{ ok: boolean; error?: string; exportedCount: number; message?: string }> {
		const dash = info.indexOf('-')
		const league = dash >= 0 ? info.slice(0, dash) : info
		const teamCode = dash >= 0 ? info.slice(dash + 1) : ''
		if (!league || !teamCode) return { ok: false, error: `Could not read league/team from "${info}".`, exportedCount: 0 }
		const base = this.serverDiskBase()
		if (!base) return { ok: false, error: 'No server folder is configured.', exportedCount: 0 }
		if (!this.hasSession()) return { ok: false, error: 'No Illustrator session.', exportedCount: 0 }

		/* ROI: the user has STARTED parsing a team's logosheet (paired with the 'parseLogosheet' finish
		   event, so the dashboard can see start → finish for this league/team). */
		roiLogEvent({ action: 'parseLogosheetStarted', league, team: teamCode, extra: { serverPath: base } })

		const result = await getHost().logosheet.parse({ league, teamCode, basePath: base })
		/* Forward parser logs to the panel log (so failures are captured, per the brief). */
		for (const l of result.logs ?? []) {
			const line = `parse[${l.where}] ${l.message}`
			if (l.level === 'error') logger.error('Logosheet', line)
			else if (l.level === 'warn') logger.warn('Logosheet', line)
			else logger.info('Logosheet', line)
		}
		/* Relay the host parser's error-level logs to the dashboard (New Errors tab). */
		this.relayHostErrors('logosheet.parse', result.logs)
		if (!result.success || !result.data) {
			errLog('logosheet.parse', new Error(result.error ?? 'Logosheet parse failed.'), { league, team: teamCode })
			return { ok: false, error: result.error ?? 'Logosheet parse failed.', exportedCount: 0 }
		}

		try {
			const json = this.buildSlsLogoJson(result.data)
			const folder = `${base}/JSON/TEAM_LOGOS/${league}`
			ensureDir(folder)
			const ok = writeTextFile(`${folder}/SLS_LOGO_${teamCode}.json`, JSON.stringify(json, null, 4))
			if (!ok) {
				errLog('logosheet.parse.write', new Error('Could not write the SLS_LOGO JSON file.'), { league, team: teamCode })
				return { ok: false, error: 'Could not write the SLS_LOGO JSON file.', exportedCount: result.data.exportedCount }
			}
		} catch (e) {
			const msg = e instanceof Error ? e.message : String(e)
			logger.error('Logosheet', msg)
			errLog('logosheet.parse.write', e, { league, team: teamCode })
			return { ok: false, error: msg, exportedCount: result.data.exportedCount }
		}

		logger.info('Logosheet', `Parsed ${league}-${teamCode}: ${result.data.exportedCount} logo(s) exported.`)
		/* ROI: a value-bearing user action (a team's logosheet parsed → SLS_LOGO JSON written). */
		roiLogEvent({
			action: 'parseLogosheet',
			league,
			team: teamCode,
			extra: {
				exportedCount: result.data.exportedCount,
				serverPath: base,
				outputFile: `${base}/JSON/TEAM_LOGOS/${league}/SLS_LOGO_${teamCode}.json`,
			},
		})
		return { ok: true, exportedCount: result.data.exportedCount, message: `${result.data.exportedCount} logo(s) exported` }
	}

	/* ---- Export LEAP Assets (spot reconstruction → AI/PNG/SVG + SLS_LOGO JSON) ----------------- */

	/* Load the server-only colour library (JSON/COLOR_PALETTES.json). Returns [] when no server is
	   configured or the file is missing / unreadable. */
	async loadColorPalettes(): Promise<PaletteColor[]> {
		const base = this.serverDiskBase()
		if (!base) return []
		try {
			const d = await this.readServerJson<{ Colors: PaletteColor[] }>(`${base}/JSON/COLOR_PALETTES.json`)
			return Array.isArray(d?.Colors) ? d.Colors : []
		} catch {
			return []
		}
	}

	/*
	 * Export LEAP assets for a team (modelled on parseLogosheet but driven by the builder grid, bypassing
	 * the parser). The host opens each AI (whose spots are already named), reads which marked spots are
	 * present, and exports AI/PNG/SVG; this then assembles SLS_LOGO_<team>.json (the same shape as the
	 * parser's) and writes it to JSON/TEAM_LOGOS/<League>/.
	 */
	async exportLeapAssets(input: {
		league: string
		teamCode: string
		teamColors: ExtractedColor[]
		customColors: ExtractedColor[]
		logoTypes: BuildLogoType[]
	}): Promise<{ ok: boolean; error?: string; exported: number; message?: string }> {
		if (!isCEP()) return { ok: false, error: 'Exporting LEAP assets is available inside Illustrator.', exported: 0 }
		if (!this.hasSession()) return { ok: false, error: 'No Illustrator session.', exported: 0 }
		const { league, teamCode } = input
		if (!league || !teamCode) return { ok: false, error: 'Choose a league and team first.', exported: 0 }
		const base = this.serverDiskBase()
		if (!base) return { ok: false, error: 'No server folder is configured.', exported: 0 }

		/* Team colours → token TC1..TCn; custom colours → token = their name. */
		const toSpot = (c: ExtractedColor, token: string): AssignedSpot => ({
			token,
			pantoneName: c.name,
			C: c.C, M: c.M, Y: c.Y, K: c.K,
			R: c.R, G: c.G, B: c.B,
			hex: c.hex,
		})
		const colors: AssignedSpot[] = [
			...input.teamColors.map((c, i) => toSpot(c, `TC${i + 1}`)),
			...input.customColors.map((c) => toSpot(c, c.name)),
		]

		const r = await getHost().logosheet.exportAssets({ league, teamCode, basePath: base, colors, logoTypes: input.logoTypes })
		for (const line of r.logs ?? []) logger.info('LeapAssets', line)
		if (!r.success || !r.data) {
			logger.error('LeapAssets', r.error ?? 'exportAssets failed')
			errLog('logosheet.exportAssets', new Error(r.error ?? 'exportAssets failed'), { league, team: teamCode })
			return { ok: false, error: r.error ?? 'Could not export LEAP assets.', exported: 0 }
		}

		try {
			const json = this.buildExportSlsLogoJson(r.data.logos, input.teamColors, input.customColors)
			const folder = `${base}/JSON/TEAM_LOGOS/${league}`
			ensureDir(folder)
			const ok = writeTextFile(`${folder}/SLS_LOGO_${teamCode}.json`, JSON.stringify(json, null, 4))
			if (!ok) return { ok: false, error: 'Could not write the SLS_LOGO JSON file.', exported: r.data.exported }
		} catch (e) {
			const msg = e instanceof Error ? e.message : String(e)
			logger.error('LeapAssets', msg)
			return { ok: false, error: msg, exported: r.data.exported }
		}

		logger.info('LeapAssets', `Exported ${league}-${teamCode}: ${r.data.exported} asset(s).`)
		/* ROI: LEAP assets exported for a team (AI/PNG/SVG + SLS_LOGO JSON). */
		roiLogEvent({
			action: 'exportLeapAssets',
			league,
			team: teamCode,
			extra: {
				exported: r.data.exported,
				serverPath: base,
				logoTypes: input.logoTypes.length,
				teamColors: input.teamColors.length,
				customColors: input.customColors.length,
				outputFile: `${base}/JSON/TEAM_LOGOS/${league}/SLS_LOGO_${teamCode}.json`,
			},
		})
		return { ok: true, exported: r.data.exported, message: `${r.data.exported} asset(s) exported` }
	}

	/* Assemble the on-disk SLS_LOGO_<team>.json from the exported records + the designer's colours. The
	   shape mirrors buildSlsLogoJson, but logos are keyed by their persistantCode (idempotent), grouped
	   by setName, and colours come from the chosen team/custom palette colours. */
	private buildExportSlsLogoJson(
		logos: ExportedLogoRecord[],
		teamColors: ExtractedColor[],
		customColors: ExtractedColor[],
	): Record<string, unknown> {
		const now = new Date()
		const time = `${now.toLocaleDateString()} ${now.toLocaleTimeString()}`
		/* Stable id from the persistantCode (sanitised) so re-exports overwrite the same entry. */
		const logoId = (code: string): string => `leap_logo_${String(code).toLowerCase().replace(/[^a-z0-9]+/g, '_')}`

		/* Group the records by setName, preserving first-seen order. */
		const order: string[] = []
		const bySet = new Map<string, ExportedLogoRecord[]>()
		for (const rec of logos) {
			if (!bySet.has(rec.setName)) {
				bySet.set(rec.setName, [])
				order.push(rec.setName)
			}
			bySet.get(rec.setName)!.push(rec)
		}

		const masterLogo = order.map((setName, idx) => ({
			SetName: setName,
			SetNameDesign: setName,
			Order: idx + 1,
			Rules: '',
			CreatedTime: time,
			UpdatedTime: time,
			BaseSizeAvailable: 'NO',
			MasterLogos: (bySet.get(setName) ?? []).map((v) => ({
				Id: logoId(v.persistantCode),
				FileName: v.fileNameAI,
				FileNamePNG: v.fileNamePNG,
				FileNameSVG: v.fileNameSVG,
				Type: v.type,
				Backgrounds: v.backgrounds,
				IsColor: '',
				IsReverseColor: '0',
				IsOneColor: '0',
				LogoVersionPersistantCode: v.persistantCode,
				LogoVersionColor: { LogoVersionColors: v.logoColors.map((c) => ({ PrimaryName: '', PantoneName: String(c).trim() })) },
				BaseSizeAvailable: 'NO',
				BaseSize: 'NA',
				BaseSizeDirection: 'NA',
				CenterShiftFromLeft: v.centerLogoInfo.CenterShiftFromLeft,
				CenterShiftFromLeftValue: v.centerLogoInfo.CenterShiftFromLeftValue,
				CenterShiftFromTop: v.centerLogoInfo.CenterShiftFromTop,
				CenterShiftFromTopValue: v.centerLogoInfo.CenterShiftFromTopValue,
			})),
		}))

		const toParseColor = (c: ExtractedColor, index: string): ParseColor => ({
			PantoneName: c.name,
			TeamColorIndex: index,
			TeamColorName: c.name,
			C: c.C, M: c.M, Y: c.Y, K: c.K,
			R: c.R, G: c.G, B: c.B,
			Hex: c.hex,
			TintColors: [],
		})

		return {
			MasterLogo: masterLogo,
			TeamColors: teamColors.map((c, i) => toParseColor(c, String(i + 1))),
			CustomColors: customColors.map((c) => toParseColor(c, '')),
		}
	}

	/* ---- Logosheet builder (create a logosheet from uploaded SVGs) ----------------------------- */

	/* Let the user pick multiple AI files; returns their disk paths ([] when cancelled / not CEP). */
	pickAiFiles(): string[] {
		return chooseFiles('Choose AI logos', ['ai'])
	}

	/* Let the user pick a folder; returns the .ai files found directly inside it. */
	pickAiFolder(): string[] {
		const dir = chooseFolder('Choose a folder of AI logos')
		if (!dir) return []
		return listFilesInFolder(fileUrlToDisk(dir), ['ai'])
	}

	/* List the .ai files directly inside a folder path (used for folder drag-drop). [] for a file path. */
	aiFilesIn(dir: string): string[] {
		return listFilesInFolder(fileUrlToDisk(dir), ['ai'])
	}

	/* Read a PNG file from disk into a data: URL (CEP). Returns '' on failure. */
	private pngToDataUrl(diskPath: string): string {
		const b64 = readFileBase64(diskPath)
		if (!b64) return ''
		return `data:image/png;base64,${b64}`
	}

	/*
	 * Extract spot/PANTONE colours + a rendered PNG thumbnail from each uploaded AI file. Returns each
	 * file with its disk path, basename, a data: URL of the rendered thumbnail, and its extracted spots.
	 * Returns no files outside CEP / on failure.
	 */
	async extractAiColors(paths: string[]): Promise<{ files: { path: string; name: string; dataUrl: string; spots: ExtractedColor[] }[] }> {
		if (!isCEP() || paths.length === 0) return { files: [] }
		const r = await getHost().logosheet.extractAiColors(paths)
		for (const line of r.logs ?? []) logger.info('ExtractAI', line)
		if (!r.success || !r.data) {
			logger.error('ExtractAI', r.error ?? 'extract failed')
			errLog('logosheet.extractAiColors', new Error(r.error ?? 'extract failed'), { files: paths.length })
			return { files: [] }
		}
		/* ROI: colours extracted from uploaded AI files (spot swatches read). */
		roiLogEvent({ action: 'extractAiColors', extra: { files: r.data.files.length } })
		return { files: r.data.files.map((f) => ({ path: f.path, name: f.name, dataUrl: this.pngToDataUrl(f.preview), spots: f.spots })) }
	}

	/* Read an SVG file into a data: URL for an <img> preview (CEP). External-ref SVGs return ''. */
	readSvgPreview(path: string): string {
		const disk = fileUrlToDisk(path)
		const text = readTextFile(disk)
		if (!text) return ''
		try {
			return `data:image/svg+xml;base64,${btoa(unescape(encodeURIComponent(text)))}`
		} catch {
			return ''
		}
	}

	/* Build a new logosheet document from the grid (rows = sets, columns = backgrounds). */
	async createLogosheet(args: BuildLogosheetArgs): Promise<{ ok: boolean; error?: string; placed?: number; missing?: number }> {
		if (!isCEP()) return { ok: false, error: 'Creating a logosheet is available inside Illustrator.' }
		const r = await getHost().logosheet.create(args)
		/* Forward the builder's step-by-step logs to the panel log folder for diagnosis. */
		for (const line of r.logs ?? []) logger.info('LogosheetBuild', line)
		if (!r.success || !r.data) {
			logger.error('LogosheetBuild', r.error ?? 'create failed')
			errLog('logosheet.create', new Error(r.error ?? 'create failed'))
			return { ok: false, error: r.error ?? 'Could not create the logosheet.' }
		}
		logger.info('LogosheetBuild', `Built ${r.data.artboards} artboard(s): ${r.data.placed} placed, ${r.data.missing} missing`)
		/* ROI: a new logosheet document built from the grid. */
		roiLogEvent({
			action: 'createLogosheet',
			extra: { artboards: r.data.artboards, placed: r.data.placed, missing: r.data.missing, serverPath: this.serverDiskBase() },
		})
		return { ok: true, placed: r.data.placed, missing: r.data.missing }
	}

	/*
	 * Save edited Team Info back to disk (legacy saveTeamInfo / updateObjectBasedOnteamId). Updates the
	 * matching keys in JSON/TEAM_DATA/<League>/SLS_TEAM_<code>.json and mirrors the team's entry in
	 * SLS_MASTER.json (e.g. FullName). React-side fs only. `edits` is keyed by SLS_TEAM JSON field name.
	 */
	saveTeamInfo(league: string, teamCode: string, edits: Record<string, string>): { ok: boolean; error?: string } {
		const base = this.serverDiskBase()
		if (!base) return { ok: false, error: 'No server folder is configured.' }
		try {
			/* Team file: update only keys that exist (case-insensitive), else add the field. */
			const teamPath = `${base}/JSON/TEAM_DATA/${league}/SLS_TEAM_${teamCode}.json`
			const teamRaw = readTextFile(teamPath)
			const team = (teamRaw ? JSON.parse(teamRaw) : {}) as Record<string, string>
			for (const ek of Object.keys(edits)) {
				const existing = Object.keys(team).find((k) => k.toLowerCase().trim() === ek.toLowerCase().trim())
				team[existing ?? ek] = edits[ek]
			}
			ensureDir(teamPath.replace(/\/[^/]*$/, ''))
			if (!writeTextFile(teamPath, JSON.stringify(team, null, 4))) return { ok: false, error: 'Could not write the team JSON.' }

			/* Mirror into SLS_MASTER.json (the team's entry — FullName etc.). */
			try {
				const master = this.readMaster()
				const leagueEntry = master.find((m) => m.Code.toLowerCase() === league.toLowerCase())
				const teamEntry = leagueEntry?.Teams.find((t) => t.TeamCode === teamCode) as Record<string, string> | undefined
				if (teamEntry) {
					for (const ek of Object.keys(edits)) {
						const existing = Object.keys(teamEntry).find((k) => k.toLowerCase().trim() === ek.toLowerCase().trim())
						if (existing) teamEntry[existing] = edits[ek]
					}
					writeTextFile(`${base}/JSON/SLS_MASTER.json`, JSON.stringify(master, null, 4))
				}
			} catch (e) {
				logger.warn('TeamInfo', `master mirror failed: ${e instanceof Error ? e.message : String(e)}`)
			}
			logger.info('TeamInfo', `Saved ${league}-${teamCode}`)
			/* ROI: edited team info saved back to the server JSON. */
			roiLogEvent({ action: 'saveTeamInfo', league, team: teamCode, extra: { fields: Object.keys(edits) } })
			return { ok: true }
		} catch (e) {
			const msg = e instanceof Error ? e.message : String(e)
			logger.error('TeamInfo', msg)
			errLog('saveTeamInfo', e, { league, team: teamCode })
			return { ok: false, error: msg }
		}
	}

	/* ---- Manage Logos (delete logo versions / whole sets from the server) ---------------------- */

	/* On-disk path of a team's SLS_LOGO JSON — the single record of which logos that team has. */
	private teamLogoJsonPath(base: string, league: string, teamCode: string): string {
		return `${base}/JSON/TEAM_LOGOS/${league}/SLS_LOGO_${teamCode}.json`
	}

	/* Stable identity of one logo version: the JSON `Id` the parser wrote, else set + file name. Built
	   the same way when listing and when deleting, so a selection always resolves to the same entry. */
	private managedLogoId(setName: string, v: RawManagedLogoVersion): string {
		return v.Id?.trim() || `${setName}::${v.FileName ?? v.FileNamePNG ?? ''}`
	}

	/*
	 * The team's logo sets as stored on the server, for the Manage Logos tab. Reads the same
	 * SLS_LOGO_<team>.json the catalog does, but keeps one row per *file* (a version) instead of
	 * expanding it per background colour — deleting is a per-file operation. Silent: a team with no
	 * parsed logosheet simply has no file, which the tab shows as an empty state.
	 */
	async loadLogoManifest(league: string, teamCode: string): Promise<ManagedLogoSet[]> {
		if (!league || !teamCode) return []
		const urlBase = await this.getLogobaseBasePath()
		if (!urlBase) return []
		let raw: RawManagedLogoFile
		try {
			raw = await this.readServerJson<RawManagedLogoFile>(`${urlBase}/JSON/TEAM_LOGOS/${league}/SLS_LOGO_${teamCode}.json`, { silent: true })
		} catch {
			return []
		}
		return (raw.MasterLogo ?? []).map((set) => {
			const setName = set.SetName ?? 'Logos'
			return {
				setName,
				updatedTime: set.UpdatedTime ?? '',
				logos: (set.MasterLogos ?? []).map((v) => {
					const png = v.FileNamePNG ?? (v.FileName ?? '').replace(/\.ai$/i, '.png')
					const pngUrl = `${urlBase}/LOGOS/${league}/${teamCode}/png/${png}`
					const svgUrl = v.FileNameSVG ? `${urlBase}/LOGOS/${league}/${teamCode}/svg/${v.FileNameSVG}` : ''
					return {
						id: this.managedLogoId(setName, v),
						setName,
						fileNameAI: v.FileName ?? '',
						fileNamePNG: png,
						fileNameSVG: v.FileNameSVG ?? '',
						type: v.Type ?? '',
						backgrounds: v.Backgrounds ?? [],
						previewUrl: svgUrl || pngUrl,
						previewFallbackUrl: pngUrl,
					}
				}),
			}
		})
	}

	/* Delete the given logo versions (ids from `loadLogoManifest`): their ai/png/svg files AND their
	   entries in SLS_LOGO_<team>.json. A set left with no versions is removed too. */
	deleteLogos(league: string, teamCode: string, ids: string[]): DeleteLogosResult {
		if (!ids.length) return { ok: true, removed: 0, filesDeleted: 0, filesMissing: 0, setsRemoved: 0 }
		const wanted: Record<string, true> = {}
		for (const id of ids) wanted[id] = true
		return this.removeLogosFromServer(league, teamCode, { logo: (_set, id) => wanted[id] === true }, `${ids.length} logo(s)`)
	}

	/* Delete a whole logo set: every version's files + the set's entry in SLS_LOGO_<team>.json. */
	deleteLogoSet(league: string, teamCode: string, setName: string): DeleteLogosResult {
		const target = setName.trim().toLowerCase()
		const isTarget = (name: string) => name.trim().toLowerCase() === target
		return this.removeLogosFromServer(league, teamCode, { logo: (set) => isTarget(set), set: isTarget }, `set "${setName}"`)
	}

	/*
	 * Shared delete path for Manage Logos. Order matters: the JSON is rewritten FIRST and files are only
	 * unlinked once that succeeded — a failed write therefore leaves the server exactly as it was rather
	 * than orphaning artwork. A file is kept if any surviving entry still references it (one file can be
	 * shared), and a file that was already gone is counted as missing, never reported as deleted.
	 */
	private removeLogosFromServer(
		league: string,
		teamCode: string,
		match: { logo: (setName: string, id: string) => boolean; set?: (setName: string) => boolean },
		label: string,
	): DeleteLogosResult {
		const fail = (error: string): DeleteLogosResult => ({ ok: false, error, removed: 0, filesDeleted: 0, filesMissing: 0, setsRemoved: 0 })
		if (!this.hasSession()) return fail('Deleting logos is available inside Illustrator.')
		const base = this.serverDiskBase()
		if (!base) return fail('No server folder is configured.')

		const jsonPath = this.teamLogoJsonPath(base, league, teamCode)
		try {
			const text = readTextFile(jsonPath)
			if (!text) return fail(`No logo data found for ${league}-${teamCode}.`)
			const data = JSON.parse(text) as RawManagedLogoFile & Record<string, unknown>

			const removed: RawManagedLogoVersion[] = []
			const keptSets: RawManagedLogoSet[] = []
			let setsRemoved = 0

			for (const set of data.MasterLogo ?? []) {
				const setName = set.SetName ?? 'Logos'
				const versions = set.MasterLogos ?? []
				const kept: RawManagedLogoVersion[] = []
				for (const v of versions) {
					if (match.logo(setName, this.managedLogoId(setName, v))) removed.push(v)
					else kept.push(v)
				}
				/* Drop the set when it was targeted outright, or when deleting emptied it. */
				if (match.set?.(setName) || (versions.length > 0 && kept.length === 0)) {
					setsRemoved++
					continue
				}
				keptSets.push({ ...set, MasterLogos: kept })
			}

			if (removed.length === 0 && setsRemoved === 0) return fail('Nothing matched — the logo list may be out of date. Refresh and try again.')

			/* Files any surviving entry still points at must NOT be deleted. */
			const stillReferenced: Record<string, true> = {}
			for (const set of keptSets) {
				for (const v of set.MasterLogos ?? []) {
					for (const name of [v.FileName, v.FileNamePNG, v.FileNameSVG]) if (name) stillReferenced[name] = true
				}
			}

			data.MasterLogo = keptSets
			if (!writeTextFile(jsonPath, JSON.stringify(data, null, 4))) {
				return fail('Could not update the SLS_LOGO JSON — nothing was deleted.')
			}

			const teamFolder = `${base}/LOGOS/${league}/${teamCode}`
			const handled: Record<string, true> = {}
			let filesDeleted = 0
			let filesMissing = 0
			for (const v of removed) {
				const files: [string, string | undefined][] = [
					['ai', v.FileName],
					['png', v.FileNamePNG],
					['svg', v.FileNameSVG],
				]
				for (const [sub, name] of files) {
					if (!name || stillReferenced[name]) continue
					const path = `${teamFolder}/${sub}/${name}`
					if (handled[path]) continue
					handled[path] = true
					if (deleteFile(path)) filesDeleted++
					else filesMissing++
				}
			}

			logger.info('ManageLogos', `Deleted ${label} from ${league}-${teamCode}: ${removed.length} entr(ies), ${filesDeleted} file(s), ${setsRemoved} set(s) removed, ${filesMissing} file(s) already missing.`)
			roiLogEvent({
				action: 'deleteLogos',
				league,
				team: teamCode,
				extra: { removed: removed.length, filesDeleted, filesMissing, setsRemoved, serverPath: base },
			})
			return { ok: true, removed: removed.length, filesDeleted, filesMissing, setsRemoved }
		} catch (e) {
			const msg = e instanceof Error ? e.message : String(e)
			logger.error('ManageLogos', msg)
			errLog('manageLogos.delete', e, { league, team: teamCode })
			return fail(msg)
		}
	}

	/* Assemble the on-disk SLS_LOGO_<team>.json (MasterLogo/TeamColors/CustomColors) from a parse result. */
	private buildSlsLogoJson(data: ParseResult): Record<string, unknown> {
		const now = new Date()
		const time = `${now.toLocaleDateString()} ${now.toLocaleTimeString()}`
		/* Random per-logo Id, prefixed leap_logo_ (e.g. leap_logo_mqd0vf1y2d1sv9). */
		const logoId = (): string => `leap_logo_${Date.now().toString(36)}${Math.random().toString(36).slice(2, 8)}`
		const masterLogo = data.logoSets.map((set) => ({
			SetName: set.name,
			SetNameDesign: set.SetNameDesign,
			Order: set.order,
			Rules: set.rules,
			CreatedTime: time,
			UpdatedTime: time,
			BaseSizeAvailable: set.logoVersions.some((v) => v.baseInfo) ? 'YES' : 'NO',
			MasterLogos: set.logoVersions.map((v) => ({
				Id: logoId(),
				FileName: v.fileNameAI,
				FileNamePNG: v.fileNamePNG,
				FileNameSVG: v.fileNameSVG,
				Type: v.type,
				/* Colour columns this single file serves (TC1…TCN / dkbgnd / ltbgnd). Lets one placed logo
				   represent multiple backgrounds without duplicating the file. */
				Backgrounds: v.backgrounds,
				IsColor: '',
				IsReverseColor: '0',
				IsOneColor: '0',
				LogoVersionPersistantCode: v.persistantCode,
				LogoVersionColor: { LogoVersionColors: v.logoColors.map((c) => ({ PrimaryName: '', PantoneName: String(c).trim() })) },
				BaseSizeAvailable: v.baseInfo ? 'YES' : 'NO',
				BaseSize: v.baseInfo ? v.baseInfo.baseSize : 'NA',
				BaseSizeDirection: v.baseInfo ? v.baseInfo.baseSizeDirection : 'NA',
				CenterShiftFromLeft: v.centerLogoInfo.CenterShiftFromLeft,
				CenterShiftFromLeftValue: v.centerLogoInfo.CenterShiftFromLeftValue,
				CenterShiftFromTop: v.centerLogoInfo.CenterShiftFromTop,
				CenterShiftFromTopValue: v.centerLogoInfo.CenterShiftFromTopValue,
			})),
		}))
		return {
			MasterLogo: masterLogo,
			TeamColors: data.teamColors as ParseColor[],
			/* Logo colours as their own list (separate from TeamColors), mirroring CustomColors. */
			LogoColors: (data.logoColors ?? []) as ParseColor[],
			CustomColors: data.customColors as ParseColor[],
		}
	}

	/* Inspect the active document for the panel's document-type switch (legacy checkIsLogoSheet):
	   whether a doc is open and whether it's a logosheet (+ its "<League>-<Team>" info). Returns a
	   safe default (no doc) when not in CEP or on failure. */
	async getActiveDocumentState(): Promise<ActiveDocumentState> {
		if (!this.hasSession()) return { docOpen: false, isLogoSheet: false, info: '' }
		const result = await getHost().document.checkActiveDocument()
		if (!result.success) {
			logger.warn('Document', result.error ?? 'checkActiveDocument failed')
			return { docOpen: false, isLogoSheet: false, info: '' }
		}
		return result.data ?? { docOpen: false, isLogoSheet: false, info: '' }
	}

	/*
	 * Run a document-backed Trademarks operation (add logo / add colours / apply mark name / parse
	 * logosheet / export league logo). This is the single seam the UI's action handlers call. The
	 * ExtendScript implementations are ported in the document-ops phase (`host/cep/documentOps.ts`);
	 * until then this logs and reports "not yet wired" so the UI can surface a consistent message
	 * instead of each view hard-coding it. Returns false (with reason) when there is no host session.
	 */
	async runDocumentOp(op: string, payload?: Record<string, unknown>): Promise<{ ok: boolean; error?: string; message?: string }> {
		logger.info('DocumentOp', `${op}${payload ? ' ' + JSON.stringify(payload) : ''}`)
		if (!this.hasSession()) return { ok: false, error: 'No Illustrator session' }

		if (op === 'addColors') {
			const colors = (payload?.colors as SwatchColor[] | undefined) ?? []
			const r = await getHost().documentOps.addColors(colors)
			if (!r.success) return { ok: false, error: r.error }
			const created = r.data?.created ?? 0
			roiLogEvent({ action: 'doc:addColors', extra: { created } })
			return { ok: true, message: created > 0 ? `${created} swatch${created === 1 ? '' : 'es'} added` : 'No new swatches' }
		}

		if (op === 'addLogo') {
			const league = String(payload?.league ?? '')
			const team = String(payload?.team ?? '')
			const file = String(payload?.file ?? '')
			if (!league || !team || !file) return { ok: false, error: 'Missing logo info' }
			/* The grid shows the .png; we place the matching .ai (legacy: <base>/LOGOS/<league>/<team>/ai/). */
			const aiName = file.replace(/\.png$/i, '.ai')
			const disk = fileUrlToDisk(await this.getLogobaseBasePath())
			const aiPath = `${disk}/LOGOS/${league}/${team}/ai/${aiName}`
			const note = {
				LeagueCode: league,
				TeamId: team,
				LogoVersionFileName: aiName,
				LogobaseObjectClass: 'SLSExplorerLogoInfo',
			}
			const r = await getHost().documentOps.addLogo(aiPath, note)
			if (!r.success) return { ok: false, error: r.error }
			roiLogEvent({ action: 'doc:addLogo', league, team, extra: { file: aiName } })
			return { ok: true, message: 'Logo added' }
		}

		if (op === 'applyMark') {
			const r = await getHost().documentOps.markSelection()
			if (!r.success) return { ok: false, error: r.error }
			const n = r.data?.marked ?? 0
			roiLogEvent({ action: 'doc:applyMark', extra: { marked: n } })
			return { ok: true, message: n === 1 ? `Marked as ${r.data?.names?.[0] ?? 'trademark'}` : `${n} marks applied` }
		}

		if (op === 'addLogoSet') {
			const disk = fileUrlToDisk(await this.getLogobaseBasePath())
			if (!disk) return { ok: false, error: 'No server folder is configured.' }
			const list = (payload?.logos as { league: string; team: string; file: string; C?: number; M?: number; Y?: number; K?: number }[] | undefined) ?? []
			const applyColor = !!payload?.applyColor
			const perArtboard = !!payload?.perArtboard
			const setName = String(payload?.setName ?? 'Logos')
			const items = list.map((l) => ({
				aiPath: `${disk}/LOGOS/${l.league}/${l.team}/ai/${String(l.file).replace(/\.png$/i, '.ai')}`,
				C: l.C, M: l.M, Y: l.Y, K: l.K,
			}))
			if (!items.length) return { ok: false, error: 'No logos to add' }
			const r = await getHost().documentOps.addLogoSet(items, applyColor, setName, perArtboard)
			if (!r.success) return { ok: false, error: r.error }
			const added = r.data?.added ?? 0
			const missing = r.data?.missing ?? 0
			roiLogEvent({ action: 'doc:addLogoSet', extra: { added, missing, applyColor, perArtboard } })
			return { ok: true, message: `${added} logo${added === 1 ? '' : 's'} added${missing ? ` (${missing} missing)` : ''}` }
		}

		/* Select the artwork behind a validation issue (payload.ids = Illustrator uuids). */
		if (op === 'selectItems') {
			const ids = ((payload?.ids as string[] | undefined) ?? []).filter(Boolean)
			if (!ids.length) return { ok: false, error: 'This issue has no object to select.' }
			const r = await getHost().documentOps.selectItems(ids)
			if (!r.success) return { ok: false, error: r.error }
			const selected = r.data?.selected ?? 0
			const missing = r.data?.missing ?? 0
			return { ok: true, message: `${selected} object${selected === 1 ? '' : 's'} selected${missing ? ` (${missing} not found)` : ''}` }
		}

		if (op === 'applyVerbiage') {
			const r = await getHost().documentOps.applyVerbiage(String(payload?.text ?? ''))
			if (!r.success) return { ok: false, error: r.error }
			roiLogEvent({ action: 'doc:applyVerbiage', extra: { applied: !!r.data?.applied } })
			return { ok: true, message: r.data?.applied ? 'Applied to text frame' : 'Copied' }
		}

		/* Other document ops (parse logosheet, export) land in later phases. */
		return { ok: false, error: 'pending' }
	}

	/*
	 * Read a JSON document for the catalog loader. In the browser (or a hosted http origin) this is a
	 * normal fetch. Inside Illustrator the Logobase path is a file:// URL that fetch cannot read, so we
	 * read it from disk via the host filesystem instead. This is the single environment branch the
	 * loader needs; everything else in data/catalog.ts is platform-agnostic.
	 */
	async readServerJson<T>(url: string, opts?: { silent?: boolean; expected?: boolean }): Promise<T> {
		try {
			const isHttp = url.indexOf('http://') === 0 || url.indexOf('https://') === 0
			if (isCEP() && !isHttp) {
				const text = readTextFile(url)
				if (text == null) throw new Error(`Could not read ${url}`)
				return JSON.parse(text) as T
			}
			const res = await fetch(url)
			if (!res.ok) throw new Error(`Failed to load ${url} (${res.status})`)
			return (await res.json()) as T
		} catch (e) {
			/* Central capture of every JSON load / parse failure (missing file, bad JSON, HTTP error) →
			   dashboard New Errors tab. Two opt-outs from a bare error:
			     - `silent`   : skip the POST entirely (a pure existence probe, e.g. hasCatalogData).
			     - `expected` : STILL POST it (so testing/support sees every failed read), but tag the
			                    payload `{ expected: true }` so a team's not-yet-parsed SLS_LOGO_*.json
			                    is distinguishable from a genuine corrupt-file error on the dashboard.
			   Rethrows so the caller's own handling (its .catch fallback) is unchanged. */
			if (!opts?.silent) errLog('readServerJson', e, { url, ...(opts?.expected ? { expected: true } : {}) })
			throw e
		}
	}

	/*
	 * True when the server has importable catalog data (a readable, non-empty SLS_MASTER.json). Used to
	 * tell "the server is mounted but empty" (offer Import Excel Data) apart from a genuine load error.
	 * Never throws — a missing/unreadable/empty master file resolves to false.
	 */
	async hasCatalogData(base: string): Promise<boolean> {
		try {
			/* Silent: this is a "does the server have data yet?" probe — a missing SLS_MASTER is an
			   expected "no data yet" state, not an error worth logging. */
			const master = await this.readServerJson<unknown>(`${base}/JSON/SLS_MASTER.json`, { silent: true })
			return Array.isArray(master) && master.length > 0
		} catch {
			return false
		}
	}

	/* ---- Import Excel Data ---------------------------------------------------------------------- */

	/* Plain on-disk base path of the active Logobase server (for fs reads/writes). '' when none. */
	private serverDiskBase(): string {
		return this.readServerPath() || this.getDataSettings().basePath || ''
	}

	/* Clean an object's keys (strip spaces & commas), trim values, and drop empty/duplicate keys. */
	private cleanRow(row: Record<string, unknown>): Record<string, string> {
		const out: Record<string, string> = {}
		for (const key of Object.keys(row)) {
			const cleanKey = key.replace(/[\s,]+/g, '')
			const value = row[key]
			const str = value == null ? '' : String(value).trim()
			if (cleanKey && !(cleanKey in out) && str !== '') out[cleanKey] = str
		}
		return out
	}

	/* Read the existing SLS_MASTER.json (array of league entries), or [] when missing/unreadable. */
	private readMaster(): MasterLeagueEntry[] {
		const base = this.serverDiskBase()
		if (!base) return []
		try {
			const text = readTextFile(`${base}/JSON/SLS_MASTER.json`)
			if (!text) return []
			const arr = JSON.parse(text) as MasterLeagueEntry[]
			return Array.isArray(arr) ? arr : []
		} catch (e) {
			/* SLS_MASTER.json exists but couldn't be parsed — a real data error worth surfacing. */
			errLog('readMaster', e, { file: `${base}/JSON/SLS_MASTER.json` })
			return []
		}
	}

	/* Let the user pick an Excel file, parse its Leagues + per-league team sheets, and build the merged
	   league row list for the import modal. Returns null when cancelled / not in CEP / unreadable. */
	chooseAndParseExcel(): ExcelImportSession | null {
		const filePath = chooseFile('Choose the LEAP data Excel file', ['xlsx', 'xls'])
		if (!filePath) return null
		const b64 = readFileBase64(filePath)
		if (!b64) {
			logger.error('Excel', `Could not read ${filePath}`)
			errLog('excel.read', new Error(`Could not read ${filePath}`))
			return null
		}
		try {
			const parsed = this.parseWorkbook(b64)
			return { filePath, parsed, rows: this.mergeLeagueRows(parsed) }
		} catch (e) {
			logger.error('Excel', e instanceof Error ? e.message : String(e))
			errLog('excel.parse', e, { file: filePath })
			return null
		}
	}

	/* Parse a base64 .xlsx: the "Leagues" sheet lists leagues; each league's own sheet holds its teams
	   (a sheet is treated as a league only when listed in the Leagues tab, legacy getLeaguesFromExcelFile). */
	private parseWorkbook(base64: string): ParsedLeague[] {
		const wb = XLSX.read(base64, { type: 'base64' })
		/* Convert superscript MD/MC runs to their dedicated glyphs before any sheet is flattened to JSON. */
		for (const sheetName of wb.SheetNames) this.normalizeFrenchTrademarks(wb.Sheets[sheetName])
		const leaguesSheetName = wb.SheetNames.find((n) => n.toLowerCase() === 'leagues')
		const leagueInfos: Record<string, string>[] = leaguesSheetName
			? (XLSX.utils.sheet_to_json(wb.Sheets[leaguesSheetName], { raw: false }) as Record<string, unknown>[]).map((r) => this.cleanRow(r))
			: []
		const infoByCode = new Map<string, Record<string, string>>()
		for (const info of leagueInfos) {
			const code = (info.League ?? info.Code ?? '').toString()
			if (code) infoByCode.set(code.toLowerCase().trim(), info)
		}
		const out: ParsedLeague[] = []
		for (const sheetName of wb.SheetNames) {
			const key = sheetName.toLowerCase().trim()
			if (key === 'leagues') continue
			const info = infoByCode.get(key)
			if (!info) continue
			const rawTeams = XLSX.utils.sheet_to_json(wb.Sheets[sheetName], { raw: false }) as Record<string, unknown>[]
			const teams = rawTeams.map((r) => this.cleanRow(r)).filter((t) => (t.TeamCode ?? '').trim() !== '')
			out.push({ code: sheetName, fullName: info.LeagueFullName ?? sheetName, sport: info.Sport ?? '', teamCount: teams.length, teams })
		}
		return out
	}

	/* Excel stores the Canadian-French trademark marks MD (Marque déposée = ®) and MC (Marque de
	   commerce = ™) as SUPERSCRIPT rich-text runs inside a cell (e.g. "Canadiens" + superscript "MD").
	   XLSX.utils.sheet_to_json flattens rich text and drops the superscript flag, turning a trademark
	   "MD" into plain letters indistinguishable from ordinary text downstream. This pre-pass runs on
	   the raw worksheet (before flattening) and rewrites each rich-text cell so a superscript "MD"/"MC"
	   run becomes its dedicated single Unicode glyph — U+1F16B (RAISED MD SIGN) / U+1F16A (RAISED MC
	   SIGN) — which is unambiguous and safely strippable downstream. Ported from the live panel
	   (BSC-1189). */
	private normalizeFrenchTrademarks(worksheet: XLSX.WorkSheet | undefined): void {
		if (!worksheet) return
		/* Astral code points must be built from UTF-16 surrogate pairs. */
		const RAISED_MD = String.fromCharCode(0xd83c, 0xdd6b) /* U+1F16B (Marque déposée) */
		const RAISED_MC = String.fromCharCode(0xd83c, 0xdd6a) /* U+1F16A (Marque de commerce) */
		const runSplit = /<(?:\w+:)?r>/g
		const textMatch = /<(?:\w+:)?t[^>]*>([\s\S]*?)<\/(?:\w+:)?t>/
		const superMatch = /<vertAlign\s+val="(?:superscript|super)"\s*\/?>/i

		for (const address of Object.keys(worksheet)) {
			if (address.charAt(0) === '!') continue /* worksheet metadata keys (!ref, !cols, …) */
			const cell = worksheet[address] as { v?: unknown; t?: string; r?: string; w?: string; h?: string }
			/* Only rich-text cells carry run markup in cell.r; plain cells have nothing to fix. */
			if (!cell || typeof cell.r !== 'string' || cell.r.indexOf('<vertAlign') === -1) continue

			const runs = cell.r.split(runSplit)
			let rebuilt = ''
			let changed = false
			for (const run of runs) {
				const tm = run.match(textMatch)
				if (!tm) continue
				let text = this.unescapeXml(tm[1])
				if (superMatch.test(run)) {
					if (text === 'MD') { text = RAISED_MD; changed = true }
					else if (text === 'MC') { text = RAISED_MC; changed = true }
				}
				rebuilt += text
			}

			if (changed) {
				cell.v = rebuilt
				cell.t = 's'
				/* Drop cached/flattened representations so sheet_to_json re-derives from the new cell.v. */
				delete cell.w
				delete cell.h
				delete cell.r
			}
		}
	}

	/* Minimal XML entity unescaper for rich-text run <t> contents. */
	private unescapeXml(value: string): string {
		return String(value)
			.replace(/&lt;/g, '<')
			.replace(/&gt;/g, '>')
			.replace(/&quot;/g, '"')
			.replace(/&apos;/g, "'")
			.replace(/&#x([0-9a-fA-F]+);/g, (_, hex: string) => String.fromCharCode(parseInt(hex, 16)))
			.replace(/&#(\d+);/g, (_, dec: string) => String.fromCharCode(parseInt(dec, 10)))
			.replace(/&amp;/g, '&')
	}

	/* Merge parsed Excel leagues with existing SLS_MASTER leagues into the ordered modal row list
	   (existing leagues first in their current order, then any new Excel leagues appended). */
	private mergeLeagueRows(parsed: ParsedLeague[]): ImportLeagueRow[] {
		const master = this.readMaster()
		const parsedByCode = new Map(parsed.map((p) => [p.code.toLowerCase(), p]))
		const rows: ImportLeagueRow[] = []
		const seen = new Set<string>()
		for (const ml of master) {
			const key = ml.Code.toLowerCase()
			const p = parsedByCode.get(key)
			rows.push({ code: ml.Code, name: p?.fullName ?? ml.Code, inExcel: !!p, inMaster: true, teamCount: p ? p.teamCount : ml.Teams.length })
			seen.add(key)
		}
		for (const p of parsed) {
			if (seen.has(p.code.toLowerCase())) continue
			rows.push({ code: p.code, name: p.fullName, inExcel: true, inMaster: false, teamCount: p.teamCount })
		}
		return rows
	}

	/* Incorporate the import: write team JSON files for each selected league and rebuild SLS_MASTER.json
	   in the user's chosen order. Selected Excel leagues replace their entry; unselected leagues keep
	   their existing entry; new unselected leagues are omitted. */
	incorporateExcelImport(args: { parsed: ParsedLeague[]; orderedCodes: string[]; selectedCodes: string[] }): { ok: boolean; error?: string; count: number } {
		const base = this.serverDiskBase()
		if (!base) return { ok: false, error: 'No server folder is configured.', count: 0 }
		const parsedByCode = new Map(args.parsed.map((p) => [p.code.toLowerCase(), p]))
		const existingByCode = new Map(this.readMaster().map((m) => [m.Code.toLowerCase(), m]))
		const selected = new Set(args.selectedCodes.map((c) => c.toLowerCase()))
		const newEntries = new Map<string, MasterLeagueEntry>()
		let count = 0
		try {
			for (const code of args.selectedCodes) {
				const p = parsedByCode.get(code.toLowerCase())
				if (!p) continue
				newEntries.set(code.toLowerCase(), this.writeLeagueTeams(base, p))
				count++
			}
			const master: MasterLeagueEntry[] = []
			for (const code of args.orderedCodes) {
				const key = code.toLowerCase()
				const entry = (selected.has(key) && newEntries.get(key)) || existingByCode.get(key)
				if (entry) master.push(entry)
			}
			ensureDir(`${base}/JSON`)
			if (!writeTextFile(`${base}/JSON/SLS_MASTER.json`, JSON.stringify(master, null, 4))) {
				errLog('excel.import.write', new Error('Could not write SLS_MASTER.json'))
				return { ok: false, error: 'Could not write SLS_MASTER.json', count }
			}
			logger.info('Excel', `Imported ${count} league(s); SLS_MASTER now has ${master.length}.`)
			/* ROI: the user imported catalog data from Excel (a major value action). */
			roiLogEvent({ action: 'importExcelData', extra: { leagues: count, total: master.length, leagueCodes: args.selectedCodes } })
			return { ok: true, count }
		} catch (e) {
			const msg = e instanceof Error ? e.message : String(e)
			logger.error('Excel', msg)
			errLog('excel.import', e)
			return { ok: false, error: msg, count }
		}
	}

	/* Write one league's per-team JSON files (into a clean folder), returning its SLS_MASTER entry. */
	private writeLeagueTeams(base: string, league: ParsedLeague): MasterLeagueEntry {
		const folder = `${base}/JSON/TEAM_DATA/${league.code}`
		removeDir(folder)
		ensureDir(folder)
		const entry: MasterLeagueEntry = { Code: league.code, Teams: [] }
		for (const team of league.teams) {
			const teamCode = (team.TeamCode ?? '').trim()
			if (!teamCode) continue
			const data: Record<string, string> = { ...team, Sport: league.sport, LeagueFullName: league.fullName }
			writeTextFile(`${folder}/SLS_TEAM_${teamCode}.json`, JSON.stringify(data, null, 4))
			entry.Teams.push({ TeamCode: teamCode, TeamGroup: team.TeamListGroup ?? '', FullName: team.FullName ?? '', TeamCity: team.TeamCity ?? '' })
		}
		return entry
	}

	/*
	 * Resolve a logo image URL for the panel. Over http(s) (browser dev / hosted) the URL is used
	 * as-is. Inside Illustrator the logos live on a file:// server path that CEF will not load as an
	 * <img> from an http origin, so we read the bytes via the host filesystem and return a data: URL.
	 * Falls back to the original src if the file can't be read. Used by LogoImage.
	 */
	async readServerImage(url: string): Promise<string> {
		const isHttp = url.indexOf('http://') === 0 || url.indexOf('https://') === 0 || url.indexOf('data:') === 0
		if (!isCEP() || isHttp) return url
		/* SVGs are read as text so we can detect external references. An SVG that links an external raster
		   or font (e.g. exported without embedding) renders blank from a data: URL, so we return '' to let
		   the caller fall back to the PNG. Self-contained SVGs are returned as a data: URL. */
		if (/\.svg$/i.test(url)) {
			const text = readTextFile(url)
			if (!text) return ''
			if (this.svgHasExternalRef(text)) return ''
			try {
				const b64 = btoa(unescape(encodeURIComponent(text)))
				return `data:image/svg+xml;base64,${b64}`
			} catch {
				return ''
			}
		}
		const b64 = readFileBase64(url)
		/* Empty string signals "couldn't read" so the caller (LogoImage) can try its raster fallback. */
		if (!b64) return ''
		return `data:image/png;base64,${b64}`
	}

	/* True when an SVG references an external file (image/font/use) that a data: URL can't resolve. */
	private svgHasExternalRef(svg: string): boolean {
		/* Any href / xlink:href that is not a data: URI or a same-doc fragment (#id). */
		const re = /(?:xlink:href|href)\s*=\s*["'](?!data:|#)[^"']+/i
		return re.test(svg)
	}

	/* Open the log folder in Finder/Explorer. Returns true on success. */
	async openLogsFolder(): Promise<boolean> {
		if (!this.hasSession()) return false
		const result = await getHost().log.openFolder()
		if (!result.success) {
			logger.warn('Logs', result.error ?? 'openFolder failed')
			return false
		}
		return true
	}

	/* Read the last `maxLines` log lines (for a future in-panel dashboard). */
	async readLog(maxLines = 200): Promise<string[]> {
		if (!this.hasSession()) return []
		const result = await getHost().log.read(maxLines)
		if (!result.success) {
			logger.warn('Logs', result.error ?? 'read failed')
			return []
		}
		return result.data?.lines ?? []
	}

	/* ---- Settings (panel environment) ----------------------------------------------------------- */

	/* Documents/…/Trademarks_Config.json — the file the CEP shell (redirect.html) reads on panel
	   start to decide which web-app origin to load. Null outside CEP (no Documents path in the browser). */
	private trademarksConfigPath(): string | null {
		const docs = getDocumentsPath()
		return docs ? `${docs}/${TrademarksConfig.DIR}/${TrademarksConfig.FILE}` : null
	}

	/* The channel currently saved for the shell, i.e. what loads on the NEXT panel start (which may
	   differ from the running one until Illustrator restarts). `environment` is the channel id the
	   shell re-resolves against the hosted registry; `origin` is its last resolved url (offline
	   fallback, and how pre-channel config files are still understood). Null when unavailable. */
	getSavedEnvironment(): { environment: string | null; origin: string | null } | null {
		const path = this.trademarksConfigPath()
		if (!path) return null
		try {
			const raw = readTextFile(path)
			if (!raw) return null
			const parsed = JSON.parse(raw) as { Environment?: string; Origin?: string }
			return { environment: parsed.Environment || null, origin: parsed.Origin || null }
		} catch (e) {
			logger.warn('Settings', `Could not read ${TrademarksConfig.FILE}: ${String(e)}`)
			return null
		}
	}

	/* Persist a channel switch. Only rewrites the redirect config — the running panel is untouched,
	   so the caller must tell the user an Illustrator restart is needed. The origin written here is
	   just the offline seed; the shell refreshes it from the hosted registry on every start. */
	setSavedEnvironment(environment: string, origin: string): boolean {
		const path = this.trademarksConfigPath()
		if (!path) return false
		ensureDir(`${getDocumentsPath()}/${TrademarksConfig.DIR}`)
		return writeTextFile(path, JSON.stringify({ Environment: environment, Origin: origin }, null, 2))
	}
}

const controller = new Controller()
export default controller
