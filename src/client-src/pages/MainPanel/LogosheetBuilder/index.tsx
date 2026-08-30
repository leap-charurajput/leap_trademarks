/*
 * LogosheetBuilder — the "Logosheets" tab. Built over one uploaded AI pool + grid:
 *   1. Upload AI files (choose folder / files / drag-drop) into a shared pool. As files are added their
 *      spot/PANTONE swatches are read automatically (controller.extractAiColors) and merged into the
 *      Extracted Colours list; each pool chip shows the AI's rendered PNG thumbnail.
 *   2. Mark each extracted colour as TC1, TC2, … (ordered → the team colours) or Custom. The grid
 *      columns are DERIVED from the TC marks (TC1…TCn) + Dark + Light.
 *   3. Hierarchy: Logo Type (→ its own LOGOS:<type> artboard) → Sets (rows) → derived columns. Drag a
 *      pool logo into a cell; one logo can sit in many cells.
 *   4. "Export LEAP Assets" → per AI (whose spots are already named), reads which marked spots are
 *      present, exports AI/PNG/SVG, and writes SLS_LOGO_<team>.json keyed by the chosen League/Team.
 * State lives in LogosheetBuilderContext so it survives the tab unmounting on document switch.
 */
import { useEffect, useState, type DragEvent } from 'react'
import { Button, Tooltip } from '../../../components'
import { Size, ToastType } from '../../../enums'
import { useToast } from '../../../context/ToastContext'
import { useTranslation } from '../../../context/LocaleContext'
import { useTrademarks } from '../../../context/TrademarksContext'
import { bid, columnsFor, customColorsFrom, MAX_TC, useLogosheetBuilder, newLogoType, type ExtractedColor, type LogoTypeDef, type PoolLogo } from '../../../context/LogosheetBuilderContext'
import controller from '../../../controller'
import './style.css'

