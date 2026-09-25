const BASE = import.meta.env.VITE_API_URL ?? '/api';

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const headers = new Headers(init?.headers);
  if (!headers.has('content-type')) headers.set('content-type', 'application/json');

  const res = await fetch(`${BASE}${path}`, { ...init, headers });

  if (!res.ok) {
    let message = `Request failed (${res.status})`;
    try {
      const body = (await res.json()) as { error?: string };
      if (body.error) message = body.error;
    } catch {
      // ignore
    }
    throw new Error(message);
  }

  if (res.status === 204) return undefined as T;
  return (await res.json()) as T;
}

export type ScanStatus = 'queued' | 'running' | 'done' | 'failed';
export type IssueKind = 'violation' | 'incomplete';
export type Impact = 'critical' | 'serious' | 'moderate' | 'minor' | null;

export interface SiteRow {
  id: string;
  name: string;
  url: string;
  createdAt: string;
  lastScanId: string | null;
  lastScanStatus: ScanStatus | null;
  lastScanAt: string | null;
}

export interface Scan {
  id: string;
  siteId: string;
  status: ScanStatus;
  startedAt: string | null;
  finishedAt: string | null;
  pagesScanned: number;
  pagesFailed: number;
  error: string | null;
  createdAt: string;
}

export interface ScanDetail extends Scan {
  pages: number;
  summary: {
    violations: number;
    incomplete: number;
    critical: number;
    serious: number;
    uniqueProblems: number;
  };
}

export interface IssueGroup {
  fingerprint: string;
  kind: IssueKind;
  checker: string;
  ruleId: string;
  impact: Impact;
  help: string;
  helpUrl: string | null;
  wcagTags: string[];
  occurrences: number;
  pagesAffected: number;
  sampleHtml: string;
  sampleTarget: string;
  sampleSummary: string | null;
}

export const api = {
  listSites: () => request<SiteRow[]>('/sites'),
  createSite: (body: { name: string; url: string }) =>
    request<SiteRow>('/sites', { method: 'POST', body: JSON.stringify(body) }),
  deleteSite: (id: string) => request<undefined>(`/sites/${id}`, { method: 'DELETE' }),
  listScans: (siteId: string) => request<Scan[]>(`/sites/${siteId}/scans`),
  startScan: (siteId: string) => request<Scan>(`/sites/${siteId}/scans`, { method: 'POST' }),
  getScan: (id: string) => request<ScanDetail>(`/scans/${id}`),
  listIssues: (scanId: string) => request<IssueGroup[]>(`/scans/${scanId}/issues`),
};
