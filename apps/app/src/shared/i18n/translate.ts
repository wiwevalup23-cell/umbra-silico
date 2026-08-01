import type { Locale, MessageParams, PluralMessage } from '@/shared/i18n/types'

/** Replaces `{name}` placeholders, leaving unknown ones visible rather than blank. */
export function interpolate(template: string, params?: MessageParams): string {
  if (!params) {
    return template
  }

  return template.replace(/\{(\w+)\}/g, (match, name: string) =>
    name in params ? String(params[name]) : match,
  )
}

const pluralRulesByLocale = new Map<Locale, Intl.PluralRules>()

function pluralRules(locale: Locale): Intl.PluralRules {
  const cached = pluralRulesByLocale.get(locale)

  if (cached) {
    return cached
  }

  const rules = new Intl.PluralRules(locale)
  pluralRulesByLocale.set(locale, rules)
  return rules
}

/**
 * Chooses a plural form for `count`.
 *
 * Falls back through the CLDR categories to `other`, so a dictionary that only
 * defines `one`/`other` still reads correctly in a language that asks for
 * `few` or `many`.
 */
export function selectPluralForm(
  message: PluralMessage,
  count: number,
  locale: Locale,
): string {
  const category = pluralRules(locale).select(count)

  if (category === 'one' && message.one !== undefined) return message.one
  if (category === 'few' && message.few !== undefined) return message.few
  if (category === 'many' && message.many !== undefined) return message.many

  return message.other
}
