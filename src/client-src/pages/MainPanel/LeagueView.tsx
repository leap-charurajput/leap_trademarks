/*
 * LeagueView — the "League" tab. Shows the logos of every team in the selected league in a single
 * grid, with filters: a logo-set selector, a background filter (Primary colour / Dark / Light), and a
 * team-name search box. Add-to-document goes through the controller seam (success/pending toast).
 */
import { useMemo, useState } from 'react'
import { Dropdown, SearchInput, Tooltip, type DropdownOption } from '../../components'
import { Size, ToastType } from '../../enums'
import { useTranslation } from '../../context/LocaleContext'
import { useToast } from '../../context/ToastContext'
import { useTrademarks } from '../../context/TrademarksContext'
import controller from '../../controller'
import { presentBgKeys, teamColorIndex } from '../../data/catalog'
import type { BgColorKey, Logo } from '../../data/types'
import { LogoGrid } from './LogoGrid'
import { AddLogoSetMenu, type AddLogoSetOptions } from './AddLogoSetMenu'

/* Label + tip for a background token on the League tab (Primary / Secondary / Color N / Dark / Light). */
function leagueBgLabel(key: BgColorKey): { label: string; tip: string } {
	if (key === 'dkbgnd') return { label: 'Dark', tip: 'Dark background' }
	if (key === 'ltbgnd') return { label: 'Light', tip: 'Light background' }
	const n = teamColorIndex(key)
	const label = n === 1 ? 'Primary' : n === 2 ? 'Secondary' : `Color ${n}`
	return { label, tip: `Team colour ${n}` }
}

/* A league logo carries its team so the search box can filter by team name/code. */
type LeagueLogo = Logo & { teamName: string; teamCode: string }

export function LeagueView() {
	const { t } = useTranslation()
	const { notify } = useToast()
	const { selectedLeague } = useTrademarks()

	const [setFilter, setSetFilter] = useState('all')
	const [bgFilter, setBgFilter] = useState<BgColorKey | 'all'>('all')
	const [search, setSearch] = useState('')

	/* Flatten every team's logos into one list, tagged with the owning team. */
	const allLogos = useMemo<LeagueLogo[]>(
		() => selectedLeague.teams.flatMap((tm) => tm.logos.map((l) => ({ ...l, teamName: tm.FullName, teamCode: tm.TeamCode }))),
		[selectedLeague],
	)

	/* Background filter chips, derived from the tokens actually present (grows with TC3/TC4/…). */
	const bgFilters = useMemo(
		() => [{ key: 'all' as const, label: 'All', tip: 'All backgrounds' }, ...presentBgKeys(allLogos).map((key) => ({ key, ...leagueBgLabel(key) }))],
		[allLogos],
	)

	/* Distinct logo-set names across the whole league (for the set dropdown). */
	const setOptions = useMemo<DropdownOption<string>[]>(() => {
		const seen: string[] = []
		for (const l of allLogos) if (!seen.includes(l.SetName)) seen.push(l.SetName)
		return [{ value: 'all', label: 'All logo sets' }, ...seen.map((n) => ({ value: n, label: n }))]
	}, [allLogos])

	const query = search.trim().toLowerCase()
	/* Memoised so its identity is stable while scrolling (only changes when a filter changes), which
	   keeps LogoGrid's infinite-scroll window from resetting. */
	const filtered = useMemo(
		() =>
			allLogos.filter(
				(l) =>
					(setFilter === 'all' || l.SetName === setFilter) &&
					(bgFilter === 'all' || l.bgKey === bgFilter) &&
					(query === '' || l.teamName.toLowerCase().includes(query) || l.teamCode.toLowerCase().includes(query)),
			),
		[allLogos, setFilter, bgFilter, query],
	)

	const addLogo = async (logo: Logo) => {
		const ll = logo as LeagueLogo
		const r = await controller.runDocumentOp('addLogo', { league: selectedLeague.Code, team: ll.teamCode, file: logo.FileName })
		if (r.ok) notify(r.message ?? 'Logo added', ToastType.Success)
		else if (!r.error || r.error === 'pending' || r.error === 'No Illustrator session')
			notify(t('feature.pending', { feature: t('section.logo') }), ToastType.Info)
		else notify(r.error, ToastType.Error)
	}

	/* Add all currently-filtered logos to the document (legacy exportLogosWithColorBgnd): optionally with a
	   coloured background, and optionally one logo per artboard. */
	const addFilteredSet = async (opts: AddLogoSetOptions) => {
		if (filtered.length === 0) return
		const r = await controller.runDocumentOp('addLogoSet', {
			logos: filtered.map((l) => ({
				league: selectedLeague.Code,
				team: l.teamCode,
				file: l.FileName,
				C: l.colorInfo?.C,
				M: l.colorInfo?.M,
				Y: l.colorInfo?.Y,
				K: l.colorInfo?.K,
			})),
			applyColor: !!opts.applyColor,
			perArtboard: !!opts.perArtboard,
			setName: `${selectedLeague.Code} ${setFilter === 'all' ? 'logos' : setFilter}`,
		})
		if (r.ok) notify(r.message ?? 'Logos added', ToastType.Success)
		else if (!r.error || r.error === 'pending' || r.error === 'No Illustrator session')
			notify(t('feature.pending', { feature: 'Add logos' }), ToastType.Info)
		else notify(r.error, ToastType.Error)
	}

	return (
		<div className="tm-league">
			<SearchInput value={search} onChange={setSearch} placeholder="Search team…" fullWidth />

			<Tooltip content={t('section.logoSets')}>
				<Dropdown<string> value={setFilter} options={setOptions} onChange={setSetFilter} size={Size.Small} fullWidth />
			</Tooltip>

			<div className="tm-logo-filters">
				{bgFilters.map((f) => (
					<Tooltip key={f.key} content={f.tip}>
						<button
							type="button"
							className={`tm-logo-filter ${bgFilter === f.key ? 'is-active' : ''}`}
							onClick={() => setBgFilter(f.key)}
						>
							{f.label}
						</button>
					</Tooltip>
				))}
				<span className="tm-league-download">
					<AddLogoSetMenu disabled={filtered.length === 0} onPick={(o) => void addFilteredSet(o)} />
				</span>
			</div>

			<LogoGrid logos={filtered} view="grid" onAdd={addLogo} showSetBadge={false} fill emptyText="No logos match the filters." />
		</div>
	)
}
