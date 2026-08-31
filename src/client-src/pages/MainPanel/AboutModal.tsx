/*
 * AboutModal — port of the legacy "About LEAP Trademarks" subpanel: product name, version, credits
 * and contact. Static content for now.
 */
import { Button, Modal } from '../../components'
import { ButtonVariant, Size } from '../../enums'
import { useTranslation } from '../../context/LocaleContext'
import { useTrademarks } from '../../context/TrademarksContext'

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
				<p className="tm-about__name">LEAP Trademarks</p>
				<p className="tm-about__row">Version 5.0.1 (React)</p>
				<p className="tm-about__row">Release Date: June 13, 2026</p>
				<p className="tm-about__row">Product Design: Hanaan Rosenthal</p>
				<p className="tm-about__row">Development: Charu Rajput</p>
				<p className="tm-about__row">
					Contact: <a href="mailto:leap@octane5.com">leap@octane5.com</a>
				</p>
			</div>
		</Modal>
	)
}
