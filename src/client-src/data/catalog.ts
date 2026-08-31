/*
 * Catalog loader — reads the real Logobase data from the server path and maps it onto the panel's
 * UI types. It mirrors the production layout exactly (verified against LEAP_DEMO_SERVER):
 *
 *   <base>/JSON/SLS_MASTER.json                              → leagues + their teams
 *   <base>/JSON/TEAM_DATA/<League>/SLS_TEAM_<TeamCode>.json  → team info (name/city/conference/…)
 *   <base>/JSON/TEAM_LOGOS/<League>/SLS_LOGO_<TeamCode>.json → TeamColors[] + MasterLogo[] sets
 *   <base>/LOGOS/<League>/<TeamCode>/png/<FileNamePNG>       → logo PNGs
 *   <base>/LEAGUES/LOGOS/<League>/png/<file>                 → league logos
 *
 * Colours come from the logo file's `TeamColors[]` (Hex/Pantone/CMYK). Logos are the flattened
 * `MasterLogo[].MasterLogos[]` versions; each carries a `FileNamePNG` and a `LogoVersionColor`. The
 * cell background and the colour-name badge follow the legacy `getLogoBgColor` rules based on the
 * filename token (TC1/TC2/dkbgnd/ltbgnd/OTHER).
 *
 * The base path comes from the host (configured Logobase server folder) in CEP, or `logobase` in
 * browser dev (a real subset bundled under `public/`). Loading is plain `fetch`, so the same loader
 * works for an http(s) origin and — with `--allow-file-access-from-files` (set in the CEP manifest) —
 * for a `file://` server path. This module is the single place that knows the on-disk shape.
 */
import type { BgColorKey, ColorInfo, League, Logo, Team } from './types'

/* The 1-based team-colour index for a `tcN` token, or 0 when the token isn't a team colour. */
export function teamColorIndex(token: BgColorKey | undefined): number {
	const m = token ? /^tc(\d+)$/.exec(token) : null
	return m ? parseInt(m[1], 10) : 0
}

/* The background tokens actually present in a logo list, ordered tc1…tcN then dark, light. Used to
   build the background filter bar so it grows automatically when a sheet adds Team Color 3/4/…. */
export function presentBgKeys(logos: { bgKey?: BgColorKey }[]): BgColorKey[] {
	const seen: Record<string, boolean> = {}
	for (const l of logos) if (l.bgKey) seen[l.bgKey] = true
	const tcs = Object.keys(seen)
		.filter((k) => /^tc\d+$/.test(k))
		.sort((a, b) => teamColorIndex(a as BgColorKey) - teamColorIndex(b as BgColorKey)) as BgColorKey[]
	const out: BgColorKey[] = [...tcs]
	if (seen['dkbgnd']) out.push('dkbgnd')
	if (seen['ltbgnd']) out.push('ltbgnd')
	return out
}

/* Background colour for a logo from its filename token (legacy `getLogoBgColor`). Team colours are
   open-ended: `tcN` maps to the Nth team colour (falling back to the first), plus dark / light. */
export function bgColorForToken(token: BgColorKey, colors: ColorInfo[]): string {
	if (token === 'dkbgnd') return '#636768'
	if (token === 'ltbgnd') return '#ced0d1'
	const n = teamColorIndex(token)
	if (n > 0) return colors[n - 1]?.Hex ?? colors[0]?.Hex ?? '#ced0d1'
	return '#ced0d1'
}

/* Convert a #rrggbb hex to CMYK percentages (used for the dark/light grey backgrounds that have no
   team-colour CMYK of their own). */
function hexToCmyk(hex: string): { C: number; M: number; Y: number; K: number } {
	const m = /^#?([0-9a-f]{6})$/i.exec(hex.trim())
	if (!m) return { C: 0, M: 0, Y: 0, K: 0 }
	const n = parseInt(m[1], 16)
	const r = ((n >> 16) & 0xff) / 255
	const g = ((n >> 8) & 0xff) / 255
	const b = (n & 0xff) / 255
	const k = 1 - Math.max(r, g, b)
	if (k >= 1) return { C: 0, M: 0, Y: 0, K: 100 }
	return {
		C: Math.round(((1 - r - k) / (1 - k)) * 100),
		M: Math.round(((1 - g - k) / (1 - k)) * 100),
		Y: Math.round(((1 - b - k) / (1 - k)) * 100),
		K: Math.round(k * 100),
	}
}

