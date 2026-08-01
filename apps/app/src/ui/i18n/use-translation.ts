import { useContext } from 'react'
import type { Translator } from '@/shared/i18n'
import { TranslationContext } from '@/ui/i18n/translation-context'

export function useTranslation(): Translator {
  return useContext(TranslationContext)
}
