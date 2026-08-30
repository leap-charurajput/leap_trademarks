/**
 * ThemeProvider — syncs with Illustrator via appSkinInfo + ThemeColorChanged (legacy variable.js).
 * Browser dev: localStorage override via setTheme (DevSandbox).
 */
import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react'
import { applyPanelIconTheme } from '../assets/registry'
import { Theme } from '../enums'
import { CepEvent, DEFAULT_THEME, StorageKey } from '../constants'
import { getCSInterface, isCEP } from '@lib/helper'
import { detectThemeFromHost } from '../utils/adobeTheme'

interface ThemeContextValue {
	theme: Theme
	setTheme: (theme: Theme) => void
}

const ThemeContext = createContext<ThemeContextValue | null>(null)

function readStoredTheme(): Theme {
	try {
		const stored = window.localStorage.getItem(StorageKey.Theme)
		if (stored && Object.values(Theme).includes(stored as Theme)) return stored as Theme
	} catch {
		/* localStorage may be unavailable in some CEP contexts */
	}
	return DEFAULT_THEME
}

function applyThemeClass(theme: Theme): void {
	const { classList } = document.body
	Object.values(Theme).forEach((t) => classList.remove(t))
	classList.add(theme)
	applyPanelIconTheme()
}

export function ThemeProvider({ children }: { children: ReactNode }) {
	const [theme, setThemeState] = useState<Theme>(() =>
		isCEP() ? (detectThemeFromHost() ?? readStoredTheme()) : readStoredTheme(),
	)

	useEffect(() => {
		applyThemeClass(theme)
	}, [theme])

	useEffect(() => {
		if (!isCEP()) return

		const syncFromHost = () => {
			const detected = detectThemeFromHost()
			if (detected) setThemeState(detected)
		}

		syncFromHost()

		const cs = getCSInterface()
		if (!cs?.addEventListener) return

		const onHostThemeChanged = () => {
			syncFromHost()
		}

		cs.addEventListener(CepEvent.ThemeColorChanged, onHostThemeChanged)

		return () => {
			cs.removeEventListener?.(CepEvent.ThemeColorChanged, onHostThemeChanged)
		}
	}, [])

	const setTheme = useCallback((next: Theme) => {
		setThemeState(next)
		try {
			window.localStorage.setItem(StorageKey.Theme, next)
		} catch {
			/* ignore persistence failure */
		}
	}, [])

	const value = useMemo(() => ({ theme, setTheme }), [theme, setTheme])

	return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>
}

export function useTheme(): ThemeContextValue {
	const ctx = useContext(ThemeContext)
	if (!ctx) throw new Error('useTheme must be used within a ThemeProvider')
	return ctx
}
