import { zValidator } from '@hono/zod-validator';
import { eq, sql } from 'drizzle-orm';
import { Hono } from 'hono';
import { z } from 'zod';
import { db } from '../db/index.js';
import { defaultOrgId } from '../db/org.js';
import { sessions, users } from '../db/schema.js';
import { hashPassword, verifyPassword } from './crypto.js';
import { type AuthEnv, endSession, requireUser, startSession } from './session.js';

const MAX_FAILURES = 10;
const LOCK_MS = 15 * 60_000;
const SETUP_LOCK = 7_331_001;

const passwordSchema = z.string().min(8, 'Use at least 8 characters').max(256);
const emailSchema = z.string().trim().toLowerCase().email('Enter a valid email address');

function json<T extends z.ZodTypeAny>(schema: T) {
  return zValidator('json', schema, (result, c) => {
    if (!result.success) {
      return c.json({ error: result.error.issues[0]?.message ?? 'Invalid request' }, 400);
    }
  });
}

async function needsSetup(): Promise<boolean> {
  const [row] = await db.select({ count: sql<number>`count(*)::int` }).from(users);
  return !row?.count;
}

// slows down password guessing: 10 failures lock an email for 15 minutes
const failures = new Map<string, { count: number; until: number }>();

let dummyHash: Promise<string> | null = null;

export const authRoutes = new Hono<AuthEnv>()
  .get('/config', async (c) => c.json({ setup: await needsSetup(), sso: null }))

  .post('/setup', json(z.object({ email: emailSchema, password: passwordSchema })), async (c) => {
    const { email, password } = c.req.valid('json');
    const orgId = await defaultOrgId();
    const passwordHash = await hashPassword(password);
    const user = await db.transaction(async (tx) => {
      await tx.execute(sql`select pg_advisory_xact_lock(${SETUP_LOCK})`);
      const [row] = await tx.select({ count: sql<number>`count(*)::int` }).from(users);
      if (row?.count) return null;
      const [created] = await tx.insert(users).values({ orgId, email, passwordHash }).returning();
      return created ?? null;
    });
    if (!user) return c.json({ error: 'Tabwalk is already set up. Sign in instead.' }, 409);
    await startSession(c, user);
    return c.json({ email: user.email }, 201);
  })

  .post(
    '/login',
    json(z.object({ email: z.string().trim().toLowerCase(), password: z.string().min(1) })),
    async (c) => {
      const { email, password } = c.req.valid('json');
      const now = Date.now();
      const record = failures.get(email);
      const recent = record && record.until > now ? record.count : 0;
      if (recent >= MAX_FAILURES) {
        return c.json({ error: 'Too many attempts. Try again in 15 minutes.' }, 429);
      }

      const user = await db.query.users.findFirst({ where: eq(users.email, email) });
      // the same work with or without an account, so timing does not reveal which emails exist
      dummyHash ??= hashPassword('not a real password');
      const ok = await verifyPassword(password, user?.passwordHash ?? (await dummyHash));
      if (!ok || !user?.passwordHash) {
        failures.set(email, { count: recent + 1, until: now + LOCK_MS });
        return c.json({ error: 'Wrong email or password' }, 401);
      }

      failures.delete(email);
      await startSession(c, user);
      return c.json({ email: user.email });
    },
  )

  .post('/logout', async (c) => {
    await endSession(c);
    return c.json({ ok: true });
  })

  .get('/me', requireUser, (c) => {
    const user = c.get('user');
    return c.json({ email: user.email, name: user.name, hasPassword: user.passwordHash !== null });
  })

  .post(
    '/password',
    requireUser,
    json(z.object({ current: z.string().min(1), password: passwordSchema })),
    async (c) => {
      const user = c.get('user');
      const { current, password } = c.req.valid('json');
      if (!user.passwordHash || !(await verifyPassword(current, user.passwordHash))) {
        return c.json({ error: 'The current password is wrong' }, 400);
      }
      await db
        .update(users)
        .set({ passwordHash: await hashPassword(password) })
        .where(eq(users.id, user.id));
      // a new password signs out every other browser
      await db.delete(sessions).where(eq(sessions.userId, user.id));
      await startSession(c, user);
      return c.json({ ok: true });
    },
  );
