import { pluralizer } from './plural';

const plural = pluralizer('en');

export const en = {
  meta: {
    title: 'Skiplink — accessibility monitoring',
  },
  language: {
    label: 'Language',
  },
  layout: {
    skipToContent: 'Skip to content',
    mainNav: 'Main',
    sites: 'Sites',
  },
  sites: {
    title: 'Sites',
    addHeading: 'Add a site',
    nameLabel: 'Name',
    namePlaceholder: 'Client site',
    urlLabel: 'URL',
    urlHint: 'Pages come from sitemap.xml, or from links on the home page if there is none',
    submit: 'Add site',
    submitting: 'Adding…',
    fillBoth: 'Fill in both fields',
    loading: 'Loading sites…',
    empty: 'No sites yet. Add your first one above.',
    neverScanned: 'Never scanned',
  },
  site: {
    title: 'Scans',
    run: 'Run a scan',
    queueing: 'Queueing…',
    queued: 'Scan queued.',
    loading: 'Loading…',
    empty: 'No scans yet.',
    pagesScanned: (n: number) => `Pages scanned: ${n}`,
    pagesFailed: (n: number) => `, failed: ${n}`,
  },
  scan: {
    loading: 'Loading results…',
    notFound: 'Scan not found.',
    title: (date: string) => `Scan from ${date}`,
    running: 'Scan in progress, pages are being checked…',
    queued: 'Scan queued…',
    done: (pages: number) => `Done. Pages scanned: ${pages}.`,
    failed: (error: string) => `Scan failed: ${error}`,
    unknownError: 'unknown error',
    uniqueProblems: (n: number) => plural(n, { one: 'unique problem', other: 'unique problems' }),
    criticalFindings: (n: number) =>
      plural(n, { one: 'critical finding', other: 'critical findings' }),
    needHuman: (n: number) => plural(n, { one: 'needs a human', other: 'need a human' }),
    pages: (n: number) => plural(n, { one: 'page', other: 'pages' }),
    findingsHeading: 'Findings',
    loadingFindings: 'Loading findings…',
  },
  issues: {
    empty: 'No findings.',
    caption: 'Findings grouped by repeated markup, so one template mistake counts once.',
    rows: (n: number) => `${n} ${plural(n, { one: 'row', other: 'rows' })}.`,
    columns: {
      impact: 'Impact',
      problem: 'What is wrong',
      ruleId: 'Rule',
      pagesAffected: 'Pages',
    },
    sortedBy: {
      impact: 'impact',
      ruleId: 'rule',
      pagesAffected: 'pages',
    },
    sortAnnouncement: (column: string, ascending: boolean) =>
      `Table sorted by ${column}, ${ascending ? 'ascending' : 'descending'}`,
    sortAction: (ascending: boolean) => `sort ${ascending ? 'ascending' : 'descending'}`,
    showMarkup: 'Show markup',
    opensInNewTab: ' (opens in a new tab)',
  },
  impact: {
    critical: 'Critical',
    serious: 'Serious',
    moderate: 'Moderate',
    minor: 'Minor',
    needsReview: 'Needs review',
  },
  status: {
    queued: 'Queued',
    running: 'Scanning',
    done: 'Done',
    failed: 'Failed',
  },
};

export type Messages = typeof en;
