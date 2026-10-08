import type { Page } from 'playwright';
import type { ScenarioRun, ScenarioStepEvidence } from './scenarios.js';

export interface CheckFinding {
  kind: 'violation' | 'incomplete' | 'recommendation';
  ruleId: string;
  impact: string | null;
  help: string;
  helpUrl: string | null;
  wcagTags: string[];
  standards: string[];
  target: string[];
  html: string;
  failureSummary: string | null;
}

// how a scan gets past a login; every secret goes only to the site's own address
export interface SiteLogin {
  // HTTP Basic auth, which most staging sites use
  username?: string;
  password?: string;
  // sent with every request to the site, like Authorization: Bearer …
  headers?: { name: string; value: string }[];
  // set before the first page opens, like a session cookie copied from a browser
  cookies?: { name: string; value: string }[];
}

// the headers a plain fetch needs to read the site the way the browser does
export function loginHeaders(login: SiteLogin | null | undefined): Record<string, string> {
  if (!login) return {};
  const headers: Record<string, string> = {};
  if (login.username) {
    const pair = `${login.username}:${login.password ?? ''}`;
    headers.authorization = `Basic ${Buffer.from(pair).toString('base64')}`;
  }
  for (const { name, value } of login.headers ?? []) headers[name.toLowerCase()] = value;
  if (login.cookies?.length) {
    headers.cookie = login.cookies.map(({ name, value }) => `${name}=${value}`).join('; ');
  }
  return headers;
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

export interface CheckOptions {
  // problems inside elements that match these CSS selectors are left out
  ignoreSelectors?: string[];
  onKeyboardCoverage?: (coverage: KeyboardCoverage) => void;
}

export interface ScenarioEvidence {
  name: string;
  path: string;
  steps: ScenarioStepEvidence[];
}

export interface StoredScenarioRun extends ScenarioRun {
  keyboardCoverage: KeyboardCoverage | null;
  findings: number;
}

export interface ScenarioSummary {
  completed: number;
  failed: number;
  unmatched: { name: string; path: string }[];
}

export interface Checker {
  readonly name: string;
  run(page: Page, options?: CheckOptions): Promise<CheckFinding[]>;
}
