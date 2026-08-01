import { en, enPlurals, type Dictionary, type PluralDictionary } from '@/shared/i18n/en'
import { ru, ruPlurals } from '@/shared/i18n/ru'
import { interpolate, selectPluralForm } from '@/shared/i18n/translate'
import { isLocale, locales, type Locale, type MessageParams } from '@/shared/i18n/types'

export type { Dictionary, MessageKey, PluralDictionary, PluralKey } from '@/shared/i18n/en'
export type { Locale, MessageParams, PluralMessage } from '@/shared/i18n/types'
export { isLocale, localeLabels, locales } from '@/shared/i18n/types'
export { interpolate, selectPluralForm } from '@/shared/i18n/translate'

export const defaultLocale: Locale = 'en'

const dictionaries: Record<Locale, Dictionary> = { en, ru }
const pluralDictionaries: Record<Locale, PluralDictionary> = {
  en: enPlurals,
  ru: ruPlurals,
}

export type Translator = {
  locale: Locale
  /** Formats a date/time with the active locale. */
  formatDateTime(value: string, options?: Intl.DateTimeFormatOptions): string
  plural(key: keyof PluralDictionary, count: number, params?: MessageParams): string
  t(key: keyof Dictionary, params?: MessageParams): string
}

export function createTranslator(locale: Locale): Translator {
  const dictionary = dictionaries[locale]
  const plurals = pluralDictionaries[locale]

  return {
    formatDateTime(value, options) {
      const parsed = new Date(value)

      return Number.isNaN(parsed.getTime())
        ? value
        : parsed.toLocaleString(locale, options)
    },
    locale,
    plural(key, count, params) {
      return interpolate(selectPluralForm(plurals[key], count, locale), {
        count,
        ...params,
      })
    },
    t(key, params) {
      return interpolate(dictionary[key], params)
    },
  }
}

/**
 * Picks a starting locale from the browser, so a Russian-speaking user is not
 * greeted in English before they find the setting.
 */
export function detectLocale(
  languages: readonly string[] = typeof navigator === 'undefined'
    ? []
    : navigator.languages ?? [navigator.language],
): Locale {
  for (const language of languages) {
    const base = language.toLowerCase().split('-')[0]

    if (isLocale(base)) {
      return base
    }
  }

  return defaultLocale
}

export { locales as supportedLocales }
