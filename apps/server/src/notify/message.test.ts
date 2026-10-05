import assert from 'node:assert/strict';
import { createServer, type IncomingMessage } from 'node:http';
import type { AddressInfo } from 'node:net';
import { test } from 'node:test';
import { details, emailMessage, headline, type ScanNews, webRequest } from './message.js';

const news: ScanNews = {
  siteName: 'Acme Store',
  siteUrl: 'https://acme.example/',
  reportUrl: 'https://tabwalk.example/scans/1',
  first: false,
  error: null,
  problems: 9,
  critical: 2,
  newProblems: [
    {
      impact: 'critical',
      help: 'Images must have alternative text',
      ruleId: 'image-alt',
      pages: 6,
    },
    {
      impact: 'serious',
      help: '<video> elements must have captions',
      ruleId: 'video-caption',
      pages: 1,
    },
  ],
  fixed: 3,
};

const bodyOf = (init: RequestInit) => JSON.parse(String(init.body));

test('the headline says what happened', () => {
  assert.equal(headline(news), '2 new problems on Acme Store');
  assert.equal(
    headline({ ...news, newProblems: news.newProblems.slice(0, 1) }),
    '1 new problem on Acme Store',
  );
  assert.equal(
    headline({ ...news, first: true }),
    'First scan of Acme Store: 9 problems, 2 critical',
  );
  assert.equal(
    headline({ ...news, error: 'net::ERR_NAME_NOT_RESOLVED' }),
    'Scan of Acme Store failed',
  );
});

test('details list the new problems, then what got fixed', () => {
  assert.deepEqual(details(news), [
    'critical: Images must have alternative text (image-alt), 6 pages',
    'serious: <video> elements must have captions (video-caption), 1 page',
    'Fixed since the last scan: 3',
  ]);
  const first = news.newProblems[0];
  assert.ok(first);
  const many = {
    ...news,
    fixed: 0,
    newProblems: Array.from({ length: 7 }, (_, i) => ({ ...first, ruleId: `rule-${i}` })),
  };
  assert.equal(details(many).at(-1), 'and 2 more');
  const twice = { ...news, fixed: 0, newProblems: [first, { ...first, pages: 2 }] };
  assert.deepEqual(details(twice), ['critical: Images must have alternative text (image-alt) ×2']);
});

test('Slack gets escaped mrkdwn that links to the report', () => {
  const { url, init } = webRequest('slack', 'https://hooks.slack.com/services/T/B/x', news);
  assert.equal(url, 'https://hooks.slack.com/services/T/B/x');
  const { text } = bodyOf(init);
  assert.match(text, /^\*<https:\/\/tabwalk\.example\/scans\/1\|2 new problems on Acme Store>\*/);
  assert.match(text, /&lt;video&gt; elements/);
});

test('Discord cannot be made to ping everyone', () => {
  const body = bodyOf(webRequest('discord', 'https://discord.com/api/webhooks/1/x', news).init);
  assert.deepEqual(body.allowed_mentions, { parse: [] });
  assert.match(body.content, /^\*\*\[2 new problems on Acme Store\]\(https:\/\/tabwalk/);
});

test('ntfy gets JSON on the server address with the topic inside', () => {
  const { url, init } = webRequest('ntfy', 'https://ntfy.example/alerts/a11y-team', {
    ...news,
    siteName: 'Магазин',
  });
  assert.equal(url, 'https://ntfy.example/alerts');
  const body = bodyOf(init);
  assert.equal(body.topic, 'a11y-team');
  assert.equal(body.title, '2 new problems on Магазин');
  assert.equal(body.click, news.reportUrl);
  assert.deepEqual(body.tags, ['warning']);
});

test('a user and password in the address become a Basic header', () => {
  const { url, init } = webRequest('webhook', 'https://bot:s3cret@hooks.example/tabwalk', news);
  assert.equal(url, 'https://hooks.example/tabwalk');
  assert.equal(
    new Headers(init.headers).get('authorization'),
    `Basic ${Buffer.from('bot:s3cret').toString('base64')}`,
  );
  assert.equal(bodyOf(init).event, 'scan.finished');
});

test('an email carries the report link and the site', () => {
  const { subject, text } = emailMessage(news);
  assert.equal(subject, '2 new problems on Acme Store');
  assert.match(text, /Report: https:\/\/tabwalk\.example\/scans\/1/);
  assert.match(text, /Site: https:\/\/acme\.example\//);
});

test('delivery posts to the endpoint and reports one that fails', async () => {
  process.env.DATABASE_URL ??= 'postgres://unused';
  const { deliver } = await import('./send.js');
  const received: { url?: string; auth?: string; body: string }[] = [];
  const server = createServer((req: IncomingMessage, res) => {
    let body = '';
    req.on('data', (chunk) => {
      body += chunk;
    });
    req.on('end', () => {
      received.push({ url: req.url, auth: req.headers.authorization, body });
      res.statusCode = req.url === '/broken' ? 500 : 204;
      res.end();
    });
  });
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  const port = (server.address() as AddressInfo).port;
  try {
    await deliver({ kind: 'discord', target: `http://bot:pw@127.0.0.1:${port}/hook` }, news);
    assert.equal(received[0]?.url, '/hook');
    assert.equal(received[0]?.auth, `Basic ${Buffer.from('bot:pw').toString('base64')}`);
    assert.match(received[0]?.body ?? '', /2 new problems on Acme Store/);
    await assert.rejects(
      deliver({ kind: 'webhook', target: `http://127.0.0.1:${port}/broken` }, news),
      /answered 500/,
    );
  } finally {
    server.close();
  }
});
