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

export interface Checker {
  readonly name: string;
  run(page: Page): Promise<CheckFinding[]>;
}
