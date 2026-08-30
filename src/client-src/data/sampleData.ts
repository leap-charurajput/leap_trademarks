/*
 * Sample data for the UI-first phase. This is realistic placeholder content (three leagues, a handful
 * of teams, colours, verbiage and logos) so every view renders without a server. Logo thumbnails are
 * inline SVG data-URIs generated here, so the panel is fully self-contained (no asset files yet).
 *
 * The functionality phase replaces this module with host-loaded data via `controller` — the UI and
 * the TrademarksContext shape do not change. See docs/MIGRATION_PLAN.md.
 */
import type { BgColorKey, ColorInfo, League, ServerFolder, Team, TeamProperty, Worksheet } from './types'

/* The editable Team Info rows (legacy `showTeamProperties`). */
export const TEAM_PROPERTIES: TeamProperty[] = [
	{ label: 'Full Name', key: 'FullName' },
	{ label: 'City Name', key: 'TeamCity' },
	{ label: 'Team Name', key: 'TeamName' },
	{ label: 'Short Name', key: 'ShortName' },
	{ label: 'Est. Year', key: 'EstablishedYear' },
	{ label: 'Conference', key: 'TeamConference' },
	{ label: 'Division', key: 'TeamDivision' },
]

/* The four logo-set background swatches shown on the League tab (legacy bg-color buttons). */
export const BG_COLOR_KEYS: BgColorKey[] = ['tc1', 'tc2', 'dkbgnd', 'ltbgnd']

let logoSeq = 0

/* Build a small inline SVG logo thumbnail as a data-URI (placeholder for a real exported logo). */
function makeLogo(label: string, fg: string, bg: string): string {
	const svg =
		`<svg xmlns="http://www.w3.org/2000/svg" width="96" height="96" viewBox="0 0 96 96">` +
		`<rect width="96" height="96" fill="${bg}"/>` +
		`<circle cx="48" cy="40" r="24" fill="none" stroke="${fg}" stroke-width="4"/>` +
		`<text x="48" y="47" font-family="Arial" font-size="20" font-weight="bold" fill="${fg}" ` +
		`text-anchor="middle">${label}</text>` +
		`<text x="48" y="80" font-family="Arial" font-size="11" fill="${fg}" text-anchor="middle">TM</text>` +
		`</svg>`
	return `data:image/svg+xml;utf8,${encodeURIComponent(svg)}`
}

/* Compose a ColorInfo from a hex + name (CMYK values are illustrative placeholders). */
function color(text: string, hex: string, pantone: string, idx: number, cmyk: [number, number, number, number]): ColorInfo {
	return {
		text,
		value: text,
		color: hex,
		Hex: hex,
		PantoneName: pantone,
		C: cmyk[0],
		M: cmyk[1],
		Y: cmyk[2],
		K: cmyk[3],
		TeamColorIndex: String(idx),
	}
}

/* Build a team with its colours, verbiage and a set of logos across the bg-colour variants. */
function makeTeam(args: {
	code: string
	city: string
	name: string
	established: string
	conference: string
	division: string
	colors: ColorInfo[]
}): Team {
	const { code, city, name, established, conference, division, colors } = args
	const fullName = `${city} ${name}`
	const primary = colors[0]
	const secondary = colors[1] ?? colors[0]

	const bgFor = (key: BgColorKey): { color: ColorInfo; bg: string } => {
		switch (key) {
			case 'tc1':
				return { color: primary, bg: primary.Hex }
			case 'tc2':
				return { color: secondary, bg: secondary.Hex }
			case 'dkbgnd':
				return { color: primary, bg: '#1d1d1d' }
			case 'ltbgnd':
				return { color: primary, bg: '#f4f4f4' }
			default:
				return { color: primary, bg: primary.Hex }
		}
	}

	const setNames = ['Primary Logo', 'Secondary Logo', 'Wordmark']
	const logos = setNames.flatMap((setName, si) =>
		BG_COLOR_KEYS.map((key) => {
			const { color: ci, bg } = bgFor(key)
			const fg = key === 'ltbgnd' ? '#1d1d1d' : '#ffffff'
			const id = `logo-${++logoSeq}`
			return {
				id,
				FileName: `${code.toLowerCase()}_${setName.split(' ')[0].toLowerCase()}_${key}.ai`,
				SetName: setName,
				imgSrc: makeLogo(code, si === 2 ? ci.Hex : fg, bg),
				updatedTime: '2026-05-21 10:30',
				colorInfo: ci,
				bgKey: key,
			}
		}),
	)

	return {
		Id: `team-${code}`,
		TeamCode: code,
		FullName: fullName,
		TeamName: name,
		TeamCity: city,
		ShortName: code,
		EstablishedYear: established,
		TeamConference: conference,
		TeamDivision: division,
		primaryColorCode: primary.Hex,
		secondaryColorCode: secondary.Hex,
		colors,
		verbiage: [fullName, name, city, code, `${conference} ${division}`, established],
		logos,
	}
}

