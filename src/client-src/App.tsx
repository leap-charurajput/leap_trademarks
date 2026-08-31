/*
 * App shell — wraps the panel in the auth gate + Trademarks UI store and registers the CEP flyout menu,
 * then renders the single compact MainPanel (≤250px). When REQUIRE_LOGIN is on and the user isn't
 * authenticated, the LoginView gate replaces the panel; otherwise (or in guest mode) the panel renders
 * as usual. There is no in-panel router: every Trademarks view lives inside MainPanel.
 */
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

export default function App() {
	return (
		<AuthProvider>
			<AuthGate />
		</AuthProvider>
	)
}
