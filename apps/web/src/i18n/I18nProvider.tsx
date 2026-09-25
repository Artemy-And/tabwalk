import { type ReactNode, useEffect, useMemo, useState } from 'react';
import {
  DEFAULT_LOCALE,
  I18nContext,
  type I18nValue,
  isLocale,
  type Locale,
  MESSAGES,
} from './context';

const STORAGE_KEY = 'skiplink.locale';

function readStoredLocale(): Locale {
  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    return isLocale(stored) ? stored : DEFAULT_LOCALE;
  } catch {
    return DEFAULT_LOCALE;
  }
}

function storeLocale(locale: Locale) {
  try {
    localStorage.setItem(STORAGE_KEY, locale);
  } catch {
    // ignore
  }
}

export function I18nProvider({ children }: { children: ReactNode }) {
  const [locale, setLocale] = useState<Locale>(readStoredLocale);

  useEffect(() => {
    document.documentElement.lang = locale;
    document.title = MESSAGES[locale].meta.title;
  }, [locale]);

  const value = useMemo<I18nValue>(
    () => ({
      locale,
      t: MESSAGES[locale],
      setLocale: (next) => {
        setLocale(next);
        storeLocale(next);
      },
    }),
    [locale],
  );

  return <I18nContext value={value}>{children}</I18nContext>;
}
