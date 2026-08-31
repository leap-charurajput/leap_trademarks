/*
 * Domain types for the Trademarks panel UI. These mirror the field names used by the legacy
 * AngularJS controller (com.octane5.LEAPTrademarks) so the functionality phase can map host data
 * onto them with no churn. They are deliberately UI-shaped (what the panel renders), not a storage
 * schema — the on-disk/server schema lands with the host wiring (see docs/MIGRATION_PLAN.md).
 */

/* Background-colour token for a logo set. Team colours are open-ended (`tc1`, `tc2`, … `tcN`) plus the
   dark / light backgrounds — so a sheet can add Team Color 3/4/… with no code change. */
export type BgColorKey = `tc${number}` | 'dkbgnd' | 'ltbgnd'

/* Colour / logo list display mode (legacy `colorView`: listview | gridview). */
export type ColorView = 'list' | 'grid'

/* Main tabs (legacy `activeTab`: teamView | LeagueView | LeagueLogoView), plus the panel's own
   `manage` tab (Manage Logos — delete logo versions / sets from the server). */
export type TabId = 'teams' | 'league' | 'leagueLogos' | 'create' | 'manage'

/* A single team colour with its print metadata (legacy `colorData[]`). */
export interface ColorInfo {
	text: string
	value: string
	color: string
	Hex: string
	PantoneName: string
	C: number
	M: number
	Y: number
	K: number
	TeamColorIndex: string
}

/* A team and everything the panel shows about it (legacy `allTeamList[]` + colour/verbiage data). */
export interface Team {
	Id: string
	TeamCode: string
	FullName: string
	TeamName: string
	TeamCity: string
	ShortName: string
	EstablishedYear: string
	TeamConference: string
	TeamDivision: string
	primaryColorCode: string
	secondaryColorCode: string
	colors: ColorInfo[]
	verbiage: string[]
	logos: Logo[]
}

/* Keys of Team that the editable "Team Info" panel exposes. */
export type TeamInfoKey =
	| 'FullName'
	| 'TeamCity'
	| 'TeamName'
	| 'ShortName'
	| 'EstablishedYear'
	| 'TeamConference'
	| 'TeamDivision'

/* Label/key pairs driving the Team Info rows (legacy `showTeamProperties`). */
export interface TeamProperty {
	label: string
	key: TeamInfoKey
}

/* A logo image plus the colour/background context it belongs to (legacy logo objects). */
export interface Logo {
	id: string
	FileName: string
	SetName: string
	imgSrc: string
	/* Raster fallback used when imgSrc (e.g. an SVG) can't be loaded. Optional. */
	imgFallback?: string
	updatedTime: string
	colorInfo?: ColorInfo
	bgKey?: BgColorKey
	/* Colour name shown as a yellow badge on the thumbnail when loaded from the server (legacy tag). */
	colorName?: string
}

/* A named group of logos (legacy `logoSetsGroup` / `logoSetList`). */
export interface LogoSet {
	SetName: string
	UpdatedTime: string
	logos: Logo[]
}

/* A league and its teams (legacy `leagueData[]`). */
export interface League {
	Id: string
	Code: string
	Name: string
	teams: Team[]
	/* League-wide logos shown on the "League" tab. */
	leagueLogos: Logo[]
	/* Logos discovered in the league logos folder, shown on the "League Logos" tab. */
	leagueServerLogos: Logo[]
}

/* A pinned team chip (legacy `favouriteTeam[]`). */
export interface FavouriteTeam {
	teamID: string
	teamName: string
	leagueCode: string
	leagueCodeTeamName: string
}

/* A configured Logobase server folder (legacy `serverLists[]`). */
export interface ServerFolder {
	name: string
	path: string
	active: boolean
	enable: boolean
	folderExists: boolean
}

/* One selectable column in the Excel import dialog (legacy `selectedWorksheet.columns[]`). */
export interface WorksheetColumn {
	name: string
	selected: boolean
}

/* A worksheet offered for Excel import (legacy `global_LeaguesSheetNames[]`). */
export interface Worksheet {
	Code: string
	columns: WorksheetColumn[]
}