/* The full ColorInfo that represents a logo's background — so its Hex AND its CMYK both match what the
   panel shows (and what gets drawn behind the logo when added to the document). For a team colour this
   is the exact team-colour record (accurate CMYK from JSON); for dark/light it's the grey + its CMYK. */
export function bgColorInfo(token: BgColorKey, colors: ColorInfo[]): ColorInfo {
	const n = teamColorIndex(token)
	if (n > 0 && colors[n - 1]) return colors[n - 1]
	const hex = bgColorForToken(token, colors)
	const cmyk = hexToCmyk(hex)
	return { text: '', value: token, color: hex, Hex: hex, PantoneName: '', TeamColorIndex: '', ...cmyk }
}

/* Detect the background token embedded in a logo's filename (case-insensitive). Recognises any
   `tcN` plus dark / light; dark/light are checked first so they're never shadowed by a digit. */
function tokenFromFileName(fileName: string): BgColorKey | undefined {
	const f = fileName.toLowerCase()
	if (f.indexOf('dkbgnd') !== -1) return 'dkbgnd'
	if (f.indexOf('ltbgnd') !== -1) return 'ltbgnd'
	const m = /tc(\d+)/.exec(f)
	if (m) return `tc${parseInt(m[1], 10)}`
	return undefined
}

/* Trim the "PANTONE … C" wrapper to a short colour label for the badge. */
function shortColorName(pantone: string | undefined): string | undefined {
	if (!pantone) return undefined
	return pantone.replace(/^PANTONE\s+/i, '').replace(/\s+C$/i, '').trim()
}

/* ---- Raw on-disk shapes (only the fields we read) ---- */
interface RawMasterTeam {
	TeamCode: string
}
interface RawMasterLeague {
	Code: string
	Name?: string
	Teams: RawMasterTeam[]
	LeagueLogos?: string[]
	LeagueServerLogos?: string[]
}
interface RawTeamData {
	TeamCode: string
	TeamName?: string
	TeamCity?: string
	FullName?: string
	EstablishedYear?: string
	TeamConference?: string
	Division?: string
	Nickname?: string
}
interface RawTeamColor {
	Hex?: string
	PantoneName?: string
	C?: number
	M?: number
	Y?: number
	K?: number
	TeamColorIndex?: string
	TeamColorName?: string
}
interface RawLogoVersion {
	FileName?: string
	FileNamePNG?: string
	FileNameSVG?: string
	/* Colour columns this single file serves (TC1…TCN / dkbgnd / ltbgnd). When present, one file is
	   expanded into one UI logo per colour; absent → the colour is read from the file name. */
	Backgrounds?: string[]
	LogoVersionColor?: { LogoVersionColors?: { PantoneName?: string }[] }
}
interface RawLogoSet {
	SetName?: string
	SetNameDesign?: string
	Order?: number
	UpdatedTime?: string
	MasterLogos?: RawLogoVersion[]
}
interface RawLogoFile {
	MasterLogo?: RawLogoSet[]
	TeamColors?: RawTeamColor[]
}

/* JSON reader (injected by loadCatalog). Defaults to fetch so the loader also works standalone. */
/* `opts.silent` skips capture entirely (a pure existence probe); `opts.expected` still POSTs the read
   failure but tags it `{ expected: true }` (a team's not-yet-parsed SLS_LOGO_*.json — captured, but
   distinguishable from a real corrupt-file error). */
type JsonReader = <T>(url: string, opts?: { silent?: boolean; expected?: boolean }) => Promise<T>
let getJson: JsonReader = async <T>(url: string): Promise<T> => {
	const res = await fetch(url)
	if (!res.ok) throw new Error(`Failed to load ${url} (${res.status})`)
	return (await res.json()) as T
}

