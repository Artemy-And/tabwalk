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

export const POLL_INTERVAL_MS = 3000;

export function isScanActive(status: ScanStatus | null | undefined): boolean {
  return status === 'queued' || status === 'running';
}

export type IssueKind = 'violation' | 'incomplete' | 'recommendation';
export type Impact = 'critical' | 'serious' | 'moderate' | 'minor' | null;

export type ScanSchedule = 'off' | 'daily' | 'weekly';

export const SCHEDULES: ScanSchedule[] = ['weekly', 'daily', 'off'];

export interface SiteRow {
  id: string;
  name: string;
  url: string;
  schedule: ScanSchedule;
  createdAt: string;
  lastScanId: string | null;
  lastScanStatus: ScanStatus | null;
  lastScanAt: string | null;
  lastDoneScanId: string | null;
  summary: ScanSummary | null;
  trend: number[];
}

export interface Site {
  id: string;
  name: string;
  url: string;
  schedule: ScanSchedule;
  createdAt: string;
}

export interface SiteDetail extends Site {
  nextScanAt: string | null;
}

export interface ScanSummary {
  uniqueProblems: number;
  critical: number;
  serious: number;
  incomplete: number;
  recommendations: number;
  elements: number;
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

export type ScanRow = Scan & ScanSummary;

export interface ScanDetail extends Scan {
  site: Pick<Site, 'id' | 'name' | 'url'> | null;
  pages: number;
  summary: ScanSummary;
  comparison: { previousScanId: string; new: number; fixed: number } | null;
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
  standards: string[];
  occurrences: number;
  pagesAffected: number;
  sampleHtml: string;
  sampleTarget: string;
  sampleSummary: string | null;
  isNew?: boolean;
}

export interface PageRow {
  id: string;
  url: string;
  title: string | null;
  error: string | null;
  problems: number;
  tabStops: number | null;
}

export interface TabStop {
  label: string;
  selector: string;
  drawn: boolean;
}

export interface PageDetail {
  id: string;
  url: string;
  title: string | null;
  error: string | null;
  scan: { id: string; createdAt: string };
  site: { id: string; name: string };
  tabOrder: { width: number; height: number; stops: TabStop[] } | null;
}

export const api = {
  listSites: () => request<SiteRow[]>('/sites'),
  createSite: (body: { name: string; url: string; schedule: ScanSchedule }) =>
    request<Site>('/sites', { method: 'POST', body: JSON.stringify(body) }),
  getSite: (id: string) => request<SiteDetail>(`/sites/${id}`),
  setSchedule: (id: string, schedule: ScanSchedule) =>
    request<SiteDetail>(`/sites/${id}`, { method: 'PATCH', body: JSON.stringify({ schedule }) }),
  deleteSite: (id: string) => request<undefined>(`/sites/${id}`, { method: 'DELETE' }),
  listScans: (siteId: string) => request<ScanRow[]>(`/sites/${siteId}/scans`),
  startScan: (siteId: string) => request<Scan>(`/sites/${siteId}/scans`, { method: 'POST' }),
  getScan: (id: string) => request<ScanDetail>(`/scans/${id}`),
  listIssues: (scanId: string) => request<IssueGroup[]>(`/scans/${scanId}/issues`),
  listFixed: (scanId: string) => request<IssueGroup[]>(`/scans/${scanId}/fixed`),
  issuesCsvUrl: (scanId: string) => `${BASE}/scans/${scanId}/issues.csv`,
  listPages: (scanId: string) => request<PageRow[]>(`/scans/${scanId}/pages`),
  getPage: (id: string) => request<PageDetail>(`/pages/${id}`),
  tabOrderUrl: (pageId: string) => `${BASE}/pages/${pageId}/tab-order.webp`,
};
