/*
 * VersionFooter — the one-line status bar pinned under all panel content, so the user can always
 * tell which web-app environment the panel is running and the panel build version. It reflects the
 * RUNNING environment (page origin), not the saved Data Settings choice — a pending version switch
 * only shows here after the Illustrator restart that applies it.
 */
import { useTranslation } from '../../context/LocaleContext'
import { APP_VERSION, detectRunningEnvironment } from '../../constants'
import './style.css'

export function VersionFooter() {
	const { t } = useTranslation()
	const running = detectRunningEnvironment()

	return (
		<footer className="version-footer">
			<span className="version-footer__env">{running ? t(running.labelKey) : ''}</span>
			<span className="version-footer__ver">v{APP_VERSION}</span>
		</footer>
	)
}
