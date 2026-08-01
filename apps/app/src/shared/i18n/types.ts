export const locales = ['en', 'ru'] as const

export type Locale = (typeof locales)[number]

export function isLocale(value: unknown): value is Locale {
  return typeof value === 'string' && (locales as readonly string[]).includes(value)
}

export const localeLabels: Record<Locale, string> = {
  en: 'English',
  ru: 'Русский',
}

/**
 * A count-dependent message.
 *
 * `other` is the only form every language needs; English uses `one`/`other`
 * while Russian also needs `few` (2–4) and `many` (5+). The forms come from
 * `Intl.PluralRules`, so the rules live in the platform rather than in a table
 * this project would have to maintain.
 */
export type PluralMessage = {
  one?: string
  few?: string
  many?: string
  other: string
}

export type MessageParams = Record<string, string | number>
