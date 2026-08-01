import { useMemo, type PropsWithChildren } from 'react'
import { createTranslator, type Locale } from '@/shared/i18n'
import { TranslationContext } from '@/ui/i18n/translation-context'

export function TranslationProvider({
  children,
  locale,
}: PropsWithChildren<{ locale: Locale }>) {
  const translator = useMemo(() => createTranslator(locale), [locale])

  return (
    <TranslationContext.Provider value={translator}>
      {children}
    </TranslationContext.Provider>
  )
}
