import { describe, expect, it } from 'vitest'
import {
  createTranslator,
  defaultLocale,
  detectLocale,
  interpolate,
  isLocale,
  localeLabels,
  locales,
} from '@/shared/i18n'
import { en, enPlurals } from '@/shared/i18n/en'
import { ru, ruPlurals } from '@/shared/i18n/ru'

describe('dictionaries', () => {
  it('translates every key in every locale', () => {
    // `ru` is typed as Dictionary, so a missing key is already a compile
    // error; this catches the other half — a key present but left empty.
    for (const locale of locales) {
      const { t } = createTranslator(locale)

      for (const key of Object.keys(en) as Array<keyof typeof en>) {
        expect({ locale, key, value: t(key).trim() }).toEqual({
          locale,
          key,
          value: expect.stringMatching(/.+/),
        })
      }
    }
  })

  it('has no key that is still the English text in Russian', () => {
    // Brand names and shared symbols are legitimately identical; anything
    // longer that matches exactly is an untranslated leftover.
    const suspicious = (Object.keys(en) as Array<keyof typeof en>).filter(
      (key) => en[key] === ru[key] && en[key].length > 3,
    )

    expect(suspicious).toEqual([])
  })

  it('keeps the same placeholders on both sides of a translation', () => {
    const placeholders = (value: string) =>
      [...value.matchAll(/\{(\w+)\}/g)].map((match) => match[1]).sort()

    for (const key of Object.keys(en) as Array<keyof typeof en>) {
      expect({ key, params: placeholders(ru[key]) }).toEqual({
        key,
        params: placeholders(en[key]),
      })
    }
  })

  it('labels every supported locale in its own language', () => {
    for (const locale of locales) {
      expect(localeLabels[locale].trim()).not.toBe('')
    }
  })
})

describe('interpolation', () => {
  it('substitutes named parameters', () => {
    expect(interpolate('Move “{title}” to {folder}', { title: 'Notes', folder: 'Work' })).toBe(
      'Move “Notes” to Work',
    )
  })

  it('leaves an unknown placeholder visible instead of blanking it', () => {
    // A silent empty string would ship a broken sentence; the raw token is at
    // least obvious in review.
    expect(interpolate('Hello {name}', {})).toBe('Hello {name}')
  })
})

describe('plurals', () => {
  it('uses English one/other', () => {
    const { plural } = createTranslator('en')

    expect(plural('library.noteCount', 1)).toBe('1 note')
    expect(plural('library.noteCount', 2)).toBe('2 notes')
    expect(plural('library.noteCount', 0)).toBe('0 notes')
  })

  it('uses all three Russian forms', () => {
    const { plural } = createTranslator('ru')

    expect(plural('library.noteCount', 1)).toBe('1 заметка')
    expect(plural('library.noteCount', 3)).toBe('3 заметки')
    expect(plural('library.noteCount', 5)).toBe('5 заметок')
    expect(plural('library.noteCount', 21)).toBe('21 заметка')
    expect(plural('library.noteCount', 11)).toBe('11 заметок')
  })

  it('defines the forms Russian actually needs for every plural key', () => {
    for (const key of Object.keys(enPlurals) as Array<keyof typeof enPlurals>) {
      const forms = ruPlurals[key]

      expect({ key, one: !!forms.one, few: !!forms.few, many: !!forms.many }).toEqual({
        key,
        one: true,
        few: true,
        many: true,
      })
    }
  })
})

describe('locale detection', () => {
  it('picks a supported language from the browser preferences', () => {
    expect(detectLocale(['ru-RU', 'en-US'])).toBe('ru')
    expect(detectLocale(['en-GB'])).toBe('en')
  })

  it('skips unsupported languages rather than failing', () => {
    expect(detectLocale(['de-DE', 'fr', 'ru'])).toBe('ru')
    expect(detectLocale(['de-DE'])).toBe(defaultLocale)
    expect(detectLocale([])).toBe(defaultLocale)
  })

  it('guards stored values', () => {
    expect(isLocale('ru')).toBe(true)
    expect(isLocale('klingon')).toBe(false)
    expect(isLocale(null)).toBe(false)
  })
})

describe('date formatting', () => {
  it('formats with the active locale and survives a bad value', () => {
    const russian = createTranslator('ru').formatDateTime('2026-07-27T10:20:00.000Z', {
      dateStyle: 'long',
    })

    expect(russian).toContain('2026')
    expect(createTranslator('en').formatDateTime('not a date')).toBe('not a date')
  })
})
