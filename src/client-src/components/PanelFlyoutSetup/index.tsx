/*
 * PanelFlyoutSetup — registers the Adobe panel flyout menu ("≡") via CSInterface.setPanelFlyoutMenu
 * and handles its clicks. Renders nothing. Mirrors the legacy LEAP Trademarks menu:
 *   Refresh Server Connection · Manage Servers · LEAP Data Settings ·
 *   Create color swatches in Lab color space (toggle) · Import Excel Data ·
 *   Open Logs Folder · Open Debug Console · About LEAP Trademarks
 * The toggle persists in TrademarksContext.general and re-renders its checkmark via
 * updatePanelMenuItem. Modal items open the corresponding dialog through the context.
 */
import { useEffect } from 'react'
import controller from '../../controller'
import { useToast } from '../../context/ToastContext'
import { useTrademarks } from '../../context/TrademarksContext'
import { useAuth } from '../../context/AuthContext'
import { useTranslation } from '../../context/LocaleContext'
import { ToastType } from '../../enums'
import { DEBUG_CONSOLE_URL } from '../../constants'
import { getCSInterface, isCEP } from '@lib/helper'

const EVENT_FLYOUT_MENU_CLICKED = 'com.adobe.csxs.events.flyoutMenuClicked'

/* Build the flyout XML for the panel menu. The Sign Out item appears only for a real signed-in user. */
function buildFlyoutXml(labels: Record<string, string>, showLogout: boolean): string {
	return (
		'<Menu>' +
		'<MenuItem Id="refreshServer" Label="' + labels.refreshServer + '" Enabled="true"/>' +
		'<MenuItem Id="importExcel" Label="' + labels.importExcel + '" Enabled="true"/>' +
		'<MenuItem Label="---" />' +
		'<MenuItem Id="openLogs" Label="' + labels.openLogs + '" Enabled="true"/>' +
		'<MenuItem Id="debugConsole" Label="' + labels.debugConsole + '" Enabled="true"/>' +
		'<MenuItem Label="---" />' +
		'<MenuItem Id="about" Label="' + labels.about + '" Enabled="true"/>' +
		(showLogout ? '<MenuItem Label="---" /><MenuItem Id="logout" Label="' + labels.logout + '" Enabled="true"/>' : '') +
		'</Menu>'
	)
}

export function PanelFlyoutSetup() {
	const { t } = useTranslation()
	const { notify } = useToast()
	const { reload, startExcelImport, setAboutOpen } = useTrademarks()
	const { user, logout } = useAuth()

	useEffect(() => {
		if (!isCEP()) return
		const cs = getCSInterface()
		if (!cs) return

		const labels = {
			refreshServer: t('flyout.refreshServer'),
			importExcel: t('flyout.importExcel'),
			openLogs: t('flyout.openLogs'),
			debugConsole: t('flyout.debugConsole'),
			about: t('flyout.about'),
			logout: t('login.logout'),
		}
		/* Only show Sign Out for a real authenticated user (not guest mode). */
		const showLogout = !!user?.token

		const onFlyoutClick = (event?: unknown) => {
			const menuId = (event as { data?: { menuId?: string } } | undefined)?.data?.menuId
			switch (menuId) {
				case 'refreshServer':
					reload()
					notify('Refreshing server data…', ToastType.Info)
					break
				case 'importExcel':
					if (!startExcelImport()) notify(t('excel.cepOnly'), ToastType.Info)
					break
				case 'openLogs':
					void controller.openLogsFolder()
					break
				case 'debugConsole':
					try {
						window.open(DEBUG_CONSOLE_URL, '_blank')
					} catch {
						/* ignore */
					}
					break
				case 'about':
					setAboutOpen(true)
					break
				case 'logout':
					logout()
					notify(t('login.logout'), ToastType.Info)
					break
				default:
					break
			}
		}

		try {
			cs.setPanelFlyoutMenu(buildFlyoutXml(labels, showLogout))
		} catch {
			/* ignore */
		}
		cs.addEventListener(EVENT_FLYOUT_MENU_CLICKED, onFlyoutClick)
		return () => cs.removeEventListener?.(EVENT_FLYOUT_MENU_CLICKED, onFlyoutClick)
	}, [reload, notify, t, startExcelImport, setAboutOpen, user, logout])

	return null
}
