import AxeBuilder from '@axe-core/playwright';
import type { Page } from 'playwright';
import type { Checker, CheckFinding, CheckOptions } from '../types.js';

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

function standardsOf(tags: string[]): string[] {
  const own = tags.filter((t) => /^(EN-9\.|RGAA-\d)/.test(t));
  return tags.includes('wcag2a') || tags.includes('wcag2aa') ? [...own, 'section508'] : own;
}

function isWcag(rule: AxeResult): boolean {
  return rule.tags.some((t) => TAGS.includes(t));
}

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
        standards: standardsOf(rule.tags),
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

  async run(page: Page, options: CheckOptions = {}): Promise<CheckFinding[]> {
    const builder = new AxeBuilder({ page }).withTags([...TAGS, 'best-practice']);
    // axe gives up on the whole page when one selector does not parse
    const selectors = await page.evaluate(
      (list) =>
        list.filter((selector) => {
          try {
            document.querySelector(selector);
            return true;
          } catch {
            return false;
          }
        }),
      options.ignoreSelectors ?? [],
    );
    for (const selector of selectors) builder.exclude(selector);
    // the colors on screen are the reader's own then; the site's contrast is checked without them
    if (options.forcedColors) builder.disableRules(['color-contrast', 'link-in-text-block']);
    const results = await builder.analyze();

    const violations = results.violations as unknown as AxeResult[];
    const incomplete = results.incomplete as unknown as AxeResult[];

    return [
      ...toFindings(violations.filter(isWcag), 'violation'),
      ...toFindings(incomplete.filter(isWcag), 'incomplete'),
      ...toFindings(
        violations.filter((rule) => !isWcag(rule)),
        'recommendation',
      ),
    ];
  },
};
