import { useQuery } from '@tanstack/react-query';
import { Link, Outlet, useLocation } from '@tanstack/react-router';
import { AuthScreen } from '../components/AuthScreen';
import { LanguageSwitcher } from '../components/LanguageSwitcher';
import { LogoMark } from '../components/Logo';
import { LiveStatus } from '../components/ui';
import { useI18n } from '../i18n/context';
import { ApiError, api } from '../lib/api';

const NAV_LINK = 'border-b-2 px-2 py-2.5 sm:px-3.5 text-[15px] font-semibold no-underline';
const NAV_ACTIVE = 'border-accent text-accent';
const NAV_IDLE = 'border-transparent text-muted hover:text-ink';

export function RootLayout() {
  const { t } = useI18n();
  const { pathname } = useLocation();
  const me = useQuery({ queryKey: ['me'], queryFn: api.me, retry: false });
  const signedOut = me.error instanceof ApiError && me.error.status === 401;
  const config = useQuery({
    queryKey: ['auth-config'],
    queryFn: api.authConfig,
    enabled: signedOut,
  });
  const onAccount = pathname.startsWith('/account');

  let content = <LiveStatus>{t.auth.checking}</LiveStatus>;
  if (me.data) content = <Outlet />;
  else if (signedOut && config.data) content = <AuthScreen config={config.data} />;
  else if (me.isError && !signedOut) {
    content = (
      <p role="alert" className="text-critical">
        {me.error.message}
      </p>
    );
  }

  return (
    <div className="flex min-h-screen flex-col">
      <a
        href="#main"
        className="visually-hidden focus:not-sr-only absolute left-2 top-2 z-50 rounded bg-surface px-3 py-2 text-ink"
      >
        {t.layout.skipToContent}
      </a>

      <header className="sticky top-0 z-40 border-b border-line-soft bg-surface/85 backdrop-blur">
        <div className="mx-auto flex min-h-[68px] max-w-[1280px] flex-wrap items-center gap-x-4 gap-y-2 px-4 py-2 sm:gap-x-10 sm:px-10">
          <Link
            to="/"
            className="flex items-center gap-2.5 text-[19px] font-bold tracking-[-0.01em] text-ink no-underline hover:text-ink sm:text-[20px]"
          >
            <LogoMark size={32} className="size-7 sm:size-8" />
            Tabwalk
          </Link>
          <nav aria-label={t.layout.mainNav} className="flex grow gap-1">
            {me.data && (
              <>
                <Link
                  to="/"
                  activeOptions={{ exact: true }}
                  className={`${NAV_LINK} ${onAccount ? NAV_IDLE : NAV_ACTIVE}`}
                >
                  {t.layout.sites}
                </Link>
                <Link to="/account" className={`${NAV_LINK} ${onAccount ? NAV_ACTIVE : NAV_IDLE}`}>
                  {t.layout.account}
                </Link>
              </>
            )}
          </nav>
          <LanguageSwitcher />
        </div>
      </header>

      <main id="main" className="mx-auto w-full max-w-[1280px] grow px-4 py-8 sm:px-10">
        {content}
      </main>
    </div>
  );
}
