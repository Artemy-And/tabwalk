import AxeBuilder from '@axe-core/playwright';
import type { Page } from 'playwright';
import type { Checker, CheckFinding } from '../types.js';

const TAGS = ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa'];

type AxeNode = {
  html: string;
  target: unknown[];
  failureSummary?: string;
};

type AxeResult = {
  id: string;
  impact?: string | null;
  help: string;
  helpUrl?: string;
  tags: string[];
  nodes: AxeNode[];
};

function toFindings(results: AxeResult[], kind: CheckFinding['kind']): CheckFinding[] {
  const out: CheckFinding[] = [];

  for (const rule of results) {
    for (const node of rule.nodes) {
      out.push({
        kind,
        ruleId: rule.id,
        impact: rule.impact ?? null,
        help: rule.help,
        helpUrl: rule.helpUrl ?? null,
        wcagTags: rule.tags.filter((t) => t.startsWith('wcag')),
        target: node.target.map((t) => String(t)),
        html: node.html,
        failureSummary: node.failureSummary ?? null,
      });
    }
  }

  return out;
}

export const axeChecker: Checker = {
  name: 'axe-core',

  async run(page: Page): Promise<CheckFinding[]> {
    const results = await new AxeBuilder({ page }).withTags(TAGS).analyze();

    return [
      ...toFindings(results.violations as unknown as AxeResult[], 'violation'),
      ...toFindings(results.incomplete as unknown as AxeResult[], 'incomplete'),
    ];
  },
};
