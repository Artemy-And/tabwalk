import { createRootRoute, createRoute, createRouter } from '@tanstack/react-router';
import { RootLayout } from './pages/RootLayout';
import { ScanPage } from './pages/ScanPage';
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

const routeTree = rootRoute.addChildren([indexRoute, siteRoute, scanRoute]);

export const router = createRouter({ routeTree });

declare module '@tanstack/react-router' {
  interface Register {
    router: typeof router;
  }
}
