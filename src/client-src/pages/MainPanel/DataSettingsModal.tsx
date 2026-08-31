/*
 * DataSettingsModal — the flyout "LEAP Data Settings". Shows the current Logobase data folder and lets
 * the user pick a new one (native folder picker, CEP only). Choosing a folder persists it as the active
 * Logobase path (data settings JSON) and reloads the catalog. In the browser there is no folder picker,
 * so Choose raises an info toast.
 *
 * Also hosts the release-channel switcher: pick which deployed web-app (Production / Development /
 * Beta / Localhost) the panel runs. The CHANNEL ID is persisted to Documents/LEAP Settings/
 * LEAP_Trademarks/Trademarks_Config.json (re-resolved by the shell against the hosted registry on
 * every panel start), and the panel then SWITCHES IN PLACE: the choice is probed and, when
 * reachable, the page navigates to the new version immediately — no Illustrator restart. An
 * unreachable target (typically Localhost without a dev server) stays saved but is not navigated
 * to: the current version keeps running and the shell picks the choice up on the next panel open.
 */
import { useState } from 'react'
import { Button, Dropdown, Modal } from '../../components'
import { ButtonVariant, Size, ToastType } from '../../enums'
import { useTranslation } from '../../context/LocaleContext'
import { useToast } from '../../context/ToastContext'
import { useTrademarks } from '../../context/TrademarksContext'
import { APP_ENVIRONMENTS, detectRunningEnvironment, environmentForOrigin, type AppEnvironmentId } from '../../constants'
import controller from '../../controller'

/* How long an unreachable-target toast stays — it carries the "what happens next" explanation. */
const UNREACHABLE_TOAST_MS = 8000
/* Delay before navigating so the "Switching to …" toast is actually seen. */
const SWITCH_DELAY_MS = 700
/* Probe budget: localhost fails near-instantly when the dev server is down; hosted urls get a
   bounded wait. Mirrors the shell's PROBE_TIMEOUT_MS. */
const PROBE_TIMEOUT_MS = 6000

/*
 * Prove the target origin is serving before navigating there — navigating blind to a dead url
 * would drop the user on the raw browser error page with no way back. `no-cors` keeps the request
 * usable in plain-browser dev too (an opaque response still means "something answered").
 */
async function probeOrigin(origin: string): Promise<boolean> {
	try {
		const abort = new AbortController()
		const timer = window.setTimeout(() => abort.abort(), PROBE_TIMEOUT_MS)
		await fetch(`${origin}${origin.includes('?') ? '&' : '?'}panelProbe=${Date.now()}`, {
			mode: 'no-cors',
			cache: 'no-store',
			signal: abort.signal,
		})
		window.clearTimeout(timer)
		return true
	} catch {
		return false
	}
}

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

	const onEnvChange = async (id: AppEnvironmentId) => {
		const env = APP_ENVIRONMENTS.find((candidate) => candidate.id === id)
		if (!env || id === selected) return

		/* The choice ALWAYS persists — even when the target is unreachable right now — so the next
		   panel open honors it. Only a real CEP write failure blocks; in plain-browser dev there is
		   no config file, so continue and let the in-place switch itself be testable. */
		const saved = controller.setSavedEnvironment(env.id, env.origin)
		if (!saved && controller.hasSession()) {
			notify(t('settings.saveFailed'), ToastType.Error)
			return
		}
		setSelected(id)

		if (running?.id === id) {
			notify(t('settings.noRestartNeeded', { name: t(env.labelKey) }), ToastType.Success)
			return
		}

		notify(t('settings.switching', { name: t(env.labelKey) }), ToastType.Info)
		if (await probeOrigin(env.origin)) {
			/* Give the toast a beat to be read, then switch in place — no restart needed. */
			window.setTimeout(() => {
				window.location.href = env.origin
			}, SWITCH_DELAY_MS)
		} else if (env.id === 'localhost') {
			notify(t('settings.localhostNotRunning'), ToastType.Warning, UNREACHABLE_TOAST_MS)
		} else {
			notify(t('settings.switchUnreachable', { name: t(env.labelKey) }), ToastType.Warning, UNREACHABLE_TOAST_MS)
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
				<Dropdown value={selected} options={envOptions} onChange={(id) => void onEnvChange(id)} fullWidth showSelectedTick />
				{running && <p className="tm-datasettings__hint">{t('settings.running', { name: t(running.labelKey) })}</p>}
				<p className="tm-datasettings__hint">{t('settings.help')}</p>
			</div>
		</Modal>
	)
}
