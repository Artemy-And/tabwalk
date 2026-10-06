import { createRootRoute, createRoute, createRouter } from '@tanstack/react-router';
import { PagePage } from './pages/PagePage';
import { ReportPage } from './pages/ReportPage';
import { RootLayout } from './pages/RootLayout';
import { ScanPage } from './pages/ScanPage';
import { SettingsPage } from './pages/SettingsPage';
import { SitePage } from './pages/SitePage';
import { SitesPage } from './pages/SitesPage';

const rootRoute = createRootRoute({ component: RootLayout });

const indexRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/',
  component: SitesPage,
});

const siteRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/sites/$siteId',
  component: SitePage,
});

const scanRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/scans/$scanId',
  component: ScanPage,
});

const reportRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/scans/$scanId/report',
  component: ReportPage,
});

const pageRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/pages/$pageId',
  component: PagePage,
});

const settingsRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/settings',
  component: SettingsPage,
});

const routeTree = rootRoute.addChildren([
  indexRoute,
  siteRoute,
  scanRoute,
  reportRoute,
  pageRoute,
  settingsRoute,
]);

export const router = createRouter({ routeTree });

declare module '@tanstack/react-router' {
  interface Register {
    router: typeof router;
  }
}
