import { pluralizer } from './plural';

const plural = pluralizer('en');

export const en = {
  meta: {
    title: 'Tabwalk — accessibility monitoring',
  },
  language: {
    label: 'Language',
  },
  layout: {
    skipToContent: 'Skip to content',
    mainNav: 'Main',
    breadcrumb: 'Breadcrumb',
    sites: 'Sites',
  },
  sites: {
    title: 'Sites',
    subtitle: (n: number) => `${n} ${plural(n, { one: 'site', other: 'sites' })}`,
    add: 'Add site',
    addHeading: 'Add a site',
    nameLabel: 'Name',
    namePlaceholder: 'Client site',
    urlLabel: 'URL',
    urlHint: 'Pages come from sitemap.xml, or from links on the home page if there is none',
    submit: 'Add site',
    submitting: 'Adding…',
    fillBoth: 'Fill in both fields',
    loading: 'Loading sites…',
    empty: 'No sites yet. Add the first one, then run a scan from its page.',
    caption: 'Client sites, most recently scanned first',
    columns: {
      site: 'Site',
      lastScan: 'Last scan',
      schedule: 'Auto scans',
      problems: 'Problems',
      needsHuman: 'Needs a human',
      trend: 'Recent scans',
    },
    neverScanned: 'Never scanned',
    noProblems: 'No problems found',
    critical: (n: number) => `${n} critical`,
    serious: (n: number) => `${n} serious`,
    minorOnly: 'minor only',
    total: (n: number) => `${n} total`,
    trendLabel: (from: number, to: number, scans: number) =>
      `Problems went from ${from} to ${to} over the last ${scans} scans`,
    trendEmpty: 'Not enough scans',
    disclaimer:
      'Automated checks catch part of what WCAG asks for. Everything a machine cannot judge is ' +
      'marked “Needs review”. Tabwalk never calls a site compliant.',
  },
  site: {
    run: 'Run a scan',
    queueing: 'Queueing…',
    queued: 'Scan queued.',
    loading: 'Loading…',
    notFound: 'Site not found.',
    empty: 'No scans yet. Run the first one to see what is broken.',
    caption: 'Scan history, newest first',
    columns: {
      date: 'Scan',
      pages: 'Pages',
      problems: 'Problems',
      needsHuman: 'Needs a human',
    },
    pagesFailed: (n: number) => `(${n} failed)`,
  },
  schedule: {
    label: 'Automatic scans',
    options: {
      weekly: 'Weekly',
      daily: 'Daily',
      off: 'Off',
    },
    next: (date: string) => `Next scan ${date}`,
    soon: 'Next scan within 15 minutes',
    manual: 'Scans run only when you start one',
    saving: 'Saving…',
    saved: 'Saved.',
  },
  scan: {
    loading: 'Loading results…',
    notFound: 'Scan not found.',
    unknownSite: 'Deleted site',
    finished: (date: string, pages: number) =>
      `Scan finished ${date} · ${pages} ${plural(pages, { one: 'page', other: 'pages' })}`,
    running: 'Scan in progress, pages are being checked…',
    queued: 'Scan queued…',
    failed: (error: string) => `Scan failed: ${error}`,
    unknownError: 'unknown error',
    uniqueProblems: (n: number) => plural(n, { one: 'unique problem', other: 'unique problems' }),
    criticalFindings: (n: number) => plural(n, { other: 'critical' }),
    needHuman: (n: number) => plural(n, { one: 'needs a human', other: 'need a human' }),
    elements: (n: number) =>
      `on ${n.toLocaleString('en')} ${plural(n, { one: 'element', other: 'elements' })}`,
    pages: (n: number) => plural(n, { one: 'page checked', other: 'pages checked' }),
    findingsHeading: 'Findings',
    loadingFindings: 'Loading findings…',
    exportCsv: 'Export CSV',
    filters: {
      label: 'Show',
      all: 'All',
      critical: 'Critical',
      review: 'Needs a human',
      new: 'New since last scan',
      fixed: 'Fixed',
      recommendations: 'Recommendations',
    },
  },
  pages: {
    heading: 'Pages',
    caption: 'Pages checked in this scan. Open one to see its tab order.',
    loading: 'Loading pages…',
    columns: {
      page: 'Page',
      problems: 'Problems',
      tabStops: 'Tab stops',
    },
    failed: (error: string) => `Could not check: ${error}`,
  },
  page: {
    loading: 'Loading the page…',
    notFound: 'Page not found.',
    tabOrder: 'Tab order',
    tabOrderIntro: (n: number) =>
      `${n} ${plural(n, { one: 'tab stop', other: 'tab stops' })}. Each number shows where focus lands when you press Tab, starting from the top of the page.`,
    pictureAlt: (n: number) =>
      `The page with its ${n} ${plural(n, { one: 'tab stop', other: 'tab stops' })} numbered in order. The same stops are listed below.`,
    listHeading: 'Tab stops in order',
    unnamed: 'no text',
    notDrawn: 'not in the picture',
    noPicture:
      'There is no tab order picture for this page. Pictures are kept for the latest scan of each site.',
  },
  issues: {
    empty: 'No findings.',
    emptyFilter: 'Nothing matches this filter.',
    caption: 'Findings grouped by repeated markup, so one template mistake counts once.',
    fixedCaption: 'Found in the previous scan and gone in this one.',
    recommendationsCaption:
      'Good practice beyond WCAG. Not counted as problems and never fail a check.',
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
    newTag: 'New',
    fixedNote: 'Not found in this scan',
  },
  impact: {
    critical: 'Critical',
    serious: 'Serious',
    moderate: 'Moderate',
    minor: 'Minor',
    needsReview: 'Needs review',
    recommendation: 'Recommendation',
  },
  status: {
    queued: 'Queued',
    running: 'Scanning',
    done: 'Done',
    failed: 'Failed',
  },
  rules: {
    'keyboard-trap': 'Keyboard focus must not get stuck in one part of the page',
    'focus-visible': 'Keyboard focus must be visible',
    'focus-obscured': 'Focused elements must not be hidden under other content',
    'skip-link-target': 'Skip links must move keyboard focus past the repeated content',
  },
};

export type Messages = typeof en;