/* Map a raw TeamColors entry onto the UI ColorInfo (text falls back from name → pantone). */
function mapColor(raw: RawTeamColor, i: number): ColorInfo {
	const hex = raw.Hex ?? '#000000'
	return {
		text: raw.TeamColorName?.trim() || shortColorName(raw.PantoneName) || hex,
		value: raw.TeamColorIndex ?? String(i + 1),
		color: hex,
		Hex: hex,
		PantoneName: raw.PantoneName ?? '',
		C: raw.C ?? 0,
		M: raw.M ?? 0,
		Y: raw.Y ?? 0,
		K: raw.K ?? 0,
		TeamColorIndex: raw.TeamColorIndex ?? String(i + 1),
	}
}

/* Build a logo image URL for a given sub-folder (png or svg): <base>/LOGOS/<league>/<team>/<sub>/<file>. */
function logoUrl(base: string, league: string, team: string, sub: string, file: string): string {
	return `${base}/LOGOS/${league}/${team}/${sub}/${file}`
}

/* Normalise a stored background token ("TC1", "dkbgnd", …) to a BgColorKey, or undefined if unknown. */
function normalizeBgToken(token: string): BgColorKey | undefined {
	const t = token.trim().toLowerCase()
	if (t === 'dkbgnd' || t === 'ltbgnd') return t
	const m = /^tc(\d+)$/.exec(t)
	return m ? (`tc${parseInt(m[1], 10)}` as BgColorKey) : undefined
}

/*
 * Flatten the MasterLogo sets into the flat Logo list the UI renders. A version's colours come from its
 * `Backgrounds` list when present (so a single placed logo can serve TC1/TC2/Dark/Light without the
 * file being duplicated on disk) — one UI logo is emitted per colour, all pointing at the same file.
 * Without `Backgrounds`, the colour is read from the file name (legacy / per-colour files).
 */
function mapLogos(base: string, leagueCode: string, teamCode: string, raw: RawLogoFile, colors: ColorInfo[]): Logo[] {
	const out: Logo[] = []
	for (const set of raw.MasterLogo ?? []) {
		for (const v of set.MasterLogos ?? []) {
			const file = v.FileNamePNG ?? v.FileName?.replace(/\.ai$/i, '.png')
			if (!file) continue
			const pantone = v.LogoVersionColor?.LogoVersionColors?.[0]?.PantoneName
			/* Prefer the vector SVG (sharp at any size); fall back to the PNG raster when the SVG is
			   absent (older parses / missing svg/ folder). The PNG is always the fallback source. */
			const pngUrl = logoUrl(base, leagueCode, teamCode, 'png', file)
			const svgUrl = v.FileNameSVG ? logoUrl(base, leagueCode, teamCode, 'svg', v.FileNameSVG) : undefined

			/* The colour tokens this file represents: from Backgrounds, else the file-name token. */
			const tokens = (v.Backgrounds ?? []).map(normalizeBgToken).filter((t): t is BgColorKey => !!t)
			const bgKeys: (BgColorKey | undefined)[] = tokens.length ? tokens : [tokenFromFileName(file)]

			for (const bgKey of bgKeys) {
				out.push({
					id: `${teamCode}-${file}-${bgKey ?? 'na'}`,
					FileName: file,
					SetName: set.SetName ?? 'Logos',
					imgSrc: svgUrl ?? pngUrl,
					imgFallback: pngUrl,
					updatedTime: set.UpdatedTime ?? '',
					bgKey,
					colorName: shortColorName(pantone),
					colorInfo: bgKey ? bgColorInfo(bgKey, colors) : undefined,
				})
			}
		}
	}
	return out
}

