/*
 * LogosheetBuilderContext — holds the Logosheets-tab working state ABOVE MainPanel so it survives the
 * tab unmounting (e.g. when the active Illustrator document changes and `docType` flips). The pool is
 * only emptied by the explicit Clear action.
 *
 * The designer uploads AI files; their spot/PANTONE swatches are extracted into `extractedColors`. The
 * user then marks each colour as TC1, TC2, … (ordered → the team colours) or Custom via `colorRoles`.
 *
 * Hierarchy: Logo Type (→ its own LOGOS:<type> artboard) → Sets (rows) → Columns/colours (TC1…TCN /
 * Dark / Light, derived from the TC marks). Columns and sets are per logo type.
 */
import { createContext, useCallback, useContext, useMemo, useState, type ReactNode } from 'react'
import type { BuildColumn, ExtractedColor } from '@lib/host'

export type { ExtractedColor }

export interface PoolLogo {
	id: string
	name: string
	path: string
	dataUrl: string
}
export interface ColumnDef extends BuildColumn {
	id: string
}
export interface SetRow {
	id: string
	name: string
	cells: Record<string, string> // columnToken → poolLogoId
}
export interface LogoTypeDef {
	id: string
	name: string
	columns: ColumnDef[]
	sets: SetRow[]
}

export const bid = () => `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 7)}`

export const defaultColumns = (): ColumnDef[] => [
	{ id: bid(), token: 'TC1', label: 'Team Color 1', kind: 'tc', index: 1 },
	{ id: bid(), token: 'TC2', label: 'Team Color 2', kind: 'tc', index: 2 },
	{ id: bid(), token: 'dkbgnd', label: 'Dark', kind: 'dark' },
	{ id: bid(), token: 'ltbgnd', label: 'Light', kind: 'light' },
]

export const newLogoType = (name: string): LogoTypeDef => ({
	id: bid(),
	name,
	columns: defaultColumns(),
	sets: [{ id: bid(), name: 'Full Color', cells: {} }],
})

/* Is a role token a team-colour mark (TC1, TC2, …)? */
const isTcRole = (role: string): boolean => /^TC\d+$/.test(role)

/* Hard ceiling on how many team-colour columns the grid can have (TC1…TCN). */
export const MAX_TC = 12

/*
 * Build the grid columns: `tcCount` team-colour columns (TC1…TC<tcCount>) then the fixed Dark / Light
 * background columns. `labelFor(token)` supplies each TC column's label (the marked colour's name when
 * assigned); it falls back to "Team Color N".
 */
export const columnsFor = (tcCount: number, labelFor?: (token: string) => string | undefined): ColumnDef[] => {
	const n = Math.max(1, tcCount)
	const tcCols: ColumnDef[] = []
	for (let i = 1; i <= n; i++) {
		const token = `TC${i}`
		tcCols.push({ id: `tc${i}`, token, label: labelFor?.(token) || `Team Color ${i}`, kind: 'tc', index: i })
	}
	return [
		...tcCols,
		{ id: 'dk', token: 'dkbgnd', label: 'Dark', kind: 'dark' as const },
		{ id: 'lt', token: 'ltbgnd', label: 'Light', kind: 'light' as const },
	]
}

interface LogosheetBuilderValue {
	pool: PoolLogo[]
	setPool: React.Dispatch<React.SetStateAction<PoolLogo[]>>
	logoTypes: LogoTypeDef[]
	setLogoTypes: React.Dispatch<React.SetStateAction<LogoTypeDef[]>>
	/* Empty the uploaded logos, every cell assignment, the extracted colours + their roles. */
	clearAll: () => void

	/* Spot colours extracted from the uploaded AI files (deduped by name across the pool). */
	extractedColors: ExtractedColor[]
	/* Merge newly-extracted colours into the pool (dedupe by name). */
	mergeExtractedColors: (colors: ExtractedColor[]) => void
	/* colour name → role token: '' (unset) | 'TC1'|'TC2'|… | 'custom'. */
	colorRoles: Record<string, string>
	/* Set a colour's role. Enforces TC uniqueness (one colour per TC token). */
	setColorRole: (name: string, role: string) => void

	/* How many team-colour columns the grid shows (TC1…TC<tcCount>). */
	tcCount: number
	/* Add a TC column (up to MAX_TC). */
	addTc: () => void
	/* Remove the last TC column (min 1) and drop any colour marks on the removed token. */
	removeTc: () => void

