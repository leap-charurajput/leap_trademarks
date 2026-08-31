/*
 * MainPanel — the LEAP Trademarks panel, rebuilt for a ≤250px single compact column.
 *
 * Layout mirrors the legacy AngularJS panel: a League selector, a three-way tab bar
 * (Teams / League / League Logos), the active view, and a footer "change server" bar. Top-level
 * states (loading / auth / unrecognised / welcome / no-server) render as full-panel overlays, exactly
 * like the legacy `ng-show` overlays. Excel import, Manage Servers and About are modals.
 *
 * Every control is a kit component (AGENTS §10); all state comes from TrademarksContext. The
 * functionality phase swaps the context's sample seed for host data — this layout does not change.
 */
import { Button, Dropdown, Tooltip, type DropdownOption } from '../../components'
import { Size, ToastType } from '../../enums'
import { useTranslation } from '../../context/LocaleContext'
import { useToast } from '../../context/ToastContext'
import { useTrademarks } from '../../context/TrademarksContext'
import type { TabId } from '../../data/types'
import { TeamsView } from './TeamsView'
import { LeagueView } from './LeagueView'
import { LeagueLogosView } from './LeagueLogosView'
import { ManageLogosView } from './ManageLogosView'
import { SettingsTab } from './SettingsTab'
import { LogosheetBuilder } from './LogosheetBuilder'
import { LogoSheetView } from './LogoSheetView'
import { ServerBar } from './ServerBar'
import { ExcelImportModal } from './ExcelImportModal'
import { ManageServersModal } from './ManageServersModal'
import { PanelOverlays } from './PanelOverlays'
import { DevStateBar } from './DevStateBar'
import './style.css'

/* The settings tab renders as a ⚙ icon instead of a text label (icon: true). */
const TABS: { id: TabId; key: 'tab.teams' | 'tab.league' | 'tab.create' | 'tab.manage' | 'tab.settings'; icon?: boolean }[] = [
	{ id: 'teams', key: 'tab.teams' },
	{ id: 'league', key: 'tab.league' },
	{ id: 'manage', key: 'tab.manage' },
	{ id: 'settings', key: 'tab.settings', icon: true },
	/* Logosheets (Export LEAP Assets) tab hidden for now — kept in code, just not listed.
	   Restore by re-adding: { id: 'create', key: 'tab.create' }, */
	// { id: 'create', key: 'tab.create' },
]

export function MainPanel() {
	const { t } = useTranslation()
	const { leagues, selectedLeague, setLeague, activeTab, setActiveTab, panelState, docType, isBrowserDev, dataLoading, dataError, serverMissing, noData, addServerFolder, reload, startExcelImport } =
		useTrademarks()
	const { notify } = useToast()

	const leagueOptions: DropdownOption<string>[] = leagues.map((l) => ({ value: l.Code, label: l.Code }))

	/* No Logobase server folder configured yet — prompt the user to locate it (writes the shared logobaseDataPathSettings.json). */
	if (serverMissing) {
		return (
			<div className="tm-panel">
				{isBrowserDev && <DevStateBar />}
				<div className="tm-overlay tm-overlay--message">
					<span className="exp-icon exp-icon--caution" aria-hidden />
					<p className="tm-overlay__title">Server not mounted</p>
					<p className="tm-overlay__text">{t('server.warning')}</p>
					<button type="button" className="tm-serverbar__btn" onClick={() => addServerFolder()}>
						{t('welcome.locate')}
					</button>
				</div>
			</div>
		)
	}

	/* Catalog load states (legacy initLoader overlay) take over the whole panel. */
	if (dataLoading) {
		return (
			<div className="tm-panel">
				{isBrowserDev && <DevStateBar />}
				<div className="tm-overlay">
					<div className="tm-overlay__spinner" aria-hidden />
					<p className="tm-overlay__text">Loading Logobase data…</p>
				</div>
			</div>
		)
	}
	/* Server is mounted but empty (no SLS_MASTER.json yet) — invite the user to import data. */
	if (noData) {
		return (
			<div className="tm-panel">
				{isBrowserDev && <DevStateBar />}
				<div className="tm-overlay tm-overlay--message">
					<span className="exp-icon exp-icon--document" aria-hidden />
					<p className="tm-overlay__title">{t('nodata.title')}</p>
					<p className="tm-overlay__text">{t('nodata.body')}</p>
					<Button
						size={Size.Small}
						onClick={() => {
							if (!startExcelImport()) notify(t('excel.cepOnly'), ToastType.Info)
						}}
					>
						{t('flyout.importExcel')}
					</Button>
				</div>
				<ExcelImportModal />
			</div>
		)
	}
	if (dataError) {
		return (
			<div className="tm-panel">
				{isBrowserDev && <DevStateBar />}
				<div className="tm-overlay tm-overlay--message">
					<span className="exp-icon exp-icon--caution" aria-hidden />
					<p className="tm-overlay__text">Couldn't load data from the server.</p>
					<p className="tm-overlay__text tm-overlay__detail">{dataError}</p>
					<button type="button" className="tm-serverbar__btn" onClick={reload}>Retry</button>
				</div>
			</div>
		)
	}

	/* Non-ready states take over the whole panel (legacy overlays). */
	if (panelState !== 'ready') {
		return (
			<div className="tm-panel">
				{isBrowserDev && <DevStateBar />}
				<PanelOverlays />
			</div>
		)
	}

	return (
		<div className="tm-panel">
			{isBrowserDev && <DevStateBar />}

			<div className="tm-panel__body">
				{docType === 'none' && (
					<div className="tm-overlay tm-overlay--message">
						<span className="exp-icon exp-icon--document" aria-hidden />
						<p className="tm-overlay__text">Open a document to begin.</p>
					</div>
				)}

				{docType === 'logosheet' && <LogoSheetView />}

				{docType === 'team' && (
					<>
						<div className="tm-league-row">
							<span className="tm-league-row__label">{t('label.league')}</span>
							<Tooltip content={t('label.league')}>
								<Dropdown<string>
									value={selectedLeague.Code}
									options={leagueOptions}
									onChange={setLeague}
									size={Size.Small}
									fullWidth
								/>
							</Tooltip>
						</div>

						<div className="tm-tabs" role="tablist">
							{TABS.map((tab) => (
								<Tooltip key={tab.id} content={t(tab.key)}>
									<button
										type="button"
										role="tab"
										aria-selected={activeTab === tab.id}
										className={`tm-tab ${tab.icon ? 'tm-tab--icon' : ''} ${activeTab === tab.id ? 'tm-tab--active' : ''}`}
										onClick={() => setActiveTab(tab.id)}
										aria-label={t(tab.key)}
									>
										{tab.icon ? <span className="exp-icon exp-icon--sm exp-icon--settings" aria-hidden /> : t(tab.key)}
									</button>
								</Tooltip>
							))}
						</div>

						<div className="tm-view">
							{activeTab === 'teams' && <TeamsView />}
							{activeTab === 'league' && <LeagueView />}
							{activeTab === 'leagueLogos' && <LeagueLogosView />}
							{activeTab === 'manage' && <ManageLogosView />}
							{activeTab === 'create' && <LogosheetBuilder />}
						{activeTab === 'settings' && <SettingsTab />}
						</div>
					</>
				)}
			</div>

			<ServerBar />

			<ExcelImportModal />
			<ManageServersModal />
		</div>
	)
}
