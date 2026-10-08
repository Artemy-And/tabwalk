const BASE = import.meta.env.VITE_API_URL ?? '/api';

export class ApiError extends Error {
  constructor(
    message: string,
    readonly status: number,
  ) {
    super(message);
  }
}

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
    throw new ApiError(message, res.status);
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
  maxPages: number | null;
  crawlInclude: string[];
  crawlExclude: string[];
  ignoreRules: string[];
  ignoreSelectors: string[];
  login: LoginSummary | null;
  scenarios: SiteScenario[];
  environments: ExtraEnvironment[];
  createdAt: string;
}

// what kind of login a site has; the secrets themselves never come back
export interface LoginSummary {
  username: string | null;
  hasPassword: boolean;
  headers: string[];
  cookies: string[];
}

export interface LoginInput {
  username?: string;
  password?: string;
  headers?: { name: string; value: string }[];
  cookies?: { name: string; value: string }[];
}

export interface SiteDetail extends Site {
  nextScanAt: string | null;
  // MAX_PAGES_PER_SCAN: the default page limit and the highest a site can set
  pageCap: number;
}

export type SiteUpdate = Partial<
  Pick<
    Site,
    | 'schedule'
    | 'maxPages'
    | 'crawlInclude'
    | 'crawlExclude'
    | 'ignoreRules'
    | 'ignoreSelectors'
    | 'scenarios'
    | 'environments'
  >
> & { login?: LoginInput | null };

export type ScenarioStep =
  | { action: 'click'; selector: string }
  | { action: 'fill'; selector: string; value: string }
  | { action: 'press'; key: string }
  | { action: 'waitFor'; selector: string; state: 'visible' | 'hidden' }
  | { action: 'expectFocus'; selector: string };

export interface SiteScenario {
  name: string;
  path: string;
  steps: ScenarioStep[];
}

// Fill values stay in site settings and are never returned in run evidence.
export type ScenarioStepEvidence = (
  | Exclude<ScenarioStep, { action: 'fill' }>
  | { action: 'fill'; selector: string }
) & { status: 'completed' | 'failed'; actualFocus?: string | null };

export interface ScenarioRun {
  name: string;
  path: string;
  status: 'completed' | 'failed';
  steps: ScenarioStepEvidence[];
  error: string | null;
}

export interface StoredScenarioRun extends ScenarioRun {
  environment?: EnvironmentId;
  keyboardCoverage: KeyboardCoverage | null;
  findings: number;
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
  environments: ScanEnvironment[] | null;
  id: string;
  siteId: string;
  status: ScanStatus;
  startedAt: string | null;
  finishedAt: string | null;
  pagesScanned: number;
  pagesFailed: number;
  error: string | null;
  // what the site told the scan to leave out; null for scans from before 0.4
  ignored: { rules: string[]; selectors: string[] } | null;
  scenarioSummary: {
    completed: number;
    failed: number;
    unmatched: { name: string; path: string }[];
  } | null;
  createdAt: string;
}

export type ScanRow = Scan & ScanSummary;

export interface ScanDetail extends Scan {
  site: Pick<Site, 'id' | 'name' | 'url'> | null;
  pages: number;
  summary: ScanSummary;
  comparison: { previousScanId: string; new: number; fixed: number } | null;
  manualSummary: ManualSummary;
}

export type ReviewStatus = 'confirmed' | 'acceptable' | 'not_applicable';

export interface FindingReview {
  status: ReviewStatus;
  note: string | null;
  by: string;
  reviewedAt: string;
}

export interface ManualSummary {
  total: number;
  pending: number;
  confirmed: number;
  acceptable: number;
  notApplicable: number;
}

export interface IssueGroup {
  environments?: ScanEnvironment[];
  shotContext?: { url: string; environment: ScanEnvironment; scenario: string | null } | null;
  review?: FindingReview | null;
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
  firstSeenAt?: string;
  dismissal?: Dismissal | null;
  // whether the scan kept a picture of the first element with this problem
  shot?: boolean;
  scenarios?: {
    name: string;
    path: string;
    steps: ScenarioStepEvidence[];
    url: string;
    environment?: EnvironmentId;
  }[];
}

export type DismissalReason = 'false_positive' | 'wont_fix';

export const DISMISSAL_REASONS: DismissalReason[] = ['false_positive', 'wont_fix'];

export interface Dismissal {
  reason: DismissalReason;
  note: string | null;
  createdAt: string;
  // the email of whoever dismissed it, if that account still exists
  by: string | null;
}

export type KeyboardCoverageReason =
  | 'time-limit'
  | 'step-limit'
  | 'keyboard-trap'
  | 'dialog-blocked'
  | 'frame-limit'
  | 'frame-content'
  | 'focus-limit'
  | 'focus-unavailable'
  | 'unreached-stops'
  | 'error';

// Describes this bounded walk, not a percentage of WCAG or every possible page state.
export interface KeyboardCoverage {
  status: 'completed' | 'partial';
  reasons: KeyboardCoverageReason[];
  visitedStops: number;
  forwardSteps: number;
  backwardSteps: number;
  focusChecks: number;
  focusStylesTested: number;
  focusStylesSkipped: number;
  elapsedMs: number;
  limits: { timeMs: number; stepsPerDirection: number; focusChecks: number };
}

export interface PageRow {
  environmentRuns: EnvironmentRun[];
  id: string;
  url: string;
  title: string | null;
  error: string | null;
  problems: number;
  tabStops: number | null;
  keyboardCoverage: KeyboardCoverage | null;
  scenarioRuns: StoredScenarioRun[];
}

