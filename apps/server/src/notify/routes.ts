import { zValidator } from '@hono/zod-validator';
import { and, asc, eq } from 'drizzle-orm';
import { Hono } from 'hono';
import { z } from 'zod';
import { json } from '../api/validate.js';
import type { AuthEnv } from '../auth/session.js';
import { db } from '../db/index.js';
import { type Channel, channels } from '../db/schema.js';
import { env } from '../env.js';
import type { ScanNews } from './message.js';
import { deliver, emailReady } from './send.js';

const idParam = z.object({ id: z.string().uuid() });

const webAddress = z
  .string()
  .trim()
  .url('Enter the full address, starting with https://')
  .refine((value) => /^https?:\/\//i.test(value), 'Use an http or https address');

const channelBody = z.discriminatedUnion('kind', [
  z.object({
    kind: z.literal('email'),
    target: z.string().trim().toLowerCase().email('Enter a valid email address'),
  }),
  z.object({
    kind: z.literal('ntfy'),
    target: webAddress.refine(
      (value) => new URL(value).pathname.split('/').some(Boolean),
      'Add the topic to the address, like https://ntfy.sh/my-topic',
    ),
  }),
  z.object({ kind: z.enum(['slack', 'discord', 'webhook']), target: webAddress }),
]);

// webhook addresses work like passwords, so the dashboard only sees their ends
function view(channel: Channel) {
  let shown = channel.target;
  if (channel.kind !== 'email') {
    const url = new URL(channel.target);
    shown = `${url.host}/…${channel.target.slice(-4)}`;
  }
  return {
    id: channel.id,
    kind: channel.kind,
    target: shown,
    lastSentAt: channel.lastSentAt,
    lastError: channel.lastError,
  };
}

function testNews(): ScanNews {
  return {
    siteName: 'Tabwalk',
    siteUrl: env.PUBLIC_URL ?? '',
    reportUrl: env.PUBLIC_URL ?? null,
    first: false,
    error: null,
    problems: 0,
    critical: 0,
    newProblems: [],
    fixed: 0,
    test: true,
  };
}

export const notificationRoutes = new Hono<AuthEnv>()
  .get('/', async (c) => {
    const rows = await db
      .select()
      .from(channels)
      .where(eq(channels.orgId, c.get('user').orgId))
      .orderBy(asc(channels.createdAt));
    return c.json({
      email: emailReady(),
      links: Boolean(env.PUBLIC_URL),
      channels: rows.map(view),
    });
  })

  .post('/', json(channelBody), async (c) => {
    const body = c.req.valid('json');
    if (body.kind === 'email' && !emailReady()) {
      return c.json({ error: 'Email is not set up: add SMTP_URL to .env' }, 400);
    }
    const [created] = await db
      .insert(channels)
      .values({ orgId: c.get('user').orgId, ...body })
      .returning();
    if (!created) return c.json({ error: 'Could not save the channel' }, 500);
    return c.json(view(created), 201);
  })

  .delete('/:id', zValidator('param', idParam), async (c) => {
    await db
      .delete(channels)
      .where(
        and(eq(channels.id, c.req.valid('param').id), eq(channels.orgId, c.get('user').orgId)),
      );
    return c.body(null, 204);
  })

  .post('/:id/test', zValidator('param', idParam), async (c) => {
    const channel = await db.query.channels.findFirst({
      where: and(eq(channels.id, c.req.valid('param').id), eq(channels.orgId, c.get('user').orgId)),
    });
    if (!channel) return c.json({ error: 'Channel not found' }, 404);
    try {
      await deliver(channel, testNews());
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      await db.update(channels).set({ lastError: message }).where(eq(channels.id, channel.id));
      return c.json({ error: message }, 502);
    }
    const [updated] = await db
      .update(channels)
      .set({ lastSentAt: new Date(), lastError: null })
      .where(eq(channels.id, channel.id))
      .returning();
    return c.json(view(updated ?? channel));
  });
