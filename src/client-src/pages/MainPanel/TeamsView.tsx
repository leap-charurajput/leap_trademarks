/*
 * TeamsView — the "Teams" tab. Mirrors the legacy team panel: team selector (with a primary/secondary
 * colour swatch) + prev/next + favourite, favourite chips, then four collapsible sections — Verbiage,
 * Colors (list/grid), Logos (background filter + list/grid) and editable Team Info.
 *
 * Document-backed actions (add colour/logo to the document) go through `controller.runDocumentOp`
 * (the single host seam); the result drives a success/pending toast. Pure-UI actions (favourites,
 * view toggles, copy, edit buffer) are local. Every control has a tooltip.
 */
import { useMemo, useState } from 'react'
import { Button, CollapsibleSection, IconButton, Tooltip } from '../../components'
import { Size, ToastType } from '../../enums'
import { useTranslation } from '../../context/LocaleContext'
import { useToast } from '../../context/ToastContext'
import { useTrademarks } from '../../context/TrademarksContext'
import controller from '../../controller'
import { presentBgKeys, teamColorIndex } from '../../data/catalog'
import { copyToClipboard } from '../../utils/clipboard'
import type { BgColorKey, Logo, Team } from '../../data/types'
import { LogoGrid } from './LogoGrid'
import { TeamPicker } from './TeamPicker'
import { AddLogoSetMenu, type AddLogoSetOptions } from './AddLogoSetMenu'

/* Label + tip for a background token in the Logos section (numeric team colours + Dark / Light). */
function teamBgLabel(key: BgColorKey): { label: string; tip: string } {
	if (key === 'dkbgnd') return { label: 'Dark', tip: 'Dark background' }
	if (key === 'ltbgnd') return { label: 'Light', tip: 'Light background' }
	const n = teamColorIndex(key)
	return { label: String(n), tip: `Team colour ${n}` }
}

/* Run a document-backed op through the controller and toast the outcome. Real host errors (e.g. "No
   open document") surface as an error toast; "pending"/no-session shows the "later phase" info toast. */
function useDocumentOp() {
	const { t } = useTranslation()
	const { notify } = useToast()
	return async (op: string, label: string, payload?: Record<string, unknown>) => {
		const r = await controller.runDocumentOp(op, payload)
		if (r.ok) notify(r.message ?? `${label} — done`, ToastType.Success)
		else if (!r.error || r.error === 'pending' || r.error === 'No Illustrator session')
			notify(t('feature.pending', { feature: label }), ToastType.Info)
		else notify(r.error, ToastType.Error)
	}
}

export function TeamsView() {
	const { t } = useTranslation()
	const { notify } = useToast()
	const { selectedLeague, selectedTeam, selectFavourite, favourites, removeFavourite } = useTrademarks()
	const runOp = useDocumentOp()

	return (
		<div className="tm-teams">
			<TeamPicker withFavourite />

			{favourites.length > 0 && (
				<div className="tm-fav-chips">
					{favourites.map((f) => (
						<span key={f.leagueCodeTeamName} className="tm-fav-chip">
							<Tooltip content={`Select ${f.teamName || f.teamID}`}>
								<button type="button" className="tm-fav-chip__name" onClick={() => selectFavourite(f.leagueCode, f.teamID)}>
									{f.leagueCode}-{f.teamName || f.teamID}
								</button>
							</Tooltip>
							<Tooltip content={t('favourite.remove')}>
								<button
									type="button"
									className="tm-fav-chip__close"
									aria-label={t('favourite.remove')}
									onClick={() => removeFavourite(f.leagueCodeTeamName)}
								>
									×
								</button>
							</Tooltip>
						</span>
					))}
				</div>
			)}

			<div className="tm-divider" />

			<VerbiageSection
				team={selectedTeam}
				onCopy={(text) => {
					/* Copy to clipboard and, if a text frame is selected in the document, apply it there too
					   (legacy copyVerbiage). The apply is best-effort and does not change the copied toast. */
					const copied = copyToClipboard(text)
					void controller.runDocumentOp('applyVerbiage', { text })
					notify(copied ? t('copied', { text }) : 'Could not copy to clipboard', copied ? ToastType.Success : ToastType.Error)
				}}
			/>
			<ColorsSection team={selectedTeam} onAdd={(colors) => void runOp('addColors', t('section.colors'), { colors })} />
			<LogosSection
				team={selectedTeam}
				onAdd={(logo) =>
					void runOp('addLogo', t('section.logos'), {
						league: selectedLeague.Code,
						team: selectedTeam.TeamCode,
						file: logo.FileName,
					})
				}
				onAddSet={(logos, opts) =>
					void runOp('addLogoSet', t('section.logos'), {
						logos: logos.map((l) => ({
							league: selectedLeague.Code,
							team: selectedTeam.TeamCode,
							file: l.FileName,
							C: l.colorInfo?.C,
							M: l.colorInfo?.M,
							Y: l.colorInfo?.Y,
							K: l.colorInfo?.K,
						})),
						applyColor: !!opts.applyColor,
						perArtboard: !!opts.perArtboard,
						setName: `${selectedTeam.TeamCode} logos`,
					})
				}
			/>
			<TeamInfoSection />
		</div>
	)
}

