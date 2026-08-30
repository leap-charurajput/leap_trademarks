/*
 * PanelOverlays — full-panel states that replace the main UI (legacy `ng-show` overlays):
 *   loading · auth check · unrecognised install · welcome (locate folder) · no server connected.
 * Which one shows is driven by TrademarksContext.panelState.
 */
import { Button } from '../../components'
import { Size, ToastType } from '../../enums'
import { useTranslation } from '../../context/LocaleContext'
import { useToast } from '../../context/ToastContext'
import { useTrademarks } from '../../context/TrademarksContext'

export function PanelOverlays() {
	const { t } = useTranslation()
	const { notify } = useToast()
	const { panelState } = useTrademarks()

	if (panelState === 'loading' || panelState === 'auth') {
		return (
			<div className="tm-overlay">
				<div className="tm-overlay__spinner" aria-hidden />
				<p className="tm-overlay__text">{t('auth.checking')}</p>
			</div>
		)
	}

	if (panelState === 'unrecognized') {
		return (
			<div className="tm-overlay tm-overlay--message">
				<h2 className="tm-overlay__title">{t('unrecognized.title')}</h2>
				<p className="tm-overlay__text">{t('unrecognized.body')}</p>
			</div>
		)
	}

	if (panelState === 'welcome') {
		return (
			<div className="tm-overlay tm-overlay--message">
				<h2 className="tm-overlay__title">{t('welcome.title')}</h2>
				<p className="tm-overlay__text">{t('welcome.body')}</p>
				<Button size={Size.Small} onClick={() => notify(t('feature.pending', { feature: t('welcome.locate') }), ToastType.Info)}>
					{t('welcome.locate')}
				</Button>
			</div>
		)
	}

	/* no server */
	return (
		<div className="tm-overlay tm-overlay--message">
			<span className="exp-icon exp-icon--caution" aria-hidden />
			<p className="tm-overlay__text">{t('server.warning')}</p>
		</div>
	)
}
