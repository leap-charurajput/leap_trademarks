/*
 * ManageLogosView — the "Manage" tab: housekeeping for a team's parsed logos on the server.
 *
 * It lists the team's logo sets exactly as SLS_LOGO_<team>.json stores them — one row per logo
 * *version* (the ai/png/svg trio), NOT per background colour like the Teams/League grids, because a
 * single file can serve several colour columns and deleting is a per-file operation.
 *
 * Two destructive actions, both confirmed first and both irreversible:
 *   - delete selected logos → removes their ai/png/svg files AND their JSON entries,
 *   - delete a whole set     → the same for every version in the set, then drops the set.
 * The controller rewrites the JSON before unlinking anything, so a failure leaves the server intact.
 * After a delete the manifest is re-read and the catalog reloaded, so every other tab agrees.
 */
import { useCallback, useEffect, useMemo, useState } from 'react'
import { Button, Checkbox, CollapsibleSection, IconButton, Tooltip } from '../../components'
import { ButtonVariant, Size, ToastType } from '../../enums'
import { useConfirmDialog } from '../../context/ConfirmDialogContext'
import { useToast } from '../../context/ToastContext'
import { useTranslation } from '../../context/LocaleContext'
import { useTrademarks } from '../../context/TrademarksContext'
import controller, { type DeleteLogosResult, type ManagedLogo, type ManagedLogoSet } from '../../controller'
import { LogoImage } from './LogoImage'
import { TeamPicker } from './TeamPicker'

