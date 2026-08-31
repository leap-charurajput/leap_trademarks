/*
 * AboutModal — the "About LEAP Trademarks" dialog: product name, version, credits and contact.
 * Name/version/release-date/contact all come from constants (version via APP_VERSION →
 * PANEL.version) so the dialog can never drift from the build it ships in.
 */
import controller from '../../controller'
import { Button, Modal } from '../../components'
import { ButtonVariant, Size } from '../../enums'
import { useTranslation } from '../../context/LocaleContext'
import { useTrademarks } from '../../context/TrademarksContext'
import { APP_NAME, APP_RELEASE_DATE, APP_VERSION, SUPPORT_EMAIL } from '../../constants'

export function AboutModal() {
	const { t } = useTranslation()
	const { aboutOpen, setAboutOpen } = useTrademarks()
	if (!aboutOpen) return null
	return (
		<Modal
			open={aboutOpen}
			title={t('flyout.about')}
			width={320}
			onClose={() => setAboutOpen(false)}
			footer={
				<div className="tm-modal-footer">
					<Button variant={ButtonVariant.Secondary} size={Size.Small} onClick={() => setAboutOpen(false)}>
						{t('action.close')}
					</Button>
				</div>
			}
		>
			<div className="tm-about">
				<p className="tm-about__name">{APP_NAME}</p>
				<p className="tm-about__row">Version {APP_VERSION}</p>
				<p className="tm-about__row">Release Date: {APP_RELEASE_DATE}</p>
				<p className="tm-about__row">Product Design: Hanaan Rosenthal</p>
				<p className="tm-about__row">Development: Charu Rajput</p>
				<p className="tm-about__row">
					Contact:{' '}
					{/* The href stays for hover/right-click, but the click is handled: CEF cannot navigate to
					    mailto: and would fail with ERR_UNKNOWN_URL_SCHEME. */}
					<a
						href={`mailto:${SUPPORT_EMAIL}`}
						onClick={(e) => {
							e.preventDefault()
							controller.openExternalUrl(`mailto:${SUPPORT_EMAIL}`)
						}}
					>
						{SUPPORT_EMAIL}
					</a>
				</p>
			</div>
		</Modal>
	)
}
