/*
 * DataSettingsModal — the flyout "LEAP Data Settings". Shows the current Logobase data folder and lets
 * the user pick a new one (native folder picker, CEP only). Choosing a folder persists it as the active
 * Logobase path (data settings JSON) and reloads the catalog. In the browser there is no folder picker,
 * so Choose raises an info toast.
 *
 * Also hosts the release-channel switcher: pick which deployed web-app (Production / Development /
 * Beta / Localhost) the CEP shell loads. The CHANNEL ID is persisted to Documents/LEAP Settings/
 * LEAP_Trademarks/Trademarks_Config.json and re-resolved by the shell against the hosted registry on
 * every panel start (so channel urls can move without touching users or the ZXP). It only takes
 * effect after Illustrator restarts; the modal toasts that reminder on every change.
 */
import { useState } from 'react'
import { Button, Dropdown, Modal } from '../../components'
import { ButtonVariant, Size, ToastType } from '../../enums'
import { useTranslation } from '../../context/LocaleContext'
import { useToast } from '../../context/ToastContext'
import { useTrademarks } from '../../context/TrademarksContext'
import { APP_ENVIRONMENTS, detectRunningEnvironment, environmentForOrigin, type AppEnvironmentId } from '../../constants'
import controller from '../../controller'

/* Toast a little longer than the default — "restart Illustrator" is easy to miss. */
const RESTART_TOAST_MS = 6000

export function DataSettingsModal() {
	const { t } = useTranslation()
	const { notify } = useToast()
	const { dataSettingsOpen, setDataSettingsOpen, currentServer, addServerFolder } = useTrademarks()
	const running = detectRunningEnvironment()

	/* The dropdown reflects the SAVED choice (what loads on next start), which is the running
	   environment until the user switches. Pre-channel config files carry only an Origin, so fall
	   back to matching it; unknown/missing configs fall back to the running channel, then Production. */
	const [selected, setSelected] = useState<AppEnvironmentId>(() => {
		const saved = controller.getSavedEnvironment()
		const savedEnv = APP_ENVIRONMENTS.find((env) => env.id === saved?.environment) ?? environmentForOrigin(saved?.origin)
		return (savedEnv ?? running ?? APP_ENVIRONMENTS[0]).id
	})

	if (!dataSettingsOpen) return null

	const choose = () => {
		if (addServerFolder()) setDataSettingsOpen(false)
		else notify(t('feature.pending', { feature: 'Locate folder (Illustrator only)' }), ToastType.Info)
	}

	const envOptions = APP_ENVIRONMENTS.map((env) => ({ value: env.id, label: t(env.labelKey) }))

	const onEnvChange = (id: AppEnvironmentId) => {
		const env = APP_ENVIRONMENTS.find((candidate) => candidate.id === id)
		if (!env || id === selected) return
		if (!controller.setSavedEnvironment(env.id, env.origin)) {
			notify(t('settings.saveFailed'), ToastType.Error)
			return
		}
		setSelected(id)
		if (running?.id === id) {
			notify(t('settings.noRestartNeeded', { name: t(env.labelKey) }), ToastType.Success)
		} else {
			notify(t('settings.restartRequired', { name: t(env.labelKey) }), ToastType.Info, RESTART_TOAST_MS)
		}
	}

	return (
		<Modal
			open={dataSettingsOpen}
			title={t('flyout.dataSettings')}
			width={340}
			onClose={() => setDataSettingsOpen(false)}
			footer={
				<div className="tm-modal-footer">
					<Button variant={ButtonVariant.Secondary} size={Size.Small} onClick={() => setDataSettingsOpen(false)}>
						{t('action.close')}
					</Button>
				</div>
			}
		>
			<div className="tm-datasettings">
				<p className="tm-datasettings__label">Logobase data folder</p>
				<p className="tm-datasettings__path">{currentServer?.path ?? 'Not set'}</p>
				<Button size={Size.Small} onClick={choose}>
					{t('welcome.locate')}
				</Button>

				<p className="tm-datasettings__label tm-datasettings__label--divided">{t('settings.version')}</p>
				<Dropdown value={selected} options={envOptions} onChange={onEnvChange} fullWidth showSelectedTick />
				{running && <p className="tm-datasettings__hint">{t('settings.running', { name: t(running.labelKey) })}</p>}
				<p className="tm-datasettings__hint">{t('settings.help')}</p>
			</div>
		</Modal>
	)
}
