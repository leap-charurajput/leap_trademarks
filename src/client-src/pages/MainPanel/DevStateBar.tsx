/*
 * DevStateBar — a browser-only helper (not shown inside Illustrator) to preview every panel state
 * and theme while building the UI. It is gated by TrademarksContext.isBrowserDev, so it never ships
 * in the CEP panel. Lets a reviewer flip loading / welcome / no-server / ready and switch theme.
 */
import { useTheme } from '../../context/ThemeContext'
import { useTrademarks, type DocType, type PanelState } from '../../context/TrademarksContext'
import { Theme } from '../../enums'

const STATES: PanelState[] = ['ready', 'loading', 'auth', 'unrecognized', 'welcome', 'noServer']
const DOC_TYPES: DocType[] = ['team', 'logosheet', 'none']
const THEMES: { value: Theme; label: string }[] = [
	{ value: Theme.Dark, label: 'Dark' },
	{ value: Theme.MediumDark, label: 'M-Dark' },
	{ value: Theme.MediumLight, label: 'M-Light' },
	{ value: Theme.Light, label: 'Light' },
]

export function DevStateBar() {
	const { panelState, setPanelState, docType, setDocType } = useTrademarks()
	const { theme, setTheme } = useTheme()
	return (
		<div className="tm-devbar">
			<select className="tm-devbar__select" value={panelState} onChange={(e) => setPanelState(e.target.value as PanelState)}>
				{STATES.map((s) => (
					<option key={s} value={s}>
						{s}
					</option>
				))}
			</select>
			<select className="tm-devbar__select" value={docType} onChange={(e) => setDocType(e.target.value as DocType)}>
				{DOC_TYPES.map((d) => (
					<option key={d} value={d}>
						{d}
					</option>
				))}
			</select>
			<select className="tm-devbar__select" value={theme} onChange={(e) => setTheme(e.target.value as Theme)}>
				{THEMES.map((th) => (
					<option key={th.value} value={th.value}>
						{th.label}
					</option>
				))}
			</select>
		</div>
	)
}
