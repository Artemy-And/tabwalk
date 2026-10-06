import { readFile } from 'node:fs/promises';

export class GitHubError extends Error {
  constructor(readonly status: number) {
    super(`GitHub answered HTTP ${status}`);
  }
}

// the pull request a run is for, from the event GitHub writes to disk; null for a push
export async function pullRequestNumber(eventPath: string | undefined): Promise<number | null> {
  if (!eventPath) return null;
  try {
    const event = JSON.parse(await readFile(eventPath, 'utf8')) as {
      pull_request?: { number?: unknown };
    };
    const number = event.pull_request?.number;
    return typeof number === 'number' ? number : null;
  } catch {
    return null;
  }
}

export interface PullRequest {
  apiUrl: string;
  repository: string;
  number: number;
  token: string;
}

// the marker a comment starts with, one per site, so two checks in a workflow keep two comments
export const commentMarker = (siteUrl: string) => `<!-- tabwalk ${encodeURI(siteUrl)} -->`;

// one comment per site, edited on every run instead of a new one each push
export async function upsertComment(
  pr: PullRequest,
  marker: string,
  body: string,
  request: typeof fetch = fetch,
): Promise<'created' | 'updated'> {
  const issue = `${pr.apiUrl}/repos/${pr.repository}/issues`;
  const headers = {
    accept: 'application/vnd.github+json',
    authorization: `Bearer ${pr.token}`,
    'content-type': 'application/json',
    'user-agent': 'tabwalk-action',
    'x-github-api-version': '2022-11-28',
  };

  let existing: number | undefined;
  for (let page = 1; page <= 30 && existing === undefined; page += 1) {
    const res = await request(`${issue}/${pr.number}/comments?per_page=100&page=${page}`, {
      headers,
    });
    if (!res.ok) throw new GitHubError(res.status);
    const comments = (await res.json()) as { id: number; body?: string }[];
    existing = comments.find((c) => c.body?.startsWith(marker))?.id;
    if (comments.length < 100) break;
  }

  const content = JSON.stringify({ body: `${marker}\n${body}` });
  const res =
    existing === undefined
      ? await request(`${issue}/${pr.number}/comments`, { method: 'POST', headers, body: content })
      : await request(`${issue}/comments/${existing}`, { method: 'PATCH', headers, body: content });
  if (!res.ok) throw new GitHubError(res.status);
  return existing === undefined ? 'created' : 'updated';
}
