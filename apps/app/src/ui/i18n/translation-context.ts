import { createContext } from 'react'
import { createTranslator, defaultLocale, type Translator } from '@/shared/i18n'

/**
 * Lives in the UI layer because that is the only layer components may import
 * from besides shared. The locale itself is owned higher up, in settings, and
 * pushed in through the provider.
 */
export const TranslationContext = createContext<Translator>(
  createTranslator(defaultLocale),
)