/* Verbiage — clickable strings that copy to the clipboard (legacy `VerbiageItem`). */
function VerbiageSection({ team, onCopy }: { team: Team; onCopy: (text: string) => void }) {
	const { t } = useTranslation()
	const copy = (text: string) => onCopy(text)
	return (
		<CollapsibleSection title={t('section.verbiage')} defaultOpen={false}>
			<p className="tm-hint">{t('verbiage.copyHint')}</p>
			<div className="tm-verbiage">
				{team.verbiage.map((v, i) => (
					<Tooltip key={`${v}-${i}`} content={`Copy "${v}"`}>
						<button type="button" className="tm-verbiage__item" onClick={() => copy(v)}>
							{v}
						</button>
					</Tooltip>
				))}
			</div>
		</CollapsibleSection>
	)
}

/* Colors — add-to-document + list/grid toggle + the colour list (legacy `colorSection`). */
function ColorsSection({ team, onAdd }: { team: Team; onAdd: (colors: Team['colors']) => void }) {
	const { t } = useTranslation()
	const { colorView, setColorView } = useTrademarks()
	/* Show only the actual team colours (numeric TeamColorIndex); exclude "Licensing Colors" / "Logo
	   Colors" document swatches that share the SLS_LOGO TeamColors array. */
	const teamColors = team.colors.filter((c) => /^\d+$/.test(String(c.TeamColorIndex)))
	return (
		<CollapsibleSection
			title={t('section.colors')}
			defaultOpen={false}
			right={
				<span className="tm-section-actions">
					<IconButton label={t('colors.add')} tooltipKey="colors.add" size={Size.Small} className="tm-iconbtn--bordered" onClick={() => onAdd(teamColors)}>
						<span className="exp-icon exp-icon--sm exp-icon--add-document" aria-hidden />
					</IconButton>
					<ViewToggle view={colorView} onChange={setColorView} />
				</span>
			}
		>
			<ul className={`tm-colors tm-colors--${colorView}`}>
				{teamColors.map((c) => (
					<li key={c.TeamColorIndex} className="tm-color">
						<Tooltip content={`${c.PantoneName || c.text} · ${c.Hex}`}>
							<span className="tm-color__swatch" style={{ backgroundColor: c.color }} />
						</Tooltip>
						{colorView === 'grid' ? (
							<span className="tm-color__num">{c.text}</span>
						) : (
							<span className="tm-color__name">{c.PantoneName || c.text}</span>
						)}
					</li>
				))}
			</ul>
		</CollapsibleSection>
	)
}

