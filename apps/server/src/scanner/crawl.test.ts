import assert from 'node:assert/strict';
import { createServer, type Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import { after, before, beforeEach, test } from 'node:test';
import { gzipSync } from 'node:zlib';
import { chromium } from 'playwright';
import { checkPage, NotAPageError } from './check.js';
import { allowedBy, compilePatterns, crawl, isFile, normalize, sitemapsInRobots } from './crawl.js';

interface Route {
  type?: string;
  body: string | Buffer;
}

let routes: Record<string, Route> = {};
let redirectLocalhost = false;
let server: Server;
let base: string;

before(async () => {
  server = createServer((req, res) => {
    if (redirectLocalhost && req.headers.host?.startsWith('localhost')) {
      res.writeHead(301, { location: `${base}${req.url}` });
      res.end();
      return;
    }
    const route = routes[req.url ?? ''];
    if (!route) {
      res.writeHead(404, { 'content-type': 'text/plain' });
      res.end('not found');
      return;
    }
    res.writeHead(200, { 'content-type': route.type ?? 'text/html' });
    res.end(route.body);
  });
  await new Promise<void>((resolve) => server.listen(0, resolve));
  base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
});

after(() => new Promise<void>((resolve) => server.close(() => resolve())));

beforeEach(() => {
  routes = { '/': { body: '<!doctype html><title>Home</title>' } };
  redirectLocalhost = false;
});

// stands in for the browser: each path links to the paths listed for it
function linksBetween(pages: Record<string, string[]>) {
  const visited: string[] = [];
  const visit = async (url: string) => {
    visited.push(url);
    const { pathname } = new URL(url);
    return (pages[pathname] ?? []).map((href) => new URL(href, url).href);
  };
  return { visited, visit };
}

test('files are skipped by the extension of the path, not of the query (#6)', () => {
  const file = (url: string) => isFile(new URL(url));
  assert.equal(file('https://shop.test/price-list.pdf'), true);
  assert.equal(file('https://shop.test/img/Photo.JPG'), true);
  assert.equal(file('https://shop.test/files/archive.zip'), true);
  assert.equal(file('https://shop.test/page?file=report.pdf'), false);
  assert.equal(file('https://shop.test/about.html'), false);
  assert.equal(file('https://shop.test/v1.2/docs'), false);
  assert.equal(file('https://shop.test/blog/'), false);
});

test('addresses lose tracking parameters and fragments but keep hash routes', () => {
  assert.equal(normalize('https://shop.test/a?utm_source=x&id=2#top'), 'https://shop.test/a?id=2');
  assert.equal(normalize('https://shop.test/?gclid=1'), 'https://shop.test/');
  assert.equal(normalize('https://shop.test/#/pricing'), 'https://shop.test/#/pricing');
  assert.equal(normalize('https://shop.test/#!/pricing'), 'https://shop.test/#!/pricing');
  assert.equal(normalize('https://shop.test/#/'), 'https://shop.test/');
  assert.equal(normalize('/b', 'https://shop.test/a/'), 'https://shop.test/b');
  assert.equal(normalize('mailto:hello@shop.test'), null);
  assert.equal(normalize('javascript:void(0)'), null);
});

test('include and exclude paths match the start of the address, * matches anything', () => {
  const include = compilePatterns(['/blog/', 'docs/*/intro', '/о-нас/']);
  const exclude = compilePatterns(['*?page=*', 'https://shop.test/blog/drafts', '  ']);
  const allowed = (path: string) => allowedBy(new URL(path, 'https://shop.test'), include, exclude);

  assert.equal(allowed('/blog/hello'), true);
  assert.equal(allowed('/BLOG/hello'), true);
  assert.equal(allowed('/docs/v2/intro'), true);
  assert.equal(allowed('/о-нас/команда'), true);
  assert.equal(allowed('/about'), false);
  assert.equal(allowed('/blog/?page=2'), false);
  assert.equal(allowed('/blog/drafts/one'), false);
  assert.equal(compilePatterns(['', '   ']).length, 0);
});

test('robots.txt lists sitemaps on their own lines', () => {
  const robots =
    'User-agent: *\r\nDisallow: /cart\r\nSitemap: https://shop.test/a.xml\nsitemap:https://shop.test/b.xml.gz\n';
  assert.deepEqual(sitemapsInRobots(robots), [
    'https://shop.test/a.xml',
    'https://shop.test/b.xml.gz',
  ]);
});

test('sitemaps from robots.txt are read through indexes and gzip', async () => {
  routes['/robots.txt'] = { type: 'text/plain', body: `Sitemap: ${base}/maps/index.xml\n` };
  routes['/maps/index.xml'] = {
    type: 'application/xml',
    body: `<sitemapindex><sitemap><loc>${base}/maps/pages.xml.gz</loc></sitemap></sitemapindex>`,
  };
  routes['/maps/pages.xml.gz'] = {
    type: 'application/gzip',
    body: gzipSync(
      '<urlset>' +
        `<url><loc>${base}/from-sitemap?a=1&amp;b=2</loc></url>` +
        `<url><loc><![CDATA[${base}/cdata]]></loc></url>` +
        `<url><loc>${base}/price-list.pdf</loc></url>` +
        '<url><loc>https://elsewhere.test/page</loc></url>' +
        '</urlset>',
    ),
  };

  const { visit } = linksBetween({});
  const found = await crawl(`${base}/`, { limit: 10, concurrency: 2, visit });

  assert.deepEqual(found, [`${base}/`, `${base}/from-sitemap?a=1&b=2`, `${base}/cdata`]);
});

test('without a sitemap, links are followed breadth first up to the limit', async () => {
  // a single-page app answers /sitemap.xml with its own HTML
  routes['/sitemap.xml'] = { body: '<!doctype html><div id="app"></div>' };
  const { visited, visit } = linksBetween({
    '/': ['/one', '/two', 'mailto:hi@shop.test', 'https://elsewhere.test/', '/menu.pdf', '#top'],
    '/one': ['/one/deeper', '/two'],
    '/two': ['/three'],
    '/one/deeper': ['/four'],
  });

  const found = await crawl(`${base}/`, { limit: 4, concurrency: 1, visit });

  const expected = ['/', '/one', '/two', '/one/deeper'].map((path) => `${base}${path}`);
  assert.deepEqual(found, expected);
  assert.deepEqual(visited, expected);
});

test('the rules decide what is followed, but the site address is always checked', async () => {
  const { visit } = linksBetween({
    '/': ['/docs/a', '/docs/old/b', '/blog/c'],
    '/docs/a': ['/docs/a/1', '/blog/d'],
  });

  const found = await crawl(`${base}/`, {
    limit: 10,
    concurrency: 1,
    rules: { include: ['/docs/'], exclude: ['/docs/old/'] },
    visit,
  });

  assert.deepEqual(
    found,
    ['/', '/docs/a', '/docs/a/1'].map((path) => `${base}${path}`),
  );
});

test('a redirect to another host moves the crawl to that host', async () => {
  redirectLocalhost = true;
  const port = new URL(base).port;
  const visit = async (url: string) =>
    url.startsWith('http://localhost') ? [`${base}/`, `${base}/x`] : [];

  const found = await crawl(`http://localhost:${port}/`, { limit: 10, concurrency: 1, visit });

  assert.deepEqual(found, [`http://localhost:${port}/`, `${base}/x`]);
});

test('every worker stops once the last open page is done', async () => {
  // a tree three levels deep: 1 + 3 + 9 + 27 pages
  const pages: Record<string, string[]> = {};
  const walk = (path: string, depth: number) => {
    if (depth === 3) return;
    const children = [1, 2, 3].map((n) => `${path === '/' ? '' : path}/${n}`);
    pages[path] = children;
    for (const child of children) walk(child, depth + 1);
  };
  walk('/', 0);
  const { visited, visit } = linksBetween(pages);
  const slow = async (url: string) => {
    await new Promise((resolve) => setTimeout(resolve, Math.random() * 15));
    return visit(url);
  };

  const found = await crawl(`${base}/`, { limit: 100, concurrency: 4, visit: slow });

  assert.equal(found.length, 40);
  assert.equal(new Set(visited).size, 40);
  assert.equal(visited.length, 40);
});

test('a page reports the links it renders, and a file is not a page', async (t) => {
  const browser = await chromium.launch();
  t.after(() => browser.close());

  routes['/app'] = {
    body:
      '<!doctype html><html lang="en"><title>App</title><body><main id="app"></main><script>' +
      "document.getElementById('app').innerHTML = '<nav><a href=\"/docs\">Docs</a> " +
      '<a href="pricing">Pricing</a> <a href="mailto:hi@shop.test">Mail</a></nav>' +
      '<svg width="10" height="10"><a href="/drawn"><rect width="10" height="10"/></a></svg>\';' +
      '</script></body></html>',
  };
  routes['/price-list'] = { type: 'application/pdf', body: '%PDF-1.4\n%%EOF\n' };
  routes['/export'] = { type: 'text/csv', body: 'a,b\n1,2\n' };

  const { links } = await checkPage(browser, `${base}/app`, 10_000);
  for (const link of [`${base}/docs`, `${base}/pricing`, `${base}/drawn`]) {
    assert.ok(links.includes(link), `${link} is among ${links.join(', ')}`);
  }

  await assert.rejects(checkPage(browser, `${base}/price-list`, 10_000), NotAPageError);
  await assert.rejects(checkPage(browser, `${base}/export`, 10_000), NotAPageError);
});
