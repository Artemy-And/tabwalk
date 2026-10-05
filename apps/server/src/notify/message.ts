import type { ChannelKind } from '../db/schema.js';

export interface NewProblem {
  impact: string | null;
  help: string;
  ruleId: string;
  pages: number;
}

export interface ScanNews {
  siteName: string;
  siteUrl: string;
  reportUrl: string | null;
  first: boolean;
  error: string | null;
  problems: number;
  critical: number;
  newProblems: NewProblem[];
  fixed: number;
  test?: boolean;
}

export interface Outgoing {
  url: string;
  init: RequestInit;
}

const SHOWN = 5;

function count(n: number, noun: string): string {
  return `${n} ${noun}${n === 1 ? '' : 's'}`;
}

export function headline(news: ScanNews): string {
  if (news.test) return 'Tabwalk can send notifications here';
  if (news.error) return `Scan of ${news.siteName} failed`;
  if (news.first) {
    return `First scan of ${news.siteName}: ${count(news.problems, 'problem')}, ${news.critical} critical`;
  }
  return `${count(news.newProblems.length, 'new problem')} on ${news.siteName}`;
}

export function details(news: ScanNews): string[] {
  if (news.test) {
    return ['New problems, the first scan of a site and failed scans will be reported like this.'];
  }
  if (news.error) return [news.error];

  // the same rule broken on different markup reads as one line
  const byRule = new Map<string, { problem: NewProblem; times: number }>();
  for (const problem of news.newProblems) {
    const key = `${problem.ruleId}|${problem.impact}`;
    const seen = byRule.get(key);
    if (seen) seen.times++;
    else byRule.set(key, { problem, times: 1 });
  }
  const rules = [...byRule.values()];
  const lines = rules.slice(0, SHOWN).map(({ problem: p, times }) => {
    const where = times > 1 ? ` ×${times}` : `, ${count(p.pages, 'page')}`;
    return `${p.impact ?? 'minor'}: ${p.help} (${p.ruleId})${where}`;
  });
  if (rules.length > SHOWN) lines.push(`and ${rules.length - SHOWN} more`);
  if (news.fixed > 0) lines.push(`Fixed since the last scan: ${news.fixed}`);
  return lines;
}

const slackText = (text: string) =>
  text.replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;');

// fetch refuses a URL with a user and password in it, so they move to a header
function withoutCredentials(target: string): { url: URL; headers: Record<string, string> } {
  const url = new URL(target);
  const headers: Record<string, string> = {};
  if (url.username || url.password) {
    const pair = `${decodeURIComponent(url.username)}:${decodeURIComponent(url.password)}`;
    headers.authorization = `Basic ${Buffer.from(pair).toString('base64')}`;
    url.username = '';
    url.password = '';
  }
  return { url, headers };
}

export function webRequest(
  kind: Exclude<ChannelKind, 'email'>,
  target: string,
  news: ScanNews,
): Outgoing {
  const title = headline(news);
  const lines = details(news);
  const { url, headers } = withoutCredentials(target);
  const post = (body: unknown): RequestInit => ({
    method: 'POST',
    headers: { ...headers, 'content-type': 'application/json' },
    body: JSON.stringify(body),
  });

  switch (kind) {
    case 'slack': {
      const head = news.reportUrl ? `<${news.reportUrl}|${slackText(title)}>` : slackText(title);
      const text = [`*${head}*`, ...lines.map((line) => `• ${slackText(line)}`)].join('\n');
      return { url: url.toString(), init: post({ text }) };
    }
    case 'discord': {
      const head = news.reportUrl ? `[${title}](${news.reportUrl})` : title;
      const content = [`**${head}**`, ...lines.map((line) => `- ${line}`)].join('\n');
      return {
        url: url.toString(),
        init: post({ content: content.slice(0, 2000), allowed_mentions: { parse: [] } }),
      };
    }
    case 'ntfy': {
      // JSON publishing keeps non-Latin site names intact; it goes to the server, not the topic
      const parts = url.pathname.split('/').filter(Boolean);
      const topic = parts.pop() ?? '';
      url.pathname = `/${parts.join('/')}`;
      const tag = news.error ? 'x' : news.newProblems.length > 0 ? 'warning' : 'white_check_mark';
      return {
        url: url.toString(),
        init: post({
          topic,
          title,
          message: lines.join('\n') || title,
          tags: [tag],
          ...(news.reportUrl ? { click: news.reportUrl } : {}),
        }),
      };
    }
    case 'webhook':
      return {
        url: url.toString(),
        init: post({
          event: news.test ? 'test' : news.error ? 'scan.failed' : 'scan.finished',
          title,
          ...news,
        }),
      };
  }
}

export function emailMessage(news: ScanNews): { subject: string; text: string } {
  const text = [
    ...details(news),
    '',
    ...(news.reportUrl ? [`Report: ${news.reportUrl}`] : []),
    ...(news.test ? [] : [`Site: ${news.siteUrl}`]),
  ].join('\n');
  return { subject: headline(news), text };
}