const NFL: League = {
	Id: 'l-nfl',
	Code: 'NFL',
	Name: 'National Football League',
	leagueLogos: [],
	leagueServerLogos: [],
	teams: [
		makeTeam({
			code: 'DAL', city: 'Dallas', name: 'Cowboys', established: '1960', conference: 'NFC', division: 'East',
			colors: [
				color('Navy', '#003594', 'PMS 281', 1, [100, 80, 0, 20]),
				color('Silver', '#869397', 'PMS 429', 2, [10, 5, 5, 40]),
				color('White', '#ffffff', 'White', 3, [0, 0, 0, 0]),
			],
		}),
		makeTeam({
			code: 'GB', city: 'Green Bay', name: 'Packers', established: '1919', conference: 'NFC', division: 'North',
			colors: [
				color('Dark Green', '#203731', 'PMS 5535', 1, [80, 30, 60, 70]),
				color('Gold', '#FFB612', 'PMS 1235', 2, [0, 30, 100, 0]),
			],
		}),
		makeTeam({
			code: 'KC', city: 'Kansas City', name: 'Chiefs', established: '1960', conference: 'AFC', division: 'West',
			colors: [
				color('Red', '#E31837', 'PMS 186', 1, [0, 100, 80, 5]),
				color('Gold', '#FFB81C', 'PMS 1235', 2, [0, 28, 100, 0]),
			],
		}),
	],
}

const NBA: League = {
	Id: 'l-nba',
	Code: 'NBA',
	Name: 'National Basketball Association',
	leagueLogos: [],
	leagueServerLogos: [],
	teams: [
		makeTeam({
			code: 'LAL', city: 'Los Angeles', name: 'Lakers', established: '1947', conference: 'West', division: 'Pacific',
			colors: [
				color('Purple', '#552583', 'PMS 268', 1, [80, 100, 0, 10]),
				color('Gold', '#FDB927', 'PMS 123', 2, [0, 25, 95, 0]),
			],
		}),
		makeTeam({
			code: 'BOS', city: 'Boston', name: 'Celtics', established: '1946', conference: 'East', division: 'Atlantic',
			colors: [
				color('Green', '#007A33', 'PMS 348', 1, [90, 0, 100, 5]),
				color('Gold', '#BA9653', 'PMS 873', 2, [25, 35, 75, 5]),
			],
		}),
	],
}

const MLB: League = {
	Id: 'l-mlb',
	Code: 'MLB',
	Name: 'Major League Baseball',
	leagueLogos: [],
	leagueServerLogos: [],
	teams: [
		makeTeam({
			code: 'NYY', city: 'New York', name: 'Yankees', established: '1901', conference: 'AL', division: 'East',
			colors: [
				color('Navy', '#0C2340', 'PMS 282', 1, [100, 80, 25, 60]),
				color('White', '#ffffff', 'White', 2, [0, 0, 0, 0]),
			],
		}),
		makeTeam({
			code: 'LAD', city: 'Los Angeles', name: 'Dodgers', established: '1883', conference: 'NL', division: 'West',
			colors: [
				color('Dodger Blue', '#005A9C', 'PMS 294', 1, [100, 60, 0, 5]),
				color('Red', '#EF3E42', 'PMS 200', 2, [0, 90, 75, 0]),
			],
		}),
	],
}

/* League-wide and league-logos-folder thumbnails (shown on the League / League Logos tabs). */
function fillLeagueLogos(league: League): League {
	const c = league.teams[0].colors[0]
	const lg = (i: number, bg: string, fg: string) => ({
		id: `${league.Code}-ll-${i}`,
		FileName: `${league.Code.toLowerCase()}_league_${i}.ai`,
		SetName: 'League',
		imgSrc: makeLogo(league.Code, fg, bg),
		updatedTime: '2026-05-10 09:00',
		colorInfo: c,
	})
	league.leagueLogos = [lg(1, c.Hex, '#ffffff'), lg(2, '#1d1d1d', '#ffffff'), lg(3, '#f4f4f4', '#1d1d1d')]
	league.leagueServerLogos = [lg(4, c.Hex, '#ffffff'), lg(5, '#2b2b2b', '#ffffff')]
	return league
}

export const SAMPLE_LEAGUES: League[] = [NFL, NBA, MLB].map(fillLeagueLogos)

/* Configured server folders (legacy `serverLists`). */
export const SAMPLE_SERVERS: ServerFolder[] = [
	{ name: 'Production', path: '/Volumes/Logobase/Production', active: true, enable: true, folderExists: true },
	{ name: 'Staging', path: '/Volumes/Logobase/Staging', active: false, enable: true, folderExists: true },
	{ name: 'Archive 2024', path: '/Volumes/Logobase/Archive2024', active: false, enable: true, folderExists: false },
]

/* Worksheets offered by the Excel import dialog (legacy `global_LeaguesSheetNames`). */
export const SAMPLE_WORKSHEETS: Worksheet[] = [
	{
		Code: 'NFL',
		columns: [
			{ name: 'TeamCode', selected: true },
			{ name: 'FullName', selected: true },
			{ name: 'TeamCity', selected: true },
			{ name: 'PrimaryColor', selected: false },
			{ name: 'SecondaryColor', selected: false },
		],
	},
	{
		Code: 'NBA',
		columns: [
			{ name: 'TeamCode', selected: true },
			{ name: 'FullName', selected: true },
			{ name: 'Conference', selected: false },
		],
	},
]
