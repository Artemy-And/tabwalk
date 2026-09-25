import { Link, Outlet } from '@tanstack/react-router';
import { LanguageSwitcher } from '../components/LanguageSwitcher';
import { useI18n } from '../i18n/context';

export function RootLayout() {
  const { t } = useI18n();

  return (
    <div className="flex min-h-screen flex-col">
      <a
        href="#main"
        className="visually-hidden focus:not-sr-only absolute left-2 top-2 z-50 rounded bg-surface px-3 py-2 text-ink"
      >
        {t.layout.skipToContent}
      </a>

      <header className="border-b border-line bg-surface">
        <div className="mx-auto flex min-h-[68px] max-w-[1280px] flex-wrap items-center gap-x-10 gap-y-2 px-4 py-2 sm:px-10">
          <Link
            to="/"
            className="font-display text-[27px] tracking-[-0.01em] text-ink no-underline hover:text-ink"
          >
            Skiplink
          </Link>
          <nav aria-label={t.layout.mainNav} className="flex grow gap-1">
            <Link
              to="/"
              activeOptions={{ exact: true }}
              className="border-b-2 border-accent px-3.5 py-2.5 text-[15px] font-semibold text-accent no-underline"
            >
              {t.layout.sites}
            </Link>
          </nav>
          <LanguageSwitcher />
        </div>
      </header>

      <main id="main" className="mx-auto w-full max-w-[1280px] grow px-4 py-8 sm:px-10">
        <Outlet />
      </main>
    </div>
  );
}
