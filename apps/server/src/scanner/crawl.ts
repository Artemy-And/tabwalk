import { gunzipSync } from 'node:zlib';

export const USER_AGENT = 'Tabwalk/0.1 (+accessibility scanner)';

// sitemap files read per scan, indexes included
const MAX_SITEMAPS = 25;

// the sitemap protocol's limit for one file
const MAX_SITEMAP_BYTES = 50 * 1024 * 1024;

// a browser would download these instead of opening a page (#6)
const FILE_EXTENSIONS = new Set([
  ...['pdf', 'doc', 'docx', 'xls', 'xlsx', 'ppt', 'pptx', 'odt', 'ods', 'odp', 'rtf', 'epub'],
  ...['csv', 'txt', 'json', 'xml', 'rss', 'atom', 'ics', 'css', 'js', 'mjs'],
  ...['zip', 'rar', '7z', 'gz', 'tgz', 'tar', 'bz2', 'xz', 'dmg', 'exe', 'msi', 'apk', 'iso'],
  ...['jpg', 'jpeg', 'png', 'gif', 'webp', 'avif', 'svg', 'ico', 'bmp', 'tif', 'tiff', 'heic'],
  ...['mp3', 'wav', 'ogg', 'm4a', 'flac', 'mp4', 'webm', 'mov', 'avi', 'mkv', 'm4v'],
  ...['woff', 'woff2', 'ttf', 'otf', 'eot'],
]);

export interface CrawlRules {
  include: string[];
  exclude: string[];
}

export interface CrawlOptions {
  limit: number;
  concurrency: number;
  rules?: CrawlRules;
  // opens one page and resolves to the links on it
  visit: (url: string) => Promise<string[]>;
}

interface Scope {
  origins: Set<string>;
  include: RegExp[];
  exclude: RegExp[];
}

async function fetchText(url: string, timeoutMs = 15_000): Promise<string | null> {
  try {
    const res = await fetch(url, {
      headers: { 'user-agent': USER_AGENT },
      signal: AbortSignal.timeout(timeoutMs),
      redirect: 'follow',
    });
    if (!res.ok) return null;
    const body = Buffer.from(await res.arrayBuffer());
    // fetch undoes Content-Encoding, but a sitemap.xml.gz file arrives still compressed
    const gzipped = body[0] === 0x1f && body[1] === 0x8b;
    return (gzipped ? gunzipSync(body, { maxOutputLength: MAX_SITEMAP_BYTES }) : body).toString(
      'utf8',
    );
  } catch {
    return null;
  }
}

function decodeXml(text: string): string {
  return text
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&amp;/g, '&');
}

function extractLocs(xml: string): string[] {
  const out: string[] = [];
  const re = /<loc>\s*(?:<!\[CDATA\[)?\s*([^<\s\]]+)\s*(?:\]\]>)?\s*<\/loc>/gi;
  let m = re.exec(xml);
  while (m !== null) {
    if (m[1]) out.push(decodeXml(m[1]));
    m = re.exec(xml);
  }
  return out;
}

export function sitemapsInRobots(robots: string): string[] {
  const out: string[] = [];
  for (const line of robots.split(/\r?\n/)) {
    const m = /^\s*sitemap\s*:\s*(\S+)/i.exec(line);
    if (m?.[1]) out.push(m[1]);
  }
  return out;
}

