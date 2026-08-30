/*
 * TrademarksContext — the single store for the panel's UI state during the UI-first phase.
 *
 * It seeds from `data/sampleData` so every view renders without a server, and exposes the same
 * selections the legacy AngularJS `$scope` held (league/team/tab/favourites/colour-view/logo-set/
 * background/edit-mode/servers/panel-state). All actions here are pure UI state today; host-backed
 * operations (add to document, export, parse, change server for real) are added in the functionality
 * phase and will replace the sample seed with `controller` data — this context's shape stays the same.
 *
 * It is plain React state (no host APIs), so it ports to UXP untouched.
 */
import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react'
import { SAMPLE_WORKSHEETS, TEAM_PROPERTIES } from '../data/sampleData'
import { loadCatalog } from '../data/catalog'
import controller, { type ExcelImportSession } from '../controller'
import { logger } from '@lib/logger'
import { getCSInterface, isCEP } from '@lib/helper'
import type {
	BgColorKey,
	ColorView,
	FavouriteTeam,
	League,
	ServerFolder,
	TabId,
	Team,
	TeamInfoKey,
	TeamProperty,
	Worksheet,
} from '../data/types'

/* Which top-level screen the panel shows. Mirrors the legacy overlay/welcome/warning states so we
   can build and preview every view; defaults to the working panel ("ready"). */
export type PanelState = 'loading' | 'auth' | 'unrecognized' | 'welcome' | 'noServer' | 'ready'

/* The kind of Illustrator document open, which decides what the panel shows (legacy isLogoSheet /
   isDocOpen): a logosheet → the logosheet parser; a normal document → the team panel; none → a prompt. */
export type DocType = 'team' | 'logosheet' | 'none'

/* Flyout toggle settings persisted locally (legacy menu checkboxes). */
export interface GeneralSettings {
	labSwatches: boolean
}

const GENERAL_STORAGE_KEY = 'leap.trademarks.general'

/* Placeholder selections used only while the catalog is loading; the loading overlay hides them, so
   they are never displayed. Keeps `selectedLeague`/`selectedTeam` non-null for consumers. */
const EMPTY_TEAM: Team = {
	Id: '', TeamCode: '', FullName: '', TeamName: '', TeamCity: '', ShortName: '', EstablishedYear: '',
	TeamConference: '', TeamDivision: '', primaryColorCode: '#000000', secondaryColorCode: '#000000',
	colors: [], verbiage: [], logos: [],
}
const EMPTY_LEAGUE: League = { Id: '', Code: '', Name: '', teams: [EMPTY_TEAM], leagueLogos: [], leagueServerLogos: [] }

interface TrademarksContextValue {
	leagues: League[]
	teamProperties: TeamProperty[]
	worksheets: Worksheet[]

	/* Catalog load (legacy initLoader): JSON + logos from the Logobase server path. */
	dataLoading: boolean
	dataError: string | null
	serverMissing: boolean
	/* Server is mounted but has no SLS_MASTER.json data yet — prompt the user to Import Excel Data. */
	noData: boolean
	reload: () => void

	/* Selections. */
	selectedLeague: League
	selectedTeam: Team
	setLeague: (code: string) => void
	setTeam: (teamCode: string) => void
	selectFavourite: (leagueCode: string, teamCode: string) => void
	prevTeam: () => void
	nextTeam: () => void

	activeTab: TabId
	setActiveTab: (tab: TabId) => void

	/* Favourites. */
	favourites: FavouriteTeam[]
	isFavourite: (teamCode: string) => boolean
	toggleFavourite: () => void
	removeFavourite: (leagueCodeTeamName: string) => void

	/* Colours / logos display. */
	colorView: ColorView
	setColorView: (v: ColorView) => void
	selectedBgColor: BgColorKey
	setBgColor: (k: BgColorKey) => void
	logoSetNames: string[]
	selectedLogoSet: string
	setLogoSet: (name: string) => void
	logosForSelectedSet: Team['logos']

	/* Team Info editing (local only this phase). */
	editMode: boolean
	editedTeam: Team
	beginEdit: () => void
	cancelEdit: () => void
	/* Persist edited Team Info to disk (SLS_TEAM + SLS_MASTER) and commit in-memory. */
	saveEdit: () => { ok: boolean; error?: string }
	setEditedField: (key: TeamInfoKey, value: string) => void

	/* Servers. */
	servers: ServerFolder[]
	currentServer: ServerFolder | undefined
	changeServer: (path: string) => void
	addServerFolder: () => boolean
	removeServer: (path: string) => void
	toggleServer: (path: string) => void
	openServerFolder: (path: string) => boolean

