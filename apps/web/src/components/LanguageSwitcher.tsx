import { LOCALE_NAMES, LOCALES, useI18n } from '../i18n/context';

export function LanguageSwitcher() {
  const { locale, setLocale, t } = useI18n();

  return (
    <fieldset className="inline-flex gap-0.5 rounded-lg border border-line p-0.5">
      <legend className="visually-hidden">{t.language.label}</legend>
      {LOCALES.map((code) => {
        const active = code === locale;
        return (
          <button
            key={code}
            type="button"
            lang={code}
            aria-pressed={active}
            onClick={() => setLocale(code)}
            className={`min-h-9 min-w-10 rounded-md px-2 text-[13px] font-semibold ${
              active ? 'bg-accent text-on-accent' : 'text-muted hover:bg-surface-alt hover:text-ink'
            }`}
          >
            <span aria-hidden="true">{LOCALE_NAMES[code].short}</span>
            <span className="visually-hidden">{LOCALE_NAMES[code].native}</span>
          </button>
        );
      })}
    </fieldset>
  );
}
