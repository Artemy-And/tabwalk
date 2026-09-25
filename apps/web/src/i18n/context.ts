import { createContext, useContext } from 'react';
import { en, type Messages } from './en';
import { ru } from './ru';

export const LOCALES = ['en', 'ru'] as const;
export type Locale = (typeof LOCALES)[number];
export const DEFAULT_LOCALE: Locale = 'en';

export const MESSAGES: Record<Locale, Messages> = { en, ru };

export const LOCALE_NAMES: Record<Locale, { short: string; native: string }> = {
  en: { short: 'EN', native: 'English' },
  ru: { short: 'RU', native: 'Русский' },
};

export function isLocale(value: unknown): value is Locale {
  return LOCALES.includes(value as Locale);
}

export interface I18nValue {
  locale: Locale;
  t: Messages;
  setLocale: (locale: Locale) => void;
}

export const I18nContext = createContext<I18nValue | null>(null);

export function useI18n(): I18nValue {
  const value = useContext(I18nContext);
  if (!value) throw new Error('useI18n must be used inside <I18nProvider>');
  return value;
}