	/* Flyout toggles. */
	general: GeneralSettings
	toggleGeneral: (key: keyof GeneralSettings) => void

	/* Overlays / modals / panel state. */
	panelState: PanelState
	setPanelState: (s: PanelState) => void
	docType: DocType
	setDocType: (d: DocType) => void
	logoSheetInfo: string
	isBrowserDev: boolean
	excelOpen: boolean
	setExcelOpen: (open: boolean) => void
	/* The Excel chosen for import (file + parsed leagues + merged league rows), or null. */
	importSession: ExcelImportSession | null
	/* Prompt for an Excel file, parse it, and open the import modal. Returns false when no file was
	   chosen / parsed (caller can toast — e.g. browser dev has no native picker). */
	startExcelImport: () => boolean
	manageServersOpen: boolean
	setManageServersOpen: (open: boolean) => void
	aboutOpen: boolean
	setAboutOpen: (open: boolean) => void
	dataSettingsOpen: boolean
	setDataSettingsOpen: (open: boolean) => void
}

const TrademarksContext = createContext<TrademarksContextValue | null>(null)

/* Read persisted flyout toggles, defaulting everything off. */
function readGeneral(): GeneralSettings {
	try {
		const raw = window.localStorage.getItem(GENERAL_STORAGE_KEY)
		if (raw) return { labSwatches: false, ...(JSON.parse(raw) as Partial<GeneralSettings>) }
	} catch {
		/* ignore */
	}
	return { labSwatches: false }
}

/* Show a plain on-disk path (strip any legacy file:// prefix + decode) so the UI never shows
   "file:///Users/…". */
