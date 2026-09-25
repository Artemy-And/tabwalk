import { Link, Outlet } from '@tanstack/react-router';
import { LanguageSwitcher } from '../components/LanguageSwitcher';
import { useI18n } from '../i18n/context';

export function RootLayout() {
  const { t } = useI18n();

  return (
    <div className="min-h-screen">
      <a
        href="#main"
        className="visually-hidden focus:not-sr-only absolute left-2 top-2 z-50 rounded bg-surface px-3 py-2 text-ink"
      >
        {t.layout.skipToContent}
      </a>

      <header className="border-b border-line bg-surface">
        <div className="mx-auto flex max-w-5xl items-center justify-between px-4 py-3">
          <Link to="/" className="text-base font-semibold text-ink">
            Skiplink
          </Link>
          <div className="flex items-center gap-4">
            <nav aria-label={t.layout.mainNav}>
              <Link to="/" className="text-sm text-accent underline">
                {t.layout.sites}
              </Link>
            </nav>
            <LanguageSwitcher />
          </div>
        </div>
      </header>

      <main id="main" className="mx-auto max-w-5xl px-4 py-6">
        <Outlet />
      </main>
    </div>
  );
}
