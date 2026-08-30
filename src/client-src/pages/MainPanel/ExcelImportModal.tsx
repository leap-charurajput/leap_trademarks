/*
 * ExcelImportModal — "Import Excel Data". The user first picks an Excel file (handled by the context's
 * startExcelImport → controller.chooseAndParseExcel); this modal then shows every league (existing
 * SLS_MASTER leagues + the newly parsed Excel leagues) as a reorderable list. The user checks which
 * Excel leagues to import and drags rows to set the order; Incorporate writes the per-team JSON files
 * and rebuilds SLS_MASTER.json in that exact order (controller.incorporateExcelImport), then reloads.
 *
 * All columns are imported (no per-column UI). Existing leagues not present in the Excel are shown as
 * "kept" — they stay in SLS_MASTER and can be reordered, but are not re-imported.
 */
import { useEffect, useMemo, useState } from 'react'
import { Button, Checkbox, Modal } from '../../components'
import { ButtonVariant, Size, ToastType } from '../../enums'
import { useTranslation } from '../../context/LocaleContext'
import { useToast } from '../../context/ToastContext'
import { useTrademarks } from '../../context/TrademarksContext'
import controller, { type ImportLeagueRow } from '../../controller'

export function ExcelImportModal() {
	const { t } = useTranslation()
	const { notify } = useToast()
	const { excelOpen, setExcelOpen, importSession, reload } = useTrademarks()

	const [rows, setRows] = useState<ImportLeagueRow[]>([])
	const [selected, setSelected] = useState<Set<string>>(new Set())
	const [busy, setBusy] = useState(false)
	/* The code of the row currently being dragged (null when not dragging). */
	const [dragCode, setDragCode] = useState<string | null>(null)

	/* Seed the list + default selection (all importable leagues) whenever a new file is parsed. */
	useEffect(() => {
		if (!importSession) return
		setRows(importSession.rows)
		setSelected(new Set(importSession.rows.filter((r) => r.inExcel).map((r) => r.code)))
	}, [importSession])

	const importable = useMemo(() => rows.filter((r) => r.inExcel), [rows])
	const allSelected = importable.length > 0 && importable.every((r) => selected.has(r.code))

	if (!excelOpen || !importSession) return null

	const rawName = importSession.filePath.split(/[\\/]/).pop() ?? importSession.filePath
	let fileName = rawName
	try {
		fileName = decodeURI(rawName)
	} catch {
		/* keep raw on malformed URI */
	}

	const toggle = (code: string) =>
		setSelected((prev) => {
			const next = new Set(prev)
			if (next.has(code)) next.delete(code)
			else next.add(code)
			return next
		})

	const toggleAll = (value: boolean) =>
		setSelected(value ? new Set(importable.map((r) => r.code)) : new Set())

	/* Live drag-and-drop reordering: as the dragged row passes over another, swap it into that slot so
	   the list shuffles smoothly under the cursor (instead of only moving on drop). */
	const onDragEnterRow = (targetCode: string) => {
		if (!dragCode || dragCode === targetCode) return
		setRows((prev) => {
			const from = prev.findIndex((r) => r.code === dragCode)
			const to = prev.findIndex((r) => r.code === targetCode)
			if (from < 0 || to < 0) return prev
			const next = [...prev]
			const [moved] = next.splice(from, 1)
			next.splice(to, 0, moved)
			return next
		})
	}

	const incorporate = () => {
		const selectedCodes = rows.filter((r) => r.inExcel && selected.has(r.code)).map((r) => r.code)
		if (selectedCodes.length === 0) {
			notify(t('excel.noneSelected'), ToastType.Warning)
			return
		}
		setBusy(true)
		const res = controller.incorporateExcelImport({
			parsed: importSession.parsed,
			orderedCodes: rows.map((r) => r.code),
			selectedCodes,
		})
		setBusy(false)
		if (res.ok) {
			notify(t('excel.done', { count: String(res.count) }), ToastType.Success)
			setExcelOpen(false)
			reload()
		} else {
			notify(t('excel.failed', { error: res.error ?? '' }), ToastType.Error)
		}
	}

	return (
		<Modal
			open={excelOpen}
			title={t('excel.title')}
			width={360}
			onClose={() => setExcelOpen(false)}
			footer={
				<div className="tm-modal-footer tm-modal-footer--center">
					<Button variant={ButtonVariant.Secondary} size={Size.Small} onClick={() => setExcelOpen(false)}>
						{t('action.cancel')}
					</Button>
					<Button size={Size.Small} onClick={incorporate} disabled={busy}>
						{busy ? t('excel.importing') : t('excel.incorporate')}
					</Button>
				</div>
			}
		>
			<div className="tm-excel">
				<p className="tm-excel__file">{t('excel.file', { name: fileName })}</p>
				<p className="tm-excel__intro">{t('excel.intro')}</p>

				<div className="tm-excel__all">
					<Checkbox checked={allSelected} onChange={toggleAll} label={t('excel.selectAllLeagues')} />
				</div>

				<ul className={`tm-excel__leagues leap-scroll ${dragCode ? 'is-dragging' : ''}`}>
					{rows.map((row) => (
						<li
							key={row.code}
							className={`tm-excel-row ${dragCode === row.code ? 'tm-excel-row--dragging' : ''}`}
							draggable
							onDragStart={(e) => {
								setDragCode(row.code)
								/* 'move' removes the green "+" (copy) drag cursor and keeps the gesture smooth. */
								e.dataTransfer.effectAllowed = 'move'
								e.dataTransfer.setData('text/plain', row.code)
							}}
							onDragEnter={() => onDragEnterRow(row.code)}
							onDragOver={(e) => {
								e.preventDefault()
								e.dataTransfer.dropEffect = 'move'
							}}
							onDrop={(e) => {
								e.preventDefault()
								setDragCode(null)
							}}
							onDragEnd={() => setDragCode(null)}
						>
							<span className="tm-excel-row__grip" aria-hidden>⋮⋮</span>
							{row.inExcel ? (
								<Checkbox checked={selected.has(row.code)} onChange={() => toggle(row.code)} label="" />
							) : (
								<span className="tm-excel-row__kept" title={t('excel.keptOnly')}>{t('excel.keptOnly')}</span>
							)}
							<span className="tm-excel-row__meta">
								<span className="tm-excel-row__name">
									{row.code}
									<span className="tm-excel-row__count">{t('excel.teamsCount', { count: String(row.teamCount) })}</span>
									{!row.inMaster && row.inExcel && <span className="tm-excel-row__new">{t('excel.new')}</span>}
								</span>
							</span>
						</li>
					))}
				</ul>
			</div>
		</Modal>
	)
}
