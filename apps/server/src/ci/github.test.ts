import assert from 'node:assert/strict';
import { mkdtemp, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { test } from 'node:test';
import { commentMarker, GitHubError, pullRequestNumber, upsertComment } from './github.js';

const pr = { apiUrl: 'https://api.github.test', repository: 'o/r', number: 7, token: 'secret' };
const marker = commentMarker('https://example.com/');

// a GitHub that holds the comments of one pull request
function fakeGitHub(comments: { id: number; body: string }[], status = 200) {
  const calls: { method: string; url: string; body?: string; auth?: string }[] = [];
  const request = (async (url: string, init: RequestInit = {}) => {
    const method = init.method ?? 'GET';
    const headers = init.headers as Record<string, string>;
    calls.push({ method, url, body: init.body as string | undefined, auth: headers.authorization });
    if (status !== 200) return new Response('{}', { status });
    if (method === 'GET') {
      const page = Number(new URL(url).searchParams.get('page'));
      return Response.json(comments.slice((page - 1) * 100, page * 100));
    }
    return Response.json({ id: 1 }, { status: method === 'POST' ? 201 : 200 });
  }) as typeof fetch;
  return { calls, request };
}

test('the first run comments, the next ones edit that comment', async () => {
  const empty = fakeGitHub([{ id: 1, body: 'Looks good to me' }]);
  assert.equal(await upsertComment(pr, marker, 'Report', empty.request), 'created');
  const post = empty.calls.at(-1);
  assert.equal(post?.method, 'POST');
  assert.equal(post?.url, 'https://api.github.test/repos/o/r/issues/7/comments');
  assert.equal(post?.auth, 'Bearer secret');
  assert.equal(JSON.parse(post?.body ?? '{}').body, `${marker}\nReport`);

  // past the first page of comments, and not someone quoting it
  const busy = [
    ...Array.from({ length: 100 }, (_, i) => ({ id: i + 10, body: `> ${marker}` })),
    { id: 500, body: `${marker}\nOld report` },
  ];
  const later = fakeGitHub(busy);
  assert.equal(await upsertComment(pr, marker, 'New report', later.request), 'updated');
  const patch = later.calls.at(-1);
  assert.equal(patch?.method, 'PATCH');
  assert.equal(patch?.url, 'https://api.github.test/repos/o/r/issues/comments/500');
});

test('each site keeps its own comment', async () => {
  const other = commentMarker('https://other.example/');
  const github = fakeGitHub([{ id: 3, body: `${other}\nOther site` }]);
  assert.equal(await upsertComment(pr, marker, 'Report', github.request), 'created');
  assert.notEqual(marker, other);
});

test('a refusal comes back with its status', async () => {
  const github = fakeGitHub([], 403);
  await assert.rejects(
    upsertComment(pr, marker, 'Report', github.request),
    (err) => err instanceof GitHubError && err.status === 403 && !err.message.includes('secret'),
  );
});

test('the pull request number comes from the event file', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'tabwalk-event-'));
  const event = join(dir, 'event.json');
  await writeFile(event, JSON.stringify({ pull_request: { number: 42 } }));
  assert.equal(await pullRequestNumber(event), 42);
  await writeFile(event, JSON.stringify({ ref: 'refs/heads/main' }));
  assert.equal(await pullRequestNumber(event), null);
  assert.equal(await pullRequestNumber(undefined), null);
  assert.equal(await pullRequestNumber(join(dir, 'missing.json')), null);
});
