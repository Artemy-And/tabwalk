import { createContext, useContext } from 'react';
import { de } from './de';
import { en, type Messages } from './en';
import { es } from './es';
import { fr } from './fr';
import { it } from './it';
import { pl } from './pl';
import { ru } from './ru';
import { zh } from './zh';

export const LOCALES = ['en', 'de', 'es', 'fr', 'it', 'pl', 'ru', 'zh'] as const;
export type Locale = (typeof LOCALES)[number];
export const DEFAULT_LOCALE: Locale = 'en';

export const MESSAGES: Record<Locale, Messages> = { en, de, es, fr, it, pl, ru, zh };

export const LOCALE_NAMES: Record<Locale, string> = {
  en: 'English',
  de: 'Deutsch',
  es: 'Español',
  fr: 'Français',
  it: 'Italiano',
  pl: 'Polski',
  ru: 'Русский',
  zh: '简体中文',
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
