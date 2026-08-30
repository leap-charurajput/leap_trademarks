/*
 * LeagueLogosView — the "League Logos" tab: the logos discovered in the league's logos folder
 * (legacy `leagueServerLogos`). A single grid block.
 */
import { ToastType } from '../../enums'
import { useTranslation } from '../../context/LocaleContext'
import { useToast } from '../../context/ToastContext'
import { useTrademarks } from '../../context/TrademarksContext'
import { LogoGrid } from './LogoGrid'

export function LeagueLogosView() {
	const { t } = useTranslation()
	const { notify } = useToast()
	const { selectedLeague } = useTrademarks()
	return (
		<div className="tm-league">
			<div className="tm-block">
				<div className="tm-block__title">{t('section.logo')}</div>
				<LogoGrid
					logos={selectedLeague.leagueServerLogos}
					view="grid"
					onAdd={() => notify(t('feature.pending', { feature: t('tab.leagueLogos') }), ToastType.Info)}
				/>
			</div>
		</div>
	)
}
