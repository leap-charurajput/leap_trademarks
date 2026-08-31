/*
 * SettingsTab — the ⚙ tab after Manage. Two panel settings in one place:
 *   1. Logobase data folder — shows the active server path, Locate… picks a new one (CEP folder
 *      picker; persists to the shared logobaseDataPathSettings.json and reloads the catalog).
 *   2. Panel version — the release-channel switcher (Production / Development / Beta / Localhost).
 *      The CHANNEL ID is persisted to Documents/LEAP Settings/LEAP_Trademarks/Trademarks_Config.json
 *      (re-resolved by the shell against the hosted registry on every panel start), and the panel
 *      then SWITCHES IN PLACE: the choice is probed and, when reachable, the page navigates to the
 *      new version immediately — no Illustrator restart (same behaviour as LEAP Utilities). An
 *      unreachable target stays saved but is not navigated to; the shell picks it up next open.
 */
import { useState } from 'react'
import { Button, Dropdown } from '../../components'
import { Size, ToastType } from '../../enums'
import { useTranslation } from '../../context/LocaleContext'
import { useToast } from '../../context/ToastContext'
import { useTrademarks } from '../../context/TrademarksContext'
import { APP_ENVIRONMENTS, APP_VERSION, detectRunningEnvironment, environmentForOrigin, type AppEnvironmentId } from '../../constants'
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

export function SettingsTab() {
	const { t } = useTranslation()
	const { notify } = useToast()
	const { currentServer, addServerFolder } = useTrademarks()
	const running = detectRunningEnvironment()

	/* The dropdown reflects the SAVED choice, which is the running environment until the user
	   switches. Pre-channel config files carry only an Origin, so fall back to matching it;
	   unknown/missing configs fall back to the running channel, then Production. */
	const [selected, setSelected] = useState<AppEnvironmentId>(() => {
		const saved = controller.getSavedEnvironment()
		const savedEnv = APP_ENVIRONMENTS.find((env) => env.id === saved?.environment) ?? environmentForOrigin(saved?.origin)
		return (savedEnv ?? running ?? APP_ENVIRONMENTS[0]).id
	})

	const choose = () => {
		if (!addServerFolder()) notify(t('feature.pending', { feature: 'Locate folder (Illustrator only)' }), ToastType.Info)
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
		<div className="tm-settingstab tm-datasettings">
			<p className="tm-datasettings__label">{t('settings.dataFolder')}</p>
			<p className="tm-datasettings__path">{currentServer?.path ?? t('settings.dataFolderUnset')}</p>
			<Button size={Size.Small} onClick={choose}>
				{t('welcome.locate')}
			</Button>

			<p className="tm-datasettings__label tm-datasettings__label--divided">{t('settings.version')}</p>
			<Dropdown value={selected} options={envOptions} onChange={(id) => void onEnvChange(id)} fullWidth showSelectedTick />
			{running && <p className="tm-datasettings__hint">{t('settings.running', { name: t(running.labelKey) })}</p>}
			<p className="tm-datasettings__hint">{t('settings.help')}</p>

			<p className="tm-datasettings__label tm-datasettings__label--divided">{t('settings.panelVersion')}</p>
			<p className="tm-datasettings__hint">v{APP_VERSION}</p>
		</div>
	)
}
