/*
 * App shell — wraps the panel in the auth gate + Trademarks UI store and registers the CEP flyout menu,
 * then renders the single compact MainPanel (≤250px). When REQUIRE_LOGIN is on and the user isn't
 * authenticated, the LoginView gate replaces the panel; otherwise (or in guest mode) the panel renders
 * as usual. There is no in-panel router: every Trademarks view lives inside MainPanel.
 */
import { isCEP } from '@lib/helper'
import { AuthProvider, useAuth } from './context/AuthContext'
import { TrademarksProvider } from './context/TrademarksContext'
import { LogosheetBuilderProvider } from './context/LogosheetBuilderContext'
import { PanelFlyoutSetup } from './components/PanelFlyoutSetup'
import { VersionFooter } from './components'
import { MainPanel } from './pages/MainPanel'
import { AboutModal } from './pages/MainPanel/AboutModal'
import { LoginView } from './pages/LoginView'
import './App.css'

/* Renders a brief auth-check spinner, the login gate, or the full panel. */
function AuthGate() {
	const { requireLogin, authenticated, loading } = useAuth()

	if (requireLogin && loading && !authenticated) {
		return (
			<div className="app">
				<div className="tm-overlay">
					<div className="tm-overlay__spinner" aria-hidden />
				</div>
			</div>
		)
	}

	if (requireLogin && !authenticated) {
		return (
			<div className="app">
				<LoginView />
				<VersionFooter />
			</div>
		)
	}

	return (
		<TrademarksProvider>
			<LogosheetBuilderProvider>
				<PanelFlyoutSetup />
				<div className="app">
					<MainPanel />
					<VersionFooter />
					{/* About lives at app level so the flyout opens it in EVERY panel state (inside
					    MainPanel's ready-only return it was unreachable from the overlay states). */}
					<AboutModal />
				</div>
			</LogosheetBuilderProvider>
		</TrademarksProvider>
	)
}

/*
 * The hosted web app opened in a PLAIN BROWSER (someone visiting the deployed url) can never work —
 * all data comes from the local filesystem via CEP — so show a friendly explainer instead of the
 * misleading "No data yet" screen. Only for production builds: the vite dev server (npm run dev)
 * keeps the full browser-dev experience (DevStateBar, sample data), and inside Illustrator
 * isCEP() is true regardless of origin.
 */
function BrowserNotice() {
	return (
		<div className="app">
			<div className="app-browser-notice">
				<span className="exp-icon exp-icon--product" aria-hidden />
				<p className="app-browser-notice__title">LEAP Trademarks is an Adobe Illustrator plugin.</p>
				<p className="app-browser-notice__text">
					This page is the panel's web app — it runs inside Illustrator, not in a browser. Install
					the LEAP Trademarks extension, then open it from Window → Extensions.
				</p>
			</div>
			<VersionFooter />
		</div>
	)
}

export default function App() {
	if (!isCEP() && !import.meta.env.DEV) return <BrowserNotice />
	return (
		<AuthProvider>
			<AuthGate />
		</AuthProvider>
	)
}