export function LogosheetBuilder() {
	const { t } = useTranslation()
	const { notify } = useToast()
	const { leagues, selectedLeague, selectedTeam } = useTrademarks()
	const {
		pool, setPool, logoTypes, setLogoTypes, clearAll,
		extractedColors, mergeExtractedColors, colorRoles, setColorRole,
		tcCount, addTc, removeTc,
		exportLeague, exportTeam, setExportLeague, setExportTeam,
	} = useLogosheetBuilder()
	const [exporting, setExporting] = useState(false)
	const [extracting, setExtracting] = useState(false)
	const [dragOver, setDragOver] = useState(false)
	const [poolHeight, setPoolHeight] = useState(140)
	const [gridHeight, setGridHeight] = useState(280)

	/* Default the export target to the globally-selected league/team once they are available. */
	useEffect(() => {
		if (!exportLeague && selectedLeague.Code) setExportLeague(selectedLeague.Code)
	}, [selectedLeague.Code, exportLeague, setExportLeague])
	useEffect(() => {
		if (!exportTeam && selectedTeam.TeamCode) setExportTeam(selectedTeam.TeamCode)
	}, [selectedTeam.TeamCode, exportTeam, setExportTeam])

	/* ROI: the user opened / started the Logosheet builder (once per mount). */
	useEffect(() => {
		controller.logEvent('logosheetBuilderStarted')
	}, [])

	const byId = (id: string | undefined) => pool.find((p) => p.id === id)
	const customColors = customColorsFrom(extractedColors, colorRoles)
	/* The colour marked for a given TC token (TC1, TC2, …), if any. */
	const tcColorFor = (token: string) => extractedColors.find((c) => colorRoles[c.name] === token)
	const columns = columnsFor(tcCount, (token) => tcColorFor(token)?.name)
	/* How many of the TC columns have a colour assigned (all must be set to export). */
	const assignedTcCount = Array.from({ length: tcCount }, (_, i) => tcColorFor(`TC${i + 1}`)).filter(Boolean).length
	const exportLeagueObj = leagues.find((l) => l.Code === exportLeague) ?? selectedLeague

	/* Generic vertical resize handle: drag to change a panel's height. */
	const startResize = (current: number, setter: (n: number) => void, min: number, max: number) => (e: React.MouseEvent) => {
		e.preventDefault()
		const startY = e.clientY
		const onMove = (ev: MouseEvent) => setter(Math.max(min, Math.min(max, current + (ev.clientY - startY))))
		const onUp = () => {
			document.removeEventListener('mousemove', onMove)
			document.removeEventListener('mouseup', onUp)
		}
		document.addEventListener('mousemove', onMove)
		document.addEventListener('mouseup', onUp)
	}

	/* ---- pool ---- */
	/* Add AI paths to the pool: read their spot colours + thumbnails, then push the new logos. */
	const addPaths = async (paths: string[]) => {
		const have = new Set(pool.map((p) => p.path).filter(Boolean))
		const fresh = paths.filter((p) => p && !have.has(p))
		if (fresh.length === 0) return
		/* ROI: the user uploaded logo AI file(s) into the builder pool. Include the file names (capped)
		   so support can see WHAT was uploaded, not just how many. */
		controller.logEvent('uploadLogos', {
			count: fresh.length,
			files: fresh.slice(0, 25).map((p) => p.split(/[/\\]/).pop() || p),
		})
		setExtracting(true)
		try {
			const { files } = await controller.extractAiColors(fresh)
			const next: PoolLogo[] = []
			const allSpots: ExtractedColor[] = []
			for (const f of files) {
				next.push({ id: bid(), name: f.name, path: f.path, dataUrl: f.dataUrl })
				for (const s of f.spots) allSpots.push(s)
			}
			if (next.length) setPool((prev) => [...prev, ...next])
			if (allSpots.length) mergeExtractedColors(allSpots)
		} finally {
			setExtracting(false)
		}
	}
	const chooseFiles = () => void addPaths(controller.pickAiFiles())
	const chooseFolder = () => void addPaths(controller.pickAiFolder())

	const onDrop = (e: DragEvent<HTMLDivElement>) => {
		e.preventDefault()
		setDragOver(false)
		const files = Array.from(e.dataTransfer.files)
		const paths: string[] = []
		for (const f of files) {
			const path = (f as unknown as { path?: string }).path
			if (path) {
				if (/\.ai$/i.test(path)) paths.push(path)
				else paths.push(...controller.aiFilesIn(path))
			}
		}
		if (paths.length) void addPaths(paths)
	}

	const removeFromPool = (id: string) => {
		setPool((prev) => prev.filter((p) => p.id !== id))
		setLogoTypes((prev) =>
			prev.map((tp) => ({
				...tp,
				sets: tp.sets.map((s) => {
					const cells: Record<string, string> = {}
					for (const k of Object.keys(s.cells)) if (s.cells[k] !== id) cells[k] = s.cells[k]
					return { ...s, cells }
				}),
			})),
		)
	}

	/* ---- logo types / sets ---- */
	const updateType = (typeId: string, fn: (t: LogoTypeDef) => LogoTypeDef) =>
		setLogoTypes((prev) => prev.map((tp) => (tp.id === typeId ? fn(tp) : tp)))

	const addLogoType = () => setLogoTypes((prev) => [...prev, newLogoType(`Type ${prev.length + 1}`)])
	const removeLogoType = (id: string) => setLogoTypes((prev) => (prev.length > 1 ? prev.filter((tp) => tp.id !== id) : prev))
	const renameLogoType = (id: string, name: string) => updateType(id, (tp) => ({ ...tp, name }))

	const addSet = (typeId: string) => updateType(typeId, (tp) => ({ ...tp, sets: [...tp.sets, { id: bid(), name: `Set ${tp.sets.length + 1}`, cells: {} }] }))
	const removeSet = (typeId: string, setId: string) => updateType(typeId, (tp) => ({ ...tp, sets: tp.sets.length > 1 ? tp.sets.filter((s) => s.id !== setId) : tp.sets }))
	const renameSet = (typeId: string, setId: string, name: string) => updateType(typeId, (tp) => ({ ...tp, sets: tp.sets.map((s) => (s.id === setId ? { ...s, name } : s)) }))

	const assignCell = (typeId: string, setId: string, token: string, logoId: string) =>
		updateType(typeId, (tp) => ({ ...tp, sets: tp.sets.map((s) => (s.id === setId ? { ...s, cells: { ...s.cells, [token]: logoId } } : s)) }))
	const clearCell = (typeId: string, setId: string, token: string) =>
		updateType(typeId, (tp) => ({
			...tp,
			sets: tp.sets.map((s) => {
				if (s.id !== setId) return s
				const cells = { ...s.cells }
				delete cells[token]
				return { ...s, cells }
			}),
		}))

	/* Build the host payload (logo types with the DERIVED columns + cell paths). */
	const buildPayloadTypes = () =>
		logoTypes.map((tp) => ({
			name: tp.name,
			columns: columns.map((c) => ({ token: c.token, label: c.label, kind: c.kind, index: c.index })),
			sets: tp.sets.map((s) => {
				const cells: Record<string, string> = {}
				for (const col of columns) {
					const logo = byId(s.cells[col.token])
					if (logo?.path) cells[col.token] = logo.path
				}
				return { name: s.name, cells }
			}),
		}))

	const exportAssets = async () => {
		if (pool.length === 0 || assignedTcCount === 0 || !exportLeague || !exportTeam) {
			notify(t('build.exportEmpty'), ToastType.Warning)
			return
		}
		/* Every TC column needs a colour so its background + JSON TeamColors entry are defined. */
		const teamColors: ExtractedColor[] = []
		for (let i = 1; i <= tcCount; i++) {
			const c = tcColorFor(`TC${i}`)
			if (!c) {
				notify(t('build.exportTcGap'), ToastType.Warning)
				return
			}
			teamColors.push(c)
		}
		const payloadTypes = buildPayloadTypes()
		const total = payloadTypes.reduce((n, tp) => n + tp.sets.reduce((m, s) => m + Object.keys(s.cells).length, 0), 0)
		if (total === 0) {
			notify(t('build.empty'), ToastType.Warning)
			return
		}
		setExporting(true)
		try {
			const r = await controller.exportLeapAssets({
				league: exportLeague,
				teamCode: exportTeam,
				teamColors,
				customColors,
				logoTypes: payloadTypes,
			})
			if (r.ok) notify(t('build.exportDone', { count: String(r.exported) }), ToastType.Success)
			else notify(r.error ?? 'Could not export LEAP assets', ToastType.Error)
		} finally {
			setExporting(false)
		}
	}

	/* Export needs every TC column assigned a colour, plus a target league/team. */
	const canExport = pool.length > 0 && tcCount > 0 && assignedTcCount === tcCount && !!exportLeague && !!exportTeam

	return (
		<div className="tm-build">
			{/* Upload */}
			<div
				className={`tm-build__drop ${dragOver ? 'is-over' : ''}`}
				onDragOver={(e) => {
					e.preventDefault()
					setDragOver(true)
				}}
				onDragLeave={() => setDragOver(false)}
				onDrop={onDrop}
			>
				<p className="tm-build__drophint">{t('build.dropHint')}</p>
				<div className="tm-build__uploadbtns">
					<Button size={Size.Small} onClick={chooseFiles}>{t('build.chooseFiles')}</Button>
					<Button size={Size.Small} onClick={chooseFolder}>{t('build.chooseFolder')}</Button>
				</div>
				{extracting && <p className="tm-build__drophint">{t('build.extracting')}</p>}
			</div>

			{/* Pool */}
			{pool.length > 0 && (
				<>
					<div className="tm-build__poolhead">
						<span>{t('build.uploaded', { count: String(pool.length) })}</span>
						<button type="button" className="tm-link" onClick={clearAll}>{t('build.clear')}</button>
					</div>
					<div className="tm-build__pool" style={{ height: poolHeight }}>
						{pool.map((p) => (
							<Tooltip key={p.id} content={p.name}>
								<div className="tm-build__chip" draggable onDragStart={(e) => e.dataTransfer.setData('text/plain', p.id)}>
									{p.dataUrl ? <img src={p.dataUrl} alt={p.name} /> : <span className="tm-build__cellempty">AI</span>}
									<button type="button" className="tm-build__chipx" aria-label={t('action.remove')} onClick={() => removeFromPool(p.id)}>×</button>
								</div>
							</Tooltip>
						))}
					</div>
					<div className="tm-build__resizer" onMouseDown={startResize(poolHeight, setPoolHeight, 64, 380)} title={t('build.resize')} role="separator" aria-orientation="horizontal" />
				</>
			)}

			{/* Extracted colours → mark TC / Custom */}
			<div className="tm-build__colorsec">
				<div className="tm-build__colorhead">
					<span>{t('build.extractedColors')}</span>
					<span className="tm-build__tcstep">
						<span className="tm-build__tcsteplabel">{t('build.tcColumns')}</span>
						<button type="button" onClick={removeTc} disabled={tcCount <= 1} aria-label={t('build.removeTc')}>−</button>
						<b>{tcCount}</b>
						<button type="button" onClick={addTc} disabled={tcCount >= MAX_TC} aria-label={t('build.addTc')}>+</button>
					</span>
				</div>
				{extractedColors.length === 0 ? (
					<p className="tm-build__drophint">{t('build.noColors')}</p>
				) : (
					<div className="tm-build__extracted leap-scroll">
						{extractedColors.map((c) => {
							const role = colorRoles[c.name] ?? ''
							return (
								<div key={c.name} className="tm-build__extchip" title={c.name}>
									<span className="tm-build__swatch" style={{ background: c.hex }} />
									<span className="tm-build__extname">{c.name}</span>
									{role && <span className="tm-build__extbadge">{role === 'custom' ? t('build.roleCustom') : role}</span>}
									<select
										className="tm-build__extrole"
										aria-label={t('build.markAs')}
										value={role}
										onChange={(e) => setColorRole(c.name, e.target.value)}
									>
										<option value="">{t('build.roleNone')}</option>
										{Array.from({ length: tcCount }, (_, i) => (
											<option key={`TC${i + 1}`} value={`TC${i + 1}`}>{`TC${i + 1}`}</option>
										))}
										<option value="custom">{t('build.roleCustom')}</option>
									</select>
								</div>
							)
						})}
					</div>
				)}
			</div>

			{/* League / Team target */}
			<div className="tm-build__target">
				<label className="tm-build__targetfield">
					<span>{t('build.exportLeague')}</span>
					<select value={exportLeague} onChange={(e) => setExportLeague(e.target.value)}>
						{leagues.map((l) => (
							<option key={l.Code} value={l.Code}>{l.Code}</option>
						))}
					</select>
				</label>
				<label className="tm-build__targetfield">
					<span>{t('build.exportTeam')}</span>
					<select value={exportTeam} onChange={(e) => setExportTeam(e.target.value)}>
						{exportLeagueObj.teams.map((tm) => (
							<option key={tm.TeamCode} value={tm.TeamCode}>{tm.TeamCode}</option>
						))}
					</select>
				</label>
			</div>

			{/* Logo types → sets × derived columns */}
			<div className="tm-build__types leap-scroll" style={{ height: gridHeight }}>
				{logoTypes.map((tp) => (
					<div key={tp.id} className="tm-build__type">
						<div className="tm-build__typehead">
							<input className="tm-build__typename" value={tp.name} onChange={(e) => renameLogoType(tp.id, e.target.value)} placeholder={t('build.logoType')} />
							{logoTypes.length > 1 && (
								<button type="button" className="tm-build__rowx tm-build__typex" aria-label={t('action.remove')} onClick={() => removeLogoType(tp.id)}>×</button>
							)}
						</div>

						<div className="tm-build__grid leap-scroll">
							<table>
								<thead>
									<tr>
										<th className="tm-build__corner" />
										{columns.map((c) => (
											<th key={c.id} className="tm-build__colhead" title={c.label}>
												<span>{c.token}</span>
											</th>
										))}
									</tr>
								</thead>
								<tbody>
									{tp.sets.map((s) => (
										<tr key={s.id}>
											<th className="tm-build__rowhead">
												<input value={s.name} onChange={(e) => renameSet(tp.id, s.id, e.target.value)} placeholder={t('build.setName')} />
												{tp.sets.length > 1 && (
													<button type="button" className="tm-build__rowx" aria-label={t('action.remove')} onClick={() => removeSet(tp.id, s.id)}>×</button>
												)}
											</th>
											{columns.map((c) => {
												const logo = byId(s.cells[c.token])
												return (
													<td
														key={c.id}
														className={`tm-build__cell ${logo ? 'is-filled' : ''}`}
														onDragOver={(e) => e.preventDefault()}
														onDrop={(e) => {
															e.preventDefault()
															const id = e.dataTransfer.getData('text/plain')
															if (id) assignCell(tp.id, s.id, c.token, id)
														}}
														onClick={() => logo && clearCell(tp.id, s.id, c.token)}
														title={logo ? `${logo.name} — ${t('build.clickClear')}` : t('build.dropLogo')}
													>
														{logo ? (logo.dataUrl ? <img src={logo.dataUrl} alt={logo.name} /> : <span className="tm-build__cellempty">AI</span>) : <span className="tm-build__cellempty">+</span>}
													</td>
												)
											})}
										</tr>
									))}
								</tbody>
							</table>
						</div>

						<div className="tm-build__rowactions">
							<button type="button" className="tm-link" onClick={() => addSet(tp.id)}>+ {t('build.addSet')}</button>
						</div>
					</div>
				))}

				<button type="button" className="tm-link tm-build__addtype" onClick={addLogoType}>+ {t('build.addLogoType')}</button>
			</div>
			<div className="tm-build__resizer" onMouseDown={startResize(gridHeight, setGridHeight, 120, 520)} title={t('build.resize')} role="separator" aria-orientation="horizontal" />

			{/* Action */}
			<div className="tm-build__create">
				<Button size={Size.Small} fullWidth disabled={exporting || !canExport} onClick={() => void exportAssets()}>
					{exporting ? t('build.exporting') : t('build.exportAssets')}
				</Button>
			</div>
		</div>
	)
}
