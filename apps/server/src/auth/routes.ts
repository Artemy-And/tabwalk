import { zValidator } from '@hono/zod-validator';
import { eq, sql } from 'drizzle-orm';
import { Hono } from 'hono';
import { deleteCookie, getCookie, setCookie } from 'hono/cookie';
import { z } from 'zod';
import { db } from '../db/index.js';
import { defaultOrgId } from '../db/org.js';
import { sessions, users } from '../db/schema.js';
import { env } from '../env.js';
import { hashPassword, randomToken, verifyPassword } from './crypto.js';
import { Oidc, type OidcChecks } from './oidc.js';
import { type AuthEnv, endSession, requireUser, secure, startSession } from './session.js';

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

const oidc = Oidc.fromEnv();
const OIDC_COOKIE = 'tabwalk_oidc';
const OIDC_PATH = '/api/auth/oidc';
const OIDC_TTL_MS = 10 * 60_000;
// sign-ins on their way through the identity provider, by the id in their cookie
const pending = new Map<string, { checks: OidcChecks; until: number }>();

const ssoError = (message: string) => `/?sso_error=${encodeURIComponent(message)}`;

export const authRoutes = new Hono<AuthEnv>()
  .get('/config', async (c) =>
    c.json({ setup: await needsSetup(), sso: oidc ? { label: oidc.label } : null }),
  )

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
  )

  .get('/oidc/start', async (c) => {
    if (!oidc) return c.redirect(ssoError('Single sign-on is not set up'));
    try {
      const { url, checks } = await oidc.start();
      const now = Date.now();
      for (const [key, item] of pending) if (item.until < now) pending.delete(key);
      const id = randomToken(24);
      pending.set(id, { checks, until: now + OIDC_TTL_MS });
      setCookie(c, OIDC_COOKIE, id, {
        httpOnly: true,
        sameSite: 'Lax',
        secure: secure(c),
        path: OIDC_PATH,
        maxAge: OIDC_TTL_MS / 1000,
      });
      return c.redirect(url);
    } catch (error) {
      console.error('SSO discovery failed', error);
      return c.redirect(ssoError('Could not reach the identity provider'));
    }
  })

  .get('/oidc/callback', async (c) => {
    if (!oidc) return c.redirect(ssoError('Single sign-on is not set up'));
    const id = getCookie(c, OIDC_COOKIE);
    deleteCookie(c, OIDC_COOKIE, { path: OIDC_PATH, secure: secure(c) });
    const saved = id ? pending.get(id) : undefined;
    if (id) pending.delete(id);
    if (!saved || saved.until < Date.now()) {
      return c.redirect(ssoError('Sign-in expired, try again'));
    }

    let identity: { email: string; name: string | null };
    try {
      identity = await oidc.finish(new URL(c.req.url).search, saved.checks);
    } catch (error) {
      console.error('SSO callback failed', error);
      return c.redirect(ssoError(error instanceof Error ? error.message : 'Sign-in failed'));
    }

    const { email, name } = identity;
    let user = await db.query.users.findFirst({ where: eq(users.email, email) });
    if (!user) {
      const domain = email.split('@')[1] ?? '';
      if (!env.OIDC_ALLOWED_DOMAINS.includes(domain)) {
        return c.redirect(
          ssoError(
            `${email} has no account here. An admin can add ${domain} to OIDC_ALLOWED_DOMAINS.`,
          ),
        );
      }
      [user] = await db
        .insert(users)
        .values({ orgId: await defaultOrgId(), email, name })
        .returning();
    }
    if (!user) return c.redirect(ssoError('Sign-in failed'));
    if (!user.name && name) await db.update(users).set({ name }).where(eq(users.id, user.id));
    await startSession(c, user);
    return c.redirect('/');
  });