function displayPath(p: string): string {
	if (p.indexOf('file://') !== 0) return p
	const stripped = p.replace(/^file:\/\//, '')
	try {
		return decodeURI(stripped)
	} catch {
		return stripped
	}
}

/* Read the configured server folders from the controller's data settings. When nothing is configured
   the list is empty; the active server_path.json provides the sole default via the controller. */
function settingsToServers(): ServerFolder[] {
	const configured = controller.getDataSettings().servers
	return configured.map((x) => ({ name: x.name, path: displayPath(x.path), enable: x.enable, active: x.active, folderExists: true }))
}

export function TrademarksProvider({ children }: { children: ReactNode }) {
	const [leagues, setLeagues] = useState<League[]>([])
	const [dataLoading, setDataLoading] = useState(true)
	const [dataError, setDataError] = useState<string | null>(null)
	const [serverMissing, setServerMissing] = useState(false)
	const [noData, setNoData] = useState(false)

	const [selectedLeagueCode, setSelectedLeagueCode] = useState('')
	const selectedLeague = useMemo(
		() => leagues.find((l) => l.Code === selectedLeagueCode) ?? leagues[0] ?? EMPTY_LEAGUE,
		[leagues, selectedLeagueCode],
	)

	const [selectedTeamCode, setSelectedTeamCode] = useState('')
	const selectedTeam = useMemo(
		() => selectedLeague.teams.find((t) => t.TeamCode === selectedTeamCode) ?? selectedLeague.teams[0] ?? EMPTY_TEAM,
		[selectedLeague, selectedTeamCode],
	)

	/* Load the catalog (leagues + teams + logos) from the Logobase server path on mount (legacy
	   initLoader). Defaults the league/team selection to the first entry once loaded. */
	const loadData = useCallback(() => {
		setDataLoading(true)
		setDataError(null)
		void (async () => {
			try {
				const base = await controller.getLogobaseBasePath()
				if (!base) {
					setServerMissing(true)
					setDataLoading(false)
					return
				}
				setServerMissing(false)
				/* Server is mounted but has no SLS_MASTER.json yet → friendly "no data" screen with an
				   Import Excel Data button, instead of a raw "Could not read …" error. */
				if (!(await controller.hasCatalogData(base))) {
					setNoData(true)
					setLeagues([])
					setDataLoading(false)
					return
				}
				setNoData(false)
				const data = await loadCatalog(base, (url, opts) => controller.readServerJson(url, opts))
				if (data.length === 0) {
					setNoData(true)
					setLeagues([])
					setDataLoading(false)
					return
				}
				setLeagues(data)
				setSelectedLeagueCode(data[0].Code)
				setSelectedTeamCode(data[0].teams[0]?.TeamCode ?? '')
				logger.info('Catalog', `Loaded ${data.length} leagues from ${base}`)
				/* ROI: the catalog (a server's leagues + teams) finished loading — i.e. SLS_MASTER.json plus
				   every team's SLS_TEAM / SLS_LOGO JSON. Carry FULL context so a developer / support person
				   can tell exactly WHICH server + dataset the user opened (not just "it loaded"):
				   the server path, the leagues loaded (with per-league team counts), and the totals. */
				const teamsTotal = data.reduce((n, l) => n + l.teams.length, 0)
				controller.logEvent('catalogLoaded', {
					serverPath: base,
					leagues: data.length,
					teams: teamsTotal,
					leagueCodes: data.map((l) => l.Code),
					perLeagueTeams: data.map((l) => ({ code: l.Code, teams: l.teams.length })),
				})
			} catch (e) {
				const msg = e instanceof Error ? e.message : String(e)
				setDataError(msg)
				logger.error('Catalog', msg)
				/* Surface the catalog-load failure on the dashboard's New Errors tab. */
				controller.logError('catalog.load', e)
			} finally {
				setDataLoading(false)
			}
		})()
	}, [])

	useEffect(() => {
		loadData()
	}, [loadData])

	const [activeTab, setActiveTab] = useState<TabId>('teams')
	/* Seed favourites from the persisted store (favourites.json / localStorage) so they survive an
	   Illustrator restart. */
	const [favourites, setFavourites] = useState<FavouriteTeam[]>(() => controller.readFavourites())
	const [colorView, setColorView] = useState<ColorView>('list')
	const [selectedBgColor, setBgColor] = useState<BgColorKey>('tc1')
	const [selectedLogoSet, setSelectedLogoSet] = useState<string>('Primary Logo')

	const [editMode, setEditMode] = useState(false)
	const [editedTeam, setEditedTeam] = useState<Team>(selectedTeam)

	const [servers, setServers] = useState<ServerFolder[]>(settingsToServers)
	const [general, setGeneral] = useState<GeneralSettings>(readGeneral)

	const [panelState, setPanelState] = useState<PanelState>('ready')
	const [docType, setDocType] = useState<DocType>('team')
	const [logoSheetInfo, setLogoSheetInfo] = useState<string>('NFL-DAL')

	/* Track the active Illustrator document (legacy documentAfterActivate → checkIsLogoSheet): show the
	   Logosheet view for a logosheet, the team UI for any other open doc, and the "open a document"
	   prompt when none is open. CEP only — in browser dev the DevStateBar drives docType instead. */
	useEffect(() => {
		if (!isCEP()) return
		const cs = getCSInterface()
		if (!cs) return
		const refresh = () => {
			void controller.getActiveDocumentState().then((s) => {
				if (!s.docOpen) {
					setLogoSheetInfo('')
					setDocType('none')
				} else if (s.isLogoSheet) {
					setLogoSheetInfo(s.info)
					setDocType('logosheet')
				} else {
					setLogoSheetInfo('')
					setDocType('team')
				}
			})
		}
		refresh()
		cs.addEventListener('documentAfterActivate', refresh)
		return () => cs.removeEventListener?.('documentAfterActivate', refresh)
	}, [])
	const [excelOpen, setExcelOpen] = useState(false)
	const [importSession, setImportSession] = useState<ExcelImportSession | null>(null)

	/* Prompt for an Excel file, parse it, and open the import modal with the parsed leagues. */
	const startExcelImport = useCallback((): boolean => {
		const session = controller.chooseAndParseExcel()
		if (!session) return false
		setImportSession(session)
		setExcelOpen(true)
		return true
	}, [])
	const [manageServersOpen, setManageServersOpen] = useState(false)
	const [aboutOpen, setAboutOpen] = useState(false)
	const [dataSettingsOpen, setDataSettingsOpen] = useState(false)

	/* When the league changes, snap the team selection to its first team. */
	const setLeague = useCallback((code: string) => {
		setSelectedLeagueCode(code)
		const next = leagues.find((l) => l.Code === code)
		if (next && next.teams[0]) setSelectedTeamCode(next.teams[0].TeamCode)
		setEditMode(false)
	}, [leagues])

	const setTeam = useCallback((teamCode: string) => {
		setSelectedTeamCode(teamCode)
		setEditMode(false)
	}, [])

	/* Jump to a favourite: switch to its league first (if different), then select the team — so a
	   favourite from another league resolves correctly. */
	const selectFavourite = useCallback((leagueCode: string, teamCode: string) => {
		setSelectedLeagueCode(leagueCode)
		setSelectedTeamCode(teamCode)
		setEditMode(false)
	}, [])

	/* Step to the previous / next team within the current league (legacy #prevTeam / #nextTeam). */
	const stepTeam = useCallback((delta: number) => {
		setSelectedTeamCode((current) => {
			const teams = selectedLeague.teams
			const idx = teams.findIndex((t) => t.TeamCode === current)
			const nextIdx = (idx + delta + teams.length) % teams.length
			return teams[nextIdx]?.TeamCode ?? current
		})
		setEditMode(false)
	}, [selectedLeague])
	const prevTeam = useCallback(() => stepTeam(-1), [stepTeam])
	const nextTeam = useCallback(() => stepTeam(1), [stepTeam])

	/* Keep the editable buffer in sync with the selected team while not editing. */
	useEffect(() => {
		if (!editMode) setEditedTeam(selectedTeam)
	}, [selectedTeam, editMode])

	const logoSetNames = useMemo(() => {
		const seen: string[] = []
		for (const logo of selectedTeam.logos) {
			if (!seen.includes(logo.SetName)) seen.push(logo.SetName)
		}
		return seen
	}, [selectedTeam])

	/* Keep the selected logo set valid for the current team (set names differ per team/server). */
	useEffect(() => {
		if (logoSetNames.length && !logoSetNames.includes(selectedLogoSet)) {
			setSelectedLogoSet(logoSetNames[0])
		}
	}, [logoSetNames, selectedLogoSet])

	/* Logos in the selected set, filtered to the chosen background colour (legacy
	   logosForSelectedSetBasedOnBgColor). */
	const logosForSelectedSet = useMemo(
		() => selectedTeam.logos.filter((l) => l.SetName === selectedLogoSet && l.bgKey === selectedBgColor),
		[selectedTeam, selectedLogoSet, selectedBgColor],
	)

	const favKey = (leagueCode: string, team: Team) => `${leagueCode}-${team.FullName}`

	const isFavourite = useCallback(
		(teamCode: string) => favourites.some((f) => f.teamID === teamCode && f.leagueCode === selectedLeagueCode),
		[favourites, selectedLeagueCode],
	)

	const toggleFavourite = useCallback(() => {
		setFavourites((prev) => {
			const key = favKey(selectedLeagueCode, selectedTeam)
			if (prev.some((f) => f.leagueCodeTeamName === key)) {
				return prev.filter((f) => f.leagueCodeTeamName !== key)
			}
			return [
				...prev,
				{
					teamID: selectedTeam.TeamCode,
					teamName: selectedTeam.FullName,
					leagueCode: selectedLeagueCode,
					leagueCodeTeamName: key,
				},
			]
		})
	}, [selectedLeagueCode, selectedTeam])

	const removeFavourite = useCallback((leagueCodeTeamName: string) => {
		setFavourites((prev) => prev.filter((f) => f.leagueCodeTeamName !== leagueCodeTeamName))
	}, [])

	/* Persist favourites whenever they change, so the star selection is restored on the next launch. */
	useEffect(() => {
		controller.saveFavourites(favourites)
	}, [favourites])

	const beginEdit = useCallback(() => {
		setEditedTeam(selectedTeam)
		setEditMode(true)
	}, [selectedTeam])

	const cancelEdit = useCallback(() => {
		setEditedTeam(selectedTeam)
		setEditMode(false)
	}, [selectedTeam])

	/* Map the editable Team fields (UI keys) to the on-disk SLS_TEAM JSON keys. */
	const saveEdit = useCallback((): { ok: boolean; error?: string } => {
		const map: Record<TeamInfoKey, string> = {
			FullName: 'FullName',
			TeamCity: 'TeamCity',
			TeamName: 'TeamName',
			ShortName: 'Nickname',
			EstablishedYear: 'EstablishedYear',
			TeamConference: 'TeamConference',
			TeamDivision: 'Division',
		}
		const edits: Record<string, string> = {}
		const uiKeys = Object.keys(map) as TeamInfoKey[]
		for (const k of uiKeys) edits[map[k]] = String(editedTeam[k] ?? '')

		const res = controller.saveTeamInfo(selectedLeagueCode, selectedTeam.TeamCode, edits)
		if (res.ok) {
			/* Commit the edits into the in-memory catalog so the panel reflects them without a reload. */
			const patched: Partial<Team> = {}
			for (const k of uiKeys) (patched as Record<string, string>)[k] = String(editedTeam[k] ?? '')
			setLeagues((prev) =>
				prev.map((l) =>
					l.Code !== selectedLeagueCode
						? l
						: { ...l, teams: l.teams.map((tm) => (tm.TeamCode === selectedTeam.TeamCode ? { ...tm, ...patched } : tm)) },
				),
			)
			setEditMode(false)
		}
		return res
	}, [editedTeam, selectedLeagueCode, selectedTeam])

	const setEditedField = useCallback((key: TeamInfoKey, value: string) => {
		setEditedTeam((prev) => ({ ...prev, [key]: value }))
	}, [])

	/* Switch the active Logobase server folder (Choose…): persist the choice and reload the catalog. */
	const changeServer = useCallback((path: string) => {
		controller.setActiveServer(path)
		setServers((prev) => prev.map((s) => ({ ...s, active: s.path === path })))
		loadData()
	}, [loadData])

	/* Pick a new Logobase data folder (LEAP Data Settings / Manage "Add Folder"): set it active and
	   reload. No-op (returns false) in the browser, where there is no native folder picker. */
	const addServerFolder = useCallback(() => {
		const picked = controller.chooseDataFolder()
		if (!picked) return false
		setServers(settingsToServers())
		loadData()
		return true
	}, [loadData])

	/* Remove a configured server folder from the settings. */
	const removeServer = useCallback((path: string) => {
		const ds = controller.getDataSettings()
		const next = ds.servers.filter((x) => x.path !== path)
		controller.saveDataSettings({ ...ds, servers: next, basePath: next.some((x) => x.active) ? ds.basePath : '' })
		setServers(settingsToServers())
	}, [])

	/* Enable / disable a configured server folder. */
	const toggleServer = useCallback((path: string) => {
		const ds = controller.getDataSettings()
		const next = ds.servers.map((x) => (x.path === path ? { ...x, enable: !x.enable } : x))
		controller.saveDataSettings({ ...ds, servers: next })
		setServers(settingsToServers())
	}, [])

	/* Open a server folder in Finder/Explorer. */
	const openServerFolder = useCallback((path: string) => controller.openFolder(path), [])

	const currentServer = useMemo(() => servers.find((s) => s.active), [servers])

	const toggleGeneral = useCallback((key: keyof GeneralSettings) => {
		setGeneral((prev) => {
			const next = { ...prev, [key]: !prev[key] }
			try {
				window.localStorage.setItem(GENERAL_STORAGE_KEY, JSON.stringify(next))
			} catch {
				/* ignore */
			}
			return next
		})
	}, [])

	const value = useMemo<TrademarksContextValue>(
		() => ({
			leagues,
			teamProperties: TEAM_PROPERTIES,
			worksheets: SAMPLE_WORKSHEETS,
			dataLoading,
			dataError,
			serverMissing,
			noData,
			reload: loadData,
			selectedLeague,
			selectedTeam,
			setLeague,
			setTeam,
			selectFavourite,
			prevTeam,
			nextTeam,
			activeTab,
			setActiveTab,
			favourites,
			isFavourite,
			toggleFavourite,
			removeFavourite,
			colorView,
			setColorView,
			selectedBgColor,
			setBgColor,
			logoSetNames,
			selectedLogoSet,
			setLogoSet: setSelectedLogoSet,
			logosForSelectedSet,
			editMode,
			editedTeam,
			beginEdit,
			cancelEdit,
			saveEdit,
			setEditedField,
			servers,
			currentServer,
			changeServer,
			addServerFolder,
			removeServer,
			toggleServer,
			openServerFolder,
			general,
			toggleGeneral,
			panelState,
			setPanelState,
			docType,
			setDocType,
			logoSheetInfo,
			isBrowserDev: !isCEP(),
			excelOpen,
			setExcelOpen,
			importSession,
			startExcelImport,
			manageServersOpen,
			setManageServersOpen,
			aboutOpen,
			setAboutOpen,
			dataSettingsOpen,
			setDataSettingsOpen,
		}),
		[
			dataLoading, dataError, serverMissing, noData, loadData,
			leagues, selectedLeague, selectedTeam, setLeague, setTeam, selectFavourite, prevTeam, nextTeam, activeTab, favourites, isFavourite,
			toggleFavourite, removeFavourite, colorView, selectedBgColor, logoSetNames, selectedLogoSet,
			logosForSelectedSet, editMode, editedTeam, beginEdit, cancelEdit, saveEdit, setEditedField, servers, currentServer,
			changeServer, addServerFolder, removeServer, toggleServer, openServerFolder, general, toggleGeneral, panelState, docType, logoSheetInfo, excelOpen, importSession, startExcelImport, manageServersOpen, aboutOpen, dataSettingsOpen,
		],
	)

	return <TrademarksContext.Provider value={value}>{children}</TrademarksContext.Provider>
}

export function useTrademarks(): TrademarksContextValue {
	const ctx = useContext(TrademarksContext)
	if (!ctx) throw new Error('useTrademarks must be used within a TrademarksProvider')
	return ctx
}
