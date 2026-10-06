import type { Page } from 'playwright';

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

export interface CheckOptions {
  // problems inside elements that match these CSS selectors are left out
  ignoreSelectors?: string[];
}

export interface Checker {
  readonly name: string;
  run(page: Page, options?: CheckOptions): Promise<CheckFinding[]>;
}
