/*
 * i18n facade — catalog lookup + interpolation. Components call useTranslation().t(key, params).
 */
import { en, type TranslationKey, type TranslationParams } from './locales/en'
import { zh } from './locales/zh'

export type LocaleId = 'en' | 'zh'

export const DEFAULT_LOCALE: LocaleId = 'en'
export const LOCALE_STORAGE_KEY = 'leap-trademarks:locale'

const catalogs: Record<LocaleId, Record<TranslationKey, string>> = { en, zh }

/* Map a host locale tag to a supported catalog. */
export function resolveLocaleFromHost(appUILocale?: string | null): LocaleId {
	if (!appUILocale) return DEFAULT_LOCALE
	const tag = appUILocale.toLowerCase().replace('_', '-')
	if (tag.startsWith('zh')) return 'zh'
	return DEFAULT_LOCALE
}

export function isLocaleId(value: string | null | undefined): value is LocaleId {
	return value === 'en' || value === 'zh'
}

export function createTranslator(locale: LocaleId) {
	const catalog = catalogs[locale] ?? catalogs[DEFAULT_LOCALE]
	const fallback = catalogs[DEFAULT_LOCALE]

	return function t(key: TranslationKey, params?: TranslationParams): string {
		const template = catalog[key] ?? fallback[key] ?? key
		if (!params) return template
		return template.replace(/\{(\w+)\}/g, (_, name: string) => String(params[name] ?? `{${name}}`))
	}
}

export type { TranslationKey, TranslationParams }