/* Load one team: its info (TEAM_DATA) + colours & logos (TEAM_LOGOS). */
async function loadTeam(base: string, leagueCode: string, code: string): Promise<Team> {
	const [info, logoFile] = await Promise.all([
		getJson<RawTeamData>(`${base}/JSON/TEAM_DATA/${leagueCode}/SLS_TEAM_${code}.json`),
		/* A team's SLS_LOGO file is optional (no logosheet parsed yet). It's marked `expected` — NOT silent —
		   so a missing/unreadable file IS captured on the dashboard (tagged `expected: true`) while the
		   `.catch` fallback to an empty object keeps the catalog load working. */
		getJson<RawLogoFile>(`${base}/JSON/TEAM_LOGOS/${leagueCode}/SLS_LOGO_${code}.json`, { expected: true }).catch(() => ({}) as RawLogoFile),
	])
	const colors = (logoFile.TeamColors ?? []).map(mapColor)
	const logos = mapLogos(base, leagueCode, code, logoFile, colors)
	/* SLS_TEAM is the source of truth for a team's fields; SLS_MASTER only indexes which teams exist
	   (its FullName is a mirror Team Info writes, not a second source — falling back to it would show
	   this one field from a different file than every other field on the team).
	   A name can be absent from both, and we deliberately do NOT invent one from the nickname or the
	   code: it shows empty so the gap in the server data stays visible (and fixable in Team Info).
	   It only has to be a string — an undefined FullName threw in the league sort below and took the
	   whole catalog down. */
	const fullName = info.FullName ?? ''
	const name = info.TeamName ?? fullName
	const city = info.TeamCity ?? ''
	return {
		Id: `${leagueCode}-${code}`,
		TeamCode: code,
		FullName: fullName,
		TeamName: name,
		TeamCity: city,
		ShortName: info.Nickname ?? code,
		EstablishedYear: info.EstablishedYear ?? '',
		TeamConference: info.TeamConference ?? '',
		TeamDivision: info.Division ?? '',
		primaryColorCode: colors[0]?.Hex ?? '#000000',
		secondaryColorCode: colors[1]?.Hex ?? colors[0]?.Hex ?? '#000000',
		colors,
		verbiage: [fullName, name, city, code, info.TeamConference ?? '', info.EstablishedYear ?? ''].filter(Boolean),
		logos,
	}
}

/* Build a League's logo lists from the master file's filename arrays (optional). */
function leagueLogos(base: string, leagueCode: string, files: string[] | undefined, idPrefix: string): Logo[] {
	return (files ?? []).map((file, i) => ({
		id: `${leagueCode}-${idPrefix}-${i}`,
		FileName: file,
		SetName: 'League',
		imgSrc: `${base}/LEAGUES/LOGOS/${leagueCode}/png/${file}`,
		updatedTime: '',
	}))
}

/* Sort a league's teams by name, with the nameless ones (missing from the server data) last rather
   than first — `teams[0]` is what the panel auto-selects when you switch leagues. */
function byName(a: Team, b: Team): number {
	if (!a.FullName || !b.FullName) return (a.FullName ? 0 : 1) - (b.FullName ? 0 : 1) || a.TeamCode.localeCompare(b.TeamCode)
	return a.FullName.localeCompare(b.FullName)
}

/*
 * Load the full catalog (all leagues + their teams) from the base path (legacy initLoader). Per-team
 * files are fetched in parallel; a single failed team file is skipped rather than failing the whole
 * load. Leagues that end up with no readable teams are dropped.
 */
export async function loadCatalog(base: string, reader?: JsonReader): Promise<League[]> {
	if (reader) getJson = reader
	const master = await getJson<RawMasterLeague[]>(`${base}/JSON/SLS_MASTER.json`)

	const leagues = await Promise.all(
		master.map(async (ml): Promise<League> => {
			const teams = await Promise.all(
				ml.Teams.map(async (mt) => {
					try {
						return await loadTeam(base, ml.Code, mt.TeamCode)
					} catch {
						return null
					}
				}),
			)
			return {
				Id: `league-${ml.Code}`,
				Code: ml.Code,
				Name: ml.Name ?? ml.Code,
				teams: teams.filter((t): t is Team => t != null).sort(byName),
				leagueLogos: leagueLogos(base, ml.Code, ml.LeagueLogos, 'll'),
				leagueServerLogos: leagueLogos(base, ml.Code, ml.LeagueServerLogos, 'lsl'),
			}
		}),
	)

	return leagues.filter((l) => l.teams.length > 0)
}