/* Logos — background filter chips + list/grid toggle + the logo grid (legacy `logoSection`). */
function LogosSection({ team, onAdd, onAddSet }: { team: Team; onAdd: (logo: Logo) => void; onAddSet: (logos: Logo[], opts: AddLogoSetOptions) => void }) {
	const { t } = useTranslation()
	const [filter, setFilter] = useState<BgColorKey | 'all'>('all')
	const [view, setView] = useState<'list' | 'grid'>('grid')
	const logos = filter === 'all' ? team.logos : team.logos.filter((l) => l.bgKey === filter)

	/* Filter chips derived from the tokens actually present (grows with TC3/TC4/…). */
	const filters = useMemo(
		() => [{ key: 'all' as const, label: 'All', tip: 'All backgrounds' }, ...presentBgKeys(team.logos).map((key) => ({ key, ...teamBgLabel(key) }))],
		[team.logos],
	)

	return (
		<CollapsibleSection
			title={t('section.logos')}
			defaultOpen={false}
			right={
				<span className="tm-section-actions">
					<AddLogoSetMenu disabled={logos.length === 0} onPick={(o) => onAddSet(logos, o)} />
					<ViewToggle view={view} onChange={setView} />
				</span>
			}
		>
			<div className="tm-logo-filters">
				{filters.map((f) => (
					<Tooltip key={f.key} content={f.tip}>
						<button
							type="button"
							className={`tm-logo-filter ${filter === f.key ? 'is-active' : ''}`}
							onClick={() => setFilter(f.key)}
						>
							{f.label}
						</button>
					</Tooltip>
				))}
			</div>
			<LogoGrid logos={logos} view={view} onAdd={onAdd} />
		</CollapsibleSection>
	)
}

/* Team Info — read-only rows with an Edit toggle; editing reveals inputs + Save/Cancel (legacy). */
function TeamInfoSection() {
	const { t } = useTranslation()
	const { notify } = useToast()
	const { teamProperties, editMode, editedTeam, beginEdit, cancelEdit, saveEdit, setEditedField } = useTrademarks()
	return (
		<CollapsibleSection
			title={t('section.teamInfo')}
			defaultOpen={false}
			right={
				!editMode ? (
					<IconButton label={t('teamInfo.edit')} tooltipKey="teamInfo.edit" size={Size.Small} className="tm-iconbtn--bordered" onClick={beginEdit}>
						<span className="exp-icon exp-icon--sm exp-icon--edit" aria-hidden />
					</IconButton>
				) : undefined
			}
		>
			<dl className="tm-teaminfo">
				{teamProperties.map((p) => (
					<div key={p.key} className="tm-teaminfo__row">
						<dt className="tm-teaminfo__label">{p.label}</dt>
						<dd className="tm-teaminfo__value">
							{editMode ? (
								<input type="text" value={(editedTeam[p.key] as string) ?? ''} onChange={(e) => setEditedField(p.key, e.target.value)} />
							) : (
								((editedTeam[p.key] as string) || '—')
							)}
						</dd>
					</div>
				))}
			</dl>
			{editMode && (
				<div className="tm-teaminfo__actions">
					<Button size={Size.Small} onClick={cancelEdit}>
						{t('action.cancel')}
					</Button>
					<Button
						size={Size.Small}
						onClick={() => {
							const r = saveEdit()
							if (r.ok) notify(t('teamInfo.saved'), ToastType.Success)
							else notify(r.error ?? 'Could not save team info', ToastType.Error)
						}}
					>
						{t('action.save')}
					</Button>
				</div>
			)}
		</CollapsibleSection>
	)
}

/* Small list/grid view switch reused by Colors and Logos (legacy `view-controls`). */
function ViewToggle({ view, onChange }: { view: 'list' | 'grid'; onChange: (v: 'list' | 'grid') => void }) {
	const { t } = useTranslation()
	return (
		<span className="tm-view-toggle">
			<Tooltip content={t('view.list')}>
				<button type="button" className={`tm-view-toggle__btn ${view === 'list' ? 'is-active' : ''}`} aria-label={t('view.list')} onClick={() => onChange('list')}>
					<span className="exp-icon exp-icon--sm exp-icon--list" aria-hidden />
				</button>
			</Tooltip>
			<Tooltip content={t('view.grid')}>
				<button type="button" className={`tm-view-toggle__btn ${view === 'grid' ? 'is-active' : ''}`} aria-label={t('view.grid')} onClick={() => onChange('grid')}>
					<span className="exp-icon exp-icon--sm exp-icon--grid" aria-hidden />
				</button>
			</Tooltip>
		</span>
	)
}
