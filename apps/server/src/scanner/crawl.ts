export const USER_AGENT = 'Skiplink/0.1 (+accessibility scanner)';

async function fetchText(url: string, timeoutMs = 15_000): Promise<string | null> {
  try {
    const res = await fetch(url, {
      headers: { 'user-agent': USER_AGENT },
      signal: AbortSignal.timeout(timeoutMs),
      redirect: 'follow',
    });
    if (!res.ok) return null;
    return await res.text();
  } catch {
    return null;
  }
}

function extractLocs(xml: string): string[] {
  const out: string[] = [];
  const re = /<loc>\s*([^<\s]+)\s*<\/loc>/gi;
  let m = re.exec(xml);
  while (m !== null) {
    if (m[1]) out.push(m[1]);
    m = re.exec(xml);
  }
  return out;
}

function sameOrigin(candidate: string, origin: string): boolean {
  try {
    return new URL(candidate).origin === origin;
  } catch {
    return false;
  }
}

function normalize(raw: string): string | null {
  try {
    const u = new URL(raw);
    u.hash = '';
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

async function fromSitemap(origin: string, limit: number): Promise<string[]> {
  const found = new Set<string>();

  const roots = [`${origin}/sitemap.xml`, `${origin}/sitemap_index.xml`];

  for (const root of roots) {
    const xml = await fetchText(root);
    if (!xml) continue;

    const locs = extractLocs(xml);
    const isIndex = /<sitemapindex/i.test(xml);

    if (isIndex) {
      for (const child of locs.slice(0, 10)) {
        const childXml = await fetchText(child);
        if (!childXml) continue;
        for (const loc of extractLocs(childXml)) {
          const n = normalize(loc);
          if (n && sameOrigin(n, origin)) found.add(n);
          if (found.size >= limit) return [...found];
        }
      }
    } else {
      for (const loc of locs) {
        const n = normalize(loc);
        if (n && sameOrigin(n, origin)) found.add(n);
        if (found.size >= limit) return [...found];
      }
    }

    if (found.size > 0) return [...found];
  }

  return [];
}

async function fromLinks(startUrl: string, origin: string, limit: number): Promise<string[]> {
  const html = await fetchText(startUrl);
  const found = new Set<string>([startUrl]);
  if (!html) return [...found];

  const re = /<a\b[^>]*\bhref=["']([^"']+)["']/gi;
  let m = re.exec(html);
  while (m !== null && found.size < limit) {
    const href = m[1];
    if (href && !href.startsWith('mailto:') && !href.startsWith('tel:')) {
      try {
        const abs = normalize(new URL(href, startUrl).toString());
        if (abs && sameOrigin(abs, origin)) found.add(abs);
      } catch {
        // ignore
      }
    }
    m = re.exec(html);
  }

  return [...found];
}

export async function discoverUrls(siteUrl: string, limit: number): Promise<string[]> {
  const start = normalize(siteUrl);
  if (!start) throw new Error(`Invalid site URL: ${siteUrl}`);

  const origin = new URL(start).origin;

  const bySitemap = await fromSitemap(origin, limit);
  if (bySitemap.length > 0) {
    const set = new Set(bySitemap);
    set.add(start);
    return [...set].slice(0, limit);
  }

  return (await fromLinks(start, origin, limit)).slice(0, limit);
}
