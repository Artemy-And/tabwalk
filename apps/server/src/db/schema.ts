import {
  index,
  integer,
  jsonb,
  pgEnum,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from 'drizzle-orm/pg-core';

export const organizations = pgTable('organizations', {
  id: uuid('id').primaryKey().defaultRandom(),
  name: text('name').notNull(),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
});

export const sites = pgTable(
  'sites',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    orgId: uuid('org_id')
      .notNull()
      .references(() => organizations.id, { onDelete: 'cascade' }),
    name: text('name').notNull(),
    url: text('url').notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index('sites_org_idx').on(t.orgId)],
);

export const scanStatus = pgEnum('scan_status', ['queued', 'running', 'done', 'failed']);

export const scans = pgTable(
  'scans',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    siteId: uuid('site_id')
      .notNull()
      .references(() => sites.id, { onDelete: 'cascade' }),
    status: scanStatus('status').notNull().default('queued'),
    startedAt: timestamp('started_at', { withTimezone: true }),
    finishedAt: timestamp('finished_at', { withTimezone: true }),
    pagesScanned: integer('pages_scanned').notNull().default(0),
    pagesFailed: integer('pages_failed').notNull().default(0),
    error: text('error'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index('scans_site_created_idx').on(t.siteId, t.createdAt)],
);

export const pages = pgTable(
  'pages',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    scanId: uuid('scan_id')
      .notNull()
      .references(() => scans.id, { onDelete: 'cascade' }),
    url: text('url').notNull(),
    title: text('title'),
    error: text('error'),
    scannedAt: timestamp('scanned_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [uniqueIndex('pages_scan_url_idx').on(t.scanId, t.url)],
);

export const issueKind = pgEnum('issue_kind', ['violation', 'incomplete']);

export const issues = pgTable(
  'issues',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    scanId: uuid('scan_id')
      .notNull()
      .references(() => scans.id, { onDelete: 'cascade' }),
    pageId: uuid('page_id')
      .notNull()
      .references(() => pages.id, { onDelete: 'cascade' }),
    fingerprint: text('fingerprint').notNull(),
    kind: issueKind('kind').notNull(),
    checker: text('checker').notNull(),
    ruleId: text('rule_id').notNull(),
    impact: text('impact'),
    help: text('help').notNull(),
    helpUrl: text('help_url'),
    wcagTags: jsonb('wcag_tags').$type<string[]>().notNull().default([]),
    target: jsonb('target').$type<string[]>().notNull().default([]),
    html: text('html').notNull(),
    failureSummary: text('failure_summary'),
  },
  (t) => [
    index('issues_scan_idx').on(t.scanId),
    index('issues_scan_fingerprint_idx').on(t.scanId, t.fingerprint),
    index('issues_page_idx').on(t.pageId),
  ],
);

export type Site = typeof sites.$inferSelect;
export type Scan = typeof scans.$inferSelect;
export type Page = typeof pages.$inferSelect;
export type Issue = typeof issues.$inferSelect;
export type NewIssue = typeof issues.$inferInsert;
