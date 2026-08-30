/*
 * TeamPicker — the team selector row shared by the Teams and Manage Logos tabs: the label (with an
 * optional favourite star), prev/next carets and the searchable team select. Both tabs act on the
 * same `selectedTeam` in TrademarksContext, so switching team on one is reflected on the other.
 *
 * Extracted from TeamsView when Manage Logos landed, so the two tabs share one selector rather than
 * two copies that could drift (AGENTS §2.3).
 */
import { IconButton, SearchSelect, Tooltip, type DropdownOption } from '../../components'
import { Size } from '../../enums'
import { useTranslation } from '../../context/LocaleContext'
import { useTrademarks } from '../../context/TrademarksContext'

export interface TeamPickerProps {
	/* Show the "add to favourites" star (Teams tab only). */
	withFavourite?: boolean
}

export function TeamPicker({ withFavourite = false }: TeamPickerProps) {
	const { t } = useTranslation()
	const { selectedLeague, selectedTeam, setTeam, prevTeam, nextTeam, isFavourite, toggleFavourite } = useTrademarks()

	/* Options labelled "CODE — Team Name" with a primary/secondary colour chip; the league's teams are
	   already sorted alphabetically. */
	const teamOptions: DropdownOption<string>[] = selectedLeague.teams.map((tm) => ({
		value: tm.TeamCode,
		label: `${tm.TeamCode} — ${tm.FullName}`,
		colors: [tm.primaryColorCode, tm.secondaryColorCode],
	}))
	const favourite = isFavourite(selectedTeam.TeamCode)

	return (
		<>
			<div className="tm-team-row">
				<span className="tm-team-row__label">{t('label.teamName')}</span>
				{withFavourite && (
					<IconButton
						label={favourite ? t('favourite.remove') : t('favourite.add')}
						tooltipKey={favourite ? 'favourite.remove' : 'favourite.add'}
						size={Size.Small}
						active={favourite}
						onClick={toggleFavourite}
					>
						<span className={`exp-icon exp-icon--sm exp-icon--${favourite ? 'star-filled' : 'star'}`} aria-hidden />
					</IconButton>
				)}
			</div>
			<div className="tm-team-select-row">
				<Tooltip content="Previous team">
					<button type="button" className="tm-navbtn" aria-label="Previous team" onClick={prevTeam}>
						<span className="exp-icon exp-icon--popup-arrow tm-caret tm-caret--left" aria-hidden />
					</button>
				</Tooltip>
				<span className="tm-team-row__select">
					<Tooltip content={selectedTeam.FullName}>
						<SearchSelect<string>
							value={selectedTeam.TeamCode}
							options={teamOptions}
							onChange={setTeam}
							size={Size.Small}
							placeholder={t('label.selectTeam')}
							searchPlaceholder="Search team…"
							fullWidth
						/>
					</Tooltip>
				</span>
				<Tooltip content="Next team">
					<button type="button" className="tm-navbtn" aria-label="Next team" onClick={nextTeam}>
						<span className="exp-icon exp-icon--popup-arrow tm-caret tm-caret--right" aria-hidden />
					</button>
				</Tooltip>
			</div>
		</>
	)
}