export function ManageLogosView() {
	const { t } = useTranslation()
	const { notify } = useToast()
	const { confirm } = useConfirmDialog()
	const { selectedLeague, selectedTeam, reload } = useTrademarks()

	const [sets, setSets] = useState<ManagedLogoSet[]>([])
	const [loading, setLoading] = useState(true)
	const [busy, setBusy] = useState(false)
	/* Ids of the versions ticked for bulk deletion (cleared whenever the list is re-read). */
	const [selected, setSelected] = useState<string[]>([])

	const league = selectedLeague.Code
	const teamCode = selectedTeam.TeamCode

	const load = useCallback(async () => {
		setLoading(true)
		setSelected([])
		try {
			setSets(await controller.loadLogoManifest(league, teamCode))
		} finally {
			setLoading(false)
		}
	}, [league, teamCode])

	useEffect(() => {
		void load()
	}, [load])

	const allLogos = useMemo(() => sets.flatMap((s) => s.logos), [sets])
	const total = allLogos.length

	const toggle = (id: string) => setSelected((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]))

	/* Report what a delete actually did — entries removed, files unlinked, and (when they differ) files
	   that were already gone, which is the signal that the JSON and the disk had drifted apart. */
	const report = (r: DeleteLogosResult) => {
		if (!r.ok) {
			notify(r.error ?? t('manage.deleteFailed'), ToastType.Error)
			return
		}
		notify(t('manage.deleted', { count: String(r.removed), files: String(r.filesDeleted) }), ToastType.Success)
		if (r.filesMissing > 0) notify(t('manage.filesMissing', { count: String(r.filesMissing) }), ToastType.Warning)
		void load()
		reload()
	}

	const deleteSelected = async () => {
		if (busy || selected.length === 0) return
		const ok = await confirm({
			title: t('manage.deleteLogosTitle'),
			message: t('manage.deleteLogosBody', { count: String(selected.length), team: `${league}-${teamCode}` }),
			confirmText: t('action.delete'),
			confirmVariant: ButtonVariant.Danger,
		})
		if (!ok) return
		setBusy(true)
		try {
			report(controller.deleteLogos(league, teamCode, selected))
		} finally {
			setBusy(false)
		}
	}

	const deleteOne = async (logo: ManagedLogo) => {
		if (busy) return
		const ok = await confirm({
			title: t('manage.deleteLogoTitle'),
			message: t('manage.deleteLogoBody', { file: logo.fileNameAI || logo.fileNamePNG, team: `${league}-${teamCode}` }),
			confirmText: t('action.delete'),
			confirmVariant: ButtonVariant.Danger,
		})
		if (!ok) return
		setBusy(true)
		try {
			report(controller.deleteLogos(league, teamCode, [logo.id]))
		} finally {
			setBusy(false)
		}
	}

	const deleteSet = async (set: ManagedLogoSet) => {
		if (busy) return
		const ok = await confirm({
			title: t('manage.deleteSetTitle'),
			message: t('manage.deleteSetBody', { set: set.setName, count: String(set.logos.length), team: `${league}-${teamCode}` }),
			confirmText: t('action.delete'),
			confirmVariant: ButtonVariant.Danger,
		})
		if (!ok) return
		setBusy(true)
		try {
			report(controller.deleteLogoSet(league, teamCode, set.setName))
		} finally {
			setBusy(false)
		}
	}

	return (
		<div className="tm-manage">
			<TeamPicker />

			<div className="tm-manage__bar">
				<span className="tm-hint">{loading ? t('manage.loading') : t('manage.count', { count: String(total), sets: String(sets.length) })}</span>
				<IconButton label={t('action.refresh')} tooltipKey="action.refresh" size={Size.Small} disabled={busy} onClick={() => void load()}>
					<span className="exp-icon exp-icon--sm exp-icon--refresh" aria-hidden />
				</IconButton>
			</div>

			{!loading && total === 0 && <p className="tm-empty">{t('manage.empty')}</p>}

			<div className="tm-manage__sets leap-scroll">
				{sets.map((set) => (
					<CollapsibleSection
						key={set.setName}
						title={`${set.setName} (${set.logos.length})`}
						defaultOpen={sets.length === 1}
						right={
							<IconButton
								label={t('manage.deleteSet', { set: set.setName })}
								size={Size.Small}
								className="tm-iconbtn--danger"
								disabled={busy}
								onClick={() => void deleteSet(set)}
							>
								<span className="exp-icon exp-icon--sm exp-icon--delete" aria-hidden />
							</IconButton>
						}
					>
						<ul className="tm-manage-list">
							{set.logos.map((logo) => (
								<li key={logo.id} className="tm-manage-row">
									<Checkbox checked={selected.includes(logo.id)} onChange={() => toggle(logo.id)} disabled={busy} />
									<span className="tm-manage-row__thumb">
										<LogoImage src={logo.previewUrl} fallback={logo.previewFallbackUrl} alt={logo.fileNameAI} />
									</span>
									<span className="tm-manage-row__meta">
										<Tooltip content={logo.fileNameAI || logo.fileNamePNG}>
											<span className="tm-manage-row__name">{logo.fileNameAI || logo.fileNamePNG}</span>
										</Tooltip>
										<span className="tm-manage-row__sub">
											{[logo.type, logo.backgrounds.join(', ')].filter(Boolean).join(' · ') || '—'}
										</span>
									</span>
									<IconButton
										label={t('manage.deleteLogo')}
										tooltipKey="manage.deleteLogo"
										size={Size.Small}
										className="tm-iconbtn--danger"
										disabled={busy}
										onClick={() => void deleteOne(logo)}
									>
										<span className="exp-icon exp-icon--sm exp-icon--delete" aria-hidden />
									</IconButton>
								</li>
							))}
						</ul>
					</CollapsibleSection>
				))}
			</div>

			{selected.length > 0 && (
				<div className="tm-manage__actions">
					<Button size={Size.Small} disabled={busy} onClick={() => setSelected([])}>
						{t('manage.clearSelection')}
					</Button>
					<Button size={Size.Small} variant={ButtonVariant.Danger} disabled={busy} onClick={() => void deleteSelected()}>
						{t('manage.deleteSelected', { count: String(selected.length) })}
					</Button>
				</div>
			)}
		</div>
	)
}