export function normalize(raw: string, base?: string): string | null {
  try {
    const u = new URL(raw, base);
    if (u.protocol !== 'http:' && u.protocol !== 'https:') return null;
    // an app that routes on the hash has a page behind every #/path; #/ is the start page
    if (!/^#!?\/./.test(u.hash)) u.hash = '';
    for (const key of [...u.searchParams.keys()]) {
      if (key.startsWith('utm_') || key === 'fbclid' || key === 'gclid') {
        u.searchParams.delete(key);
      }
    }
    return u.toString();
  } catch {
    return null;
  }
}

export function isFile(url: URL): boolean {
  const name = url.pathname.slice(url.pathname.lastIndexOf('/') + 1);
  const dot = name.lastIndexOf('.');
  return dot > 0 && FILE_EXTENSIONS.has(name.slice(dot + 1).toLowerCase());
}

function decodePath(path: string): string {
  try {
    return decodeURI(path);
  } catch {
    return path;
  }
}

// a pattern matches every address whose path starts with it; * stands for anything
export function compilePatterns(patterns: string[]): RegExp[] {
  const out: RegExp[] = [];
  for (const raw of patterns) {
    let pattern = raw.trim();
    if (!pattern) continue;
    if (/^https?:\/\//i.test(pattern)) {
      try {
        const u = new URL(pattern);
        pattern = `${u.pathname}${u.search}${u.hash}`;
      } catch {
        continue;
      }
    }
    pattern = decodePath(pattern);
    if (!pattern.startsWith('/') && !pattern.startsWith('*')) pattern = `/${pattern}`;
    const source = pattern
      .split('*')
      .map((part) => part.replace(/[.+?^${}()|[\]\\]/g, '\\$&'))
      .join('.*');
    out.push(new RegExp(`^${source}`, 'i'));
  }
  return out;
}

export function allowedBy(url: URL, include: RegExp[], exclude: RegExp[]): boolean {
  const path = decodePath(`${url.pathname}${url.search}${url.hash}`);
  if (include.length > 0 && !include.some((re) => re.test(path))) return false;
  return !exclude.some((re) => re.test(path));
}

function inScope(raw: string, scope: Scope): string | null {
  const normalized = normalize(raw);
  if (!normalized) return null;
  const url = new URL(normalized);
  if (!scope.origins.has(url.origin) || isFile(url)) return null;
  return allowedBy(url, scope.include, scope.exclude) ? normalized : null;
}

// redirects such as http → https or example.com → www.example.com move the whole site
async function landingUrl(start: string): Promise<string> {
  try {
    const res = await fetch(start, {
      headers: { 'user-agent': USER_AGENT },
      signal: AbortSignal.timeout(15_000),
      redirect: 'follow',
    });
    await res.body?.cancel();
    return normalize(res.url) ?? start;
  } catch {
    return start;
  }
}

async function fromSitemaps(scope: Scope, limit: number): Promise<string[]> {
  const queue: string[] = [];
  for (const origin of scope.origins) {
    const robots = await fetchText(`${origin}/robots.txt`);
    if (robots) queue.push(...sitemapsInRobots(robots));
  }
  if (queue.length === 0) {
    for (const origin of scope.origins) {
      queue.push(`${origin}/sitemap.xml`, `${origin}/sitemap_index.xml`);
    }
  }

  const read = new Set<string>();
  const found = new Set<string>();
  while (queue.length > 0 && read.size < MAX_SITEMAPS && found.size < limit) {
    const next = normalize(queue.shift() ?? '');
    if (!next || read.has(next)) continue;
    read.add(next);

    const xml = await fetchText(next);
    // a single-page app answers every path, /sitemap.xml included, with its own HTML
    if (!xml || !/<(urlset|sitemapindex)\b/i.test(xml)) continue;

    if (/<sitemapindex\b/i.test(xml)) {
      queue.push(...extractLocs(xml));
      continue;
    }

    for (const loc of extractLocs(xml)) {
      const url = inScope(loc, scope);
      if (url) found.add(url);
      if (found.size >= limit) break;
    }
  }

  return [...found];
}

// Starts at the site's address and the sitemaps, then follows the links on every page
// it opens, breadth first, until it runs out of links or reaches the limit.
// Resolves to every address it took on, in the order it took them.
export async function crawl(siteUrl: string, options: CrawlOptions): Promise<string[]> {
  const start = normalize(siteUrl);
  if (!start) throw new Error(`Invalid site URL: ${siteUrl}`);

  const landing = await landingUrl(start);
  const scope: Scope = {
    origins: new Set([new URL(start).origin, new URL(landing).origin]),
    include: compilePatterns(options.rules?.include ?? []),
    exclude: compilePatterns(options.rules?.exclude ?? []),
  };

  const seen = new Set<string>();
  const queue: string[] = [];
  const add = (url: string) => {
    if (seen.size >= options.limit || seen.has(url)) return;
    // the start page again, under the address its redirect lands on
    if (url === landing && url !== start) return;
    seen.add(url);
    queue.push(url);
  };

  // the site's own address is checked whatever the rules say
  add(start);
  for (const url of await fromSitemaps(scope, options.limit)) add(url);

  let active = 0;
  let waiting: (() => void)[] = [];

  async function worker(): Promise<void> {
    for (;;) {
      const url = queue.shift();
      if (url === undefined) {
        // nothing queued, and no open page left that could add more
        if (active === 0) return;
        await new Promise<void>((resolve) => waiting.push(resolve));
        continue;
      }

      active += 1;
      try {
        for (const link of await options.visit(url)) {
          const next = inScope(link, scope);
          if (next) add(next);
        }
      } catch {
        // visit records its own failures
      } finally {
        active -= 1;
        const wake = waiting;
        waiting = [];
        for (const resolve of wake) resolve();
      }
    }
  }

  await Promise.all(Array.from({ length: Math.max(1, options.concurrency) }, worker));
  return [...seen];
}
