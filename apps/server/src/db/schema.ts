import {
  customType,
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

export const users = pgTable('users', {
  id: uuid('id').primaryKey().defaultRandom(),
  orgId: uuid('org_id')
    .notNull()
    .references(() => organizations.id, { onDelete: 'cascade' }),
  email: text('email').notNull().unique(),
  name: text('name'),
  passwordHash: text('password_hash'),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  lastLoginAt: timestamp('last_login_at', { withTimezone: true }),
});

export const sessions = pgTable(
  'sessions',
  {
    id: text('id').primaryKey(),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index('sessions_user_idx').on(t.userId)],
);

export const channelKind = pgEnum('channel_kind', ['slack', 'discord', 'ntfy', 'webhook', 'email']);

export const channels = pgTable(
  'notification_channels',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    orgId: uuid('org_id')
      .notNull()
      .references(() => organizations.id, { onDelete: 'cascade' }),
    kind: channelKind('kind').notNull(),
    target: text('target').notNull(),
    lastSentAt: timestamp('last_sent_at', { withTimezone: true }),
    lastError: text('last_error'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index('notification_channels_org_idx').on(t.orgId)],
);

export const scanSchedule = pgEnum('scan_schedule', ['off', 'daily', 'weekly']);

export const sites = pgTable(
  'sites',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    orgId: uuid('org_id')
      .notNull()
      .references(() => organizations.id, { onDelete: 'cascade' }),
    name: text('name').notNull(),
    url: text('url').notNull(),
    schedule: scanSchedule('schedule').notNull().default('weekly'),
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

const bytea = customType<{ data: Buffer }>({ dataType: () => 'bytea' });

export interface TabStop {
  label: string;
  selector: string;
  drawn: boolean;
}

export const tabOrders = pgTable('tab_orders', {
  pageId: uuid('page_id')
    .primaryKey()
    .references(() => pages.id, { onDelete: 'cascade' }),
  image: bytea('image').notNull(),
  width: integer('width').notNull(),
  height: integer('height').notNull(),
  stops: jsonb('stops').$type<TabStop[]>().notNull(),
});

export const issueKind = pgEnum('issue_kind', ['violation', 'incomplete', 'recommendation']);

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
    standards: jsonb('standards').$type<string[]>().notNull().default([]),
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

export type User = typeof users.$inferSelect;
export type Channel = typeof channels.$inferSelect;
export type ChannelKind = (typeof channelKind.enumValues)[number];
export type Site = typeof sites.$inferSelect;
export type ScanSchedule = (typeof scanSchedule.enumValues)[number];
export type Scan = typeof scans.$inferSelect;
export type Page = typeof pages.$inferSelect;
export type Issue = typeof issues.$inferSelect;
export type NewIssue = typeof issues.$inferInsert;
