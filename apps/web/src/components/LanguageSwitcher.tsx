import { isLocale, LOCALE_NAMES, LOCALES, useI18n } from '../i18n/context';

export function LanguageSwitcher() {
  const { locale, setLocale, t } = useI18n();

  return (
    <label className="relative inline-flex items-center text-muted hover:text-ink">
      <span className="visually-hidden">{t.language.label}</span>
      <svg
        width="16"
        height="16"
        viewBox="0 0 16 16"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.4"
        aria-hidden="true"
        className="pointer-events-none absolute left-2.5"
      >
        <circle cx="8" cy="8" r="6.3" />
        <path d="M1.7 8h12.6M8 1.7c1.8 1.9 2.6 4 2.6 6.3S9.8 12.4 8 14.3C6.2 12.4 5.4 10.3 5.4 8S6.2 3.6 8 1.7Z" />
      </svg>
      <select
        value={locale}
        onChange={(e) => {
          if (isLocale(e.target.value)) setLocale(e.target.value);
        }}
        className="h-9 cursor-pointer appearance-none rounded-lg border border-line bg-surface pr-7 pl-8 text-[13px] font-semibold text-inherit hover:bg-surface-alt"
      >
        {LOCALES.map((code) => (
          <option key={code} value={code} lang={code}>
            {LOCALE_NAMES[code]}
          </option>
        ))}
      </select>
      <svg
        width="10"
        height="10"
        viewBox="0 0 10 10"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinecap="round"
        strokeLinejoin="round"
        aria-hidden="true"
        className="pointer-events-none absolute right-2.5"
      >
        <path d="M2 3.5 5 6.5 8 3.5" />
      </svg>
    </label>
  );
}
