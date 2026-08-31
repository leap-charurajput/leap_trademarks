/*
 * VersionFooter — the one-line status bar pinned under all panel content, so the user can always
 * tell which web-app environment the panel is running and the panel build version. It reflects the
 * RUNNING environment (page origin), not the saved Data Settings choice — a pending version switch
 * only shows here after the Illustrator restart that applies it.
 */
import { useTranslation } from '../../context/LocaleContext'
import { APP_VERSION, detectRunningEnvironment } from '../../constants'
import './style.css'

/* `onSettingsClick` (optional) renders a ⚙ button on the footer's left — the always-visible entry
   to the Settings panel, reachable in every panel state. Kept prop-driven so the kit stays pure. */
export function VersionFooter({ onSettingsClick }: { onSettingsClick?: () => void }) {
	const { t } = useTranslation()
	const running = detectRunningEnvironment()

	return (
		<footer className="version-footer">
			<span className="version-footer__left">
				{onSettingsClick && (
					<button type="button" className="version-footer__settings" onClick={onSettingsClick} aria-label="Settings">
						<span className="exp-icon exp-icon--sm exp-icon--settings" aria-hidden />
					</button>
				)}
				<span className="version-footer__env">{running ? t(running.labelKey) : ''}</span>
			</span>
			<span className="version-footer__ver">v{APP_VERSION}</span>
		</footer>
	)
}
