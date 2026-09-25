import { LOCALE_NAMES, LOCALES, useI18n } from '../i18n/context';

export function LanguageSwitcher() {
  const { locale, setLocale, t } = useI18n();

  return (
    <fieldset className="inline-flex gap-0.5 rounded-md border border-line p-0.5">
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
            className={`rounded px-2 py-1 text-xs font-semibold ${
              active ? 'bg-accent text-canvas' : 'text-ink hover:bg-canvas'
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
