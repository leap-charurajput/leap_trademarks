/*
 * Entry point. Waits for CSInterface when inside CEP, initialises the controller, then mounts the
 * React tree wrapped in the global providers (theme, locale, toast, confirm dialog).
 */
import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import App from './App'
import controller from './controller'
import { ThemeProvider } from './context/ThemeContext'
import { LocaleProvider } from './context/LocaleContext'
import { ConfirmDialogProvider } from './context/ConfirmDialogContext'
import { ToastProvider } from './context/ToastContext'
import { isCEP, waitForCSInterface } from '@lib/helper'
import './styles/global.css'
import './styles/icons.css'

async function bootstrap() {
	if (isCEP()) {
		await waitForCSInterface()
		await controller.init()
	}

	const container = document.getElementById('root')
	if (!container) throw new Error('Root element #root not found')

	createRoot(container).render(
		<StrictMode>
			<ThemeProvider>
				<LocaleProvider>
					<ToastProvider>
						<ConfirmDialogProvider>
							<App />
						</ConfirmDialogProvider>
					</ToastProvider>
				</LocaleProvider>
			</ThemeProvider>
		</StrictMode>,
	)
}

void bootstrap()
