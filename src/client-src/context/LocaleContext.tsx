import { createContext, useCallback, useContext, useMemo, useState, type ReactNode } from 'react'
import {
	createTranslator,
	DEFAULT_LOCALE,
	isLocaleId,
	LOCALE_STORAGE_KEY,
	type LocaleId,
	type TranslationKey,
	type TranslationParams,
} from '../i18n'

interface LocaleContextValue {
	locale: LocaleId
	setLocale: (locale: LocaleId) => void
	t: (key: TranslationKey, params?: TranslationParams) => string
}

const LocaleContext = createContext<LocaleContextValue | null>(null)

function readStoredLocale(): LocaleId | null {
	try {
		const stored = localStorage.getItem(LOCALE_STORAGE_KEY)
		return isLocaleId(stored) ? stored : null
	} catch {
		return null
	}
}

function detectInitialLocale(): LocaleId {
	const stored = readStoredLocale()
	if (stored) return stored
	return DEFAULT_LOCALE
}

export function LocaleProvider({ children }: { children: ReactNode }) {
	const [locale, setLocaleState] = useState<LocaleId>(detectInitialLocale)

	const setLocale = useCallback((next: LocaleId) => {
		setLocaleState(next)
		try {
			localStorage.setItem(LOCALE_STORAGE_KEY, next)
		} catch {
			/* ignore */
		}
	}, [])

	const t = useMemo(() => createTranslator(locale), [locale])

	const value = useMemo(() => ({ locale, setLocale, t }), [locale, setLocale, t])

	return <LocaleContext.Provider value={value}>{children}</LocaleContext.Provider>
}

export function useLocale() {
	const ctx = useContext(LocaleContext)
	if (!ctx) throw new Error('useLocale must be used within LocaleProvider')
	return ctx
}

/** Shorthand for translated strings (tooltips, labels, etc.). */
export function useTranslation() {
	const { t, locale, setLocale } = useLocale()
	return { t, locale, setLocale }
}