	/* Export target (League + Team codes) for "Export LEAP Assets". */
	exportLeague: string
	exportTeam: string
	setExportLeague: (code: string) => void
	setExportTeam: (code: string) => void
}

const Ctx = createContext<LogosheetBuilderValue | null>(null)

/* The team colours (role TC<n>) in TC order; the custom colours (role 'custom'). */
export const teamColorsFrom = (extractedColors: ExtractedColor[], colorRoles: Record<string, string>): ExtractedColor[] =>
	extractedColors
		.filter((c) => isTcRole(colorRoles[c.name] ?? ''))
		.sort((a, b) => Number((colorRoles[a.name] ?? 'TC0').slice(2)) - Number((colorRoles[b.name] ?? 'TC0').slice(2)))

export const customColorsFrom = (extractedColors: ExtractedColor[], colorRoles: Record<string, string>): ExtractedColor[] =>
	extractedColors.filter((c) => (colorRoles[c.name] ?? '') === 'custom')

export function LogosheetBuilderProvider({ children }: { children: ReactNode }) {
	const [pool, setPool] = useState<PoolLogo[]>([])
	const [logoTypes, setLogoTypes] = useState<LogoTypeDef[]>(() => [newLogoType('Primary')])
	const [extractedColors, setExtractedColors] = useState<ExtractedColor[]>([])
	const [colorRoles, setColorRoles] = useState<Record<string, string>>({})
	const [tcCount, setTcCount] = useState(2)
	const [exportLeague, setExportLeague] = useState('')
	const [exportTeam, setExportTeam] = useState('')

	const clearAll = useCallback(() => {
		setPool([])
		setLogoTypes((prev) => prev.map((t) => ({ ...t, sets: t.sets.map((s) => ({ ...s, cells: {} })) })))
		setExtractedColors([])
		setColorRoles({})
		setTcCount(2)
	}, [])

	const addTc = useCallback(() => setTcCount((n) => Math.min(MAX_TC, n + 1)), [])
	const removeTc = useCallback(() => {
		setTcCount((n) => {
			const next = Math.max(1, n - 1)
			/* Drop any colour marks on TC tokens beyond the new count. */
			setColorRoles((prev) => {
				const out: Record<string, string> = {}
				for (const k of Object.keys(prev)) {
					const r = prev[k]
					if (isTcRole(r) && Number(r.slice(2)) > next) continue
					out[k] = r
				}
				return out
			})
			return next
		})
	}, [])

	/* Merge newly-extracted colours, deduping by name. */
	const mergeExtractedColors = useCallback((colors: ExtractedColor[]) => {
		setExtractedColors((prev) => {
			const have = new Set(prev.map((c) => c.name))
			const next = [...prev]
			for (const c of colors) {
				if (have.has(c.name)) continue
				have.add(c.name)
				next.push(c)
			}
			return next
		})
	}, [])

	/* Set a colour's role; assigning a TC token clears it from any other colour, '' unsets. */
	const setColorRole = useCallback((name: string, role: string) => {
		setColorRoles((prev) => {
			const next = { ...prev }
			if (isTcRole(role)) {
				/* Enforce TC uniqueness: clear the same TC token off any other colour. */
				for (const k of Object.keys(next)) if (next[k] === role) delete next[k]
			}
			if (role === '') delete next[name]
			else next[name] = role
			return next
		})
	}, [])

	const value = useMemo<LogosheetBuilderValue>(
		() => ({
			pool, setPool, logoTypes, setLogoTypes, clearAll,
			extractedColors, mergeExtractedColors, colorRoles, setColorRole,
			tcCount, addTc, removeTc,
			exportLeague, exportTeam, setExportLeague, setExportTeam,
		}),
		[pool, logoTypes, clearAll, extractedColors, mergeExtractedColors, colorRoles, setColorRole, tcCount, addTc, removeTc, exportLeague, exportTeam],
	)
	return <Ctx.Provider value={value}>{children}</Ctx.Provider>
}

export function useLogosheetBuilder(): LogosheetBuilderValue {
	const ctx = useContext(Ctx)
	if (!ctx) throw new Error('useLogosheetBuilder must be used within a LogosheetBuilderProvider')
	return ctx
}