export interface TabStop {
  label: string;
  selector: string;
  drawn: boolean;
}

export interface PageDetail {
  environmentRuns: EnvironmentRun[];
  id: string;
  url: string;
  title: string | null;
  error: string | null;
  scan: { id: string; createdAt: string };
  site: { id: string; name: string };
  tabOrder: { width: number; height: number; stops: TabStop[] } | null;
  keyboardCoverage: KeyboardCoverage | null;
  scenarioRuns: StoredScenarioRun[];
}

export type ChannelKind = 'slack' | 'discord' | 'ntfy' | 'webhook' | 'email';

export type ExtraEnvironment = 'mobile' | 'zoom-200' | 'forced-colors';
export type EnvironmentId = 'desktop' | ExtraEnvironment;
export interface ScanEnvironment {
  id: EnvironmentId;
  viewport: { width: number; height: number };
  deviceScaleFactor: number;
  forcedColors: 'active' | 'none';
}
export interface EnvironmentRun {
  environment: ScanEnvironment;
  status: 'completed' | 'failed';
  error: string | null;
  elapsedMs: number;
  findings: number;
  keyboardCoverage: KeyboardCoverage | null;
  scenarioRuns: StoredScenarioRun[];
}

export const CHANNEL_KINDS: ChannelKind[] = ['slack', 'discord', 'ntfy', 'webhook', 'email'];

export interface Channel {
  id: string;
  kind: ChannelKind;
  target: string;
  lastSentAt: string | null;
  lastError: string | null;
}

export interface Notifications {
  email: boolean;
  links: boolean;
  channels: Channel[];
}

export interface AuthConfig {
  setup: boolean;
  sso: { label: string } | null;
}

export interface Me {
  email: string;
  name: string | null;
  hasPassword: boolean;
}

const post = (path: string, body: unknown) =>
  request<unknown>(path, { method: 'POST', body: JSON.stringify(body) });

export const api = {
  authConfig: () => request<AuthConfig>('/auth/config'),
  me: () => request<Me>('/auth/me'),
  setup: (body: { email: string; password: string }) => post('/auth/setup', body),
  login: (body: { email: string; password: string }) => post('/auth/login', body),
  logout: () => post('/auth/logout', {}),
  changePassword: (body: { current: string; password: string }) => post('/auth/password', body),
  ssoUrl: `${BASE}/auth/oidc/start`,
  notifications: () => request<Notifications>('/notifications'),
  addChannel: (body: { kind: ChannelKind; target: string }) =>
    request<Channel>('/notifications', { method: 'POST', body: JSON.stringify(body) }),
  removeChannel: (id: string) => request<undefined>(`/notifications/${id}`, { method: 'DELETE' }),
  testChannel: (id: string) => request<Channel>(`/notifications/${id}/test`, { method: 'POST' }),

  listSites: () => request<SiteRow[]>('/sites'),
  createSite: (body: { name: string; url: string; schedule: ScanSchedule }) =>
    request<Site>('/sites', { method: 'POST', body: JSON.stringify(body) }),
  getSite: (id: string) => request<SiteDetail>(`/sites/${id}`),
  updateSite: (id: string, body: SiteUpdate) =>
    request<SiteDetail>(`/sites/${id}`, { method: 'PATCH', body: JSON.stringify(body) }),
  deleteSite: (id: string) => request<undefined>(`/sites/${id}`, { method: 'DELETE' }),
  dismiss: (
    siteId: string,
    body: { fingerprint: string; reason: DismissalReason; note?: string },
  ) =>
    request<unknown>(`/sites/${siteId}/dismissals`, { method: 'PUT', body: JSON.stringify(body) }),
  reopen: (siteId: string, fingerprint: string) =>
    request<undefined>(`/sites/${siteId}/dismissals/${encodeURIComponent(fingerprint)}`, {
      method: 'DELETE',
    }),
  listScans: (siteId: string) => request<ScanRow[]>(`/sites/${siteId}/scans`),
  startScan: (siteId: string) => request<Scan>(`/sites/${siteId}/scans`, { method: 'POST' }),
  getScan: (id: string) => request<ScanDetail>(`/scans/${id}`),
  reviewFinding: (
    scanId: string,
    body: { fingerprint: string; status: ReviewStatus; note?: string },
  ) =>
    request<FindingReview>(`/scans/${scanId}/reviews`, {
      method: 'PUT',
      body: JSON.stringify(body),
    }),
  resetReview: (scanId: string, fingerprint: string) =>
    request<undefined>(`/scans/${scanId}/reviews/${encodeURIComponent(fingerprint)}`, {
      method: 'DELETE',
    }),
  listIssues: (scanId: string) => request<IssueGroup[]>(`/scans/${scanId}/issues`),
  listFixed: (scanId: string) => request<IssueGroup[]>(`/scans/${scanId}/fixed`),
  issuesCsvUrl: (scanId: string) => `${BASE}/scans/${scanId}/issues.csv`,
  listPages: (scanId: string) => request<PageRow[]>(`/scans/${scanId}/pages`),
  getPage: (id: string) => request<PageDetail>(`/pages/${id}`),
  tabOrderUrl: (pageId: string) => `${BASE}/pages/${pageId}/tab-order.webp`,
  shotUrl: (scanId: string, fingerprint: string) =>
    `${BASE}/scans/${scanId}/shots/${encodeURIComponent(fingerprint)}`,
};
