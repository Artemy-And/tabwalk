import { and, eq, gt, lt } from 'drizzle-orm';
import type { Context } from 'hono';
import { deleteCookie, getCookie, setCookie } from 'hono/cookie';
import { createMiddleware } from 'hono/factory';
import { db } from '../db/index.js';
import { sessions, type User, users } from '../db/schema.js';
import { env } from '../env.js';
import { randomToken, sha256 } from './crypto.js';

export type AuthEnv = { Variables: { user: User } };

const COOKIE = 'tabwalk_session';
const TTL_MS = 30 * 86_400_000;

function secure(c: Context): boolean {
  if (env.PUBLIC_URL) return env.PUBLIC_URL.startsWith('https://');
  return c.req.header('x-forwarded-proto') === 'https' || c.req.url.startsWith('https://');
}

export async function startSession(c: Context, user: User): Promise<void> {
  const token = randomToken();
  await db.delete(sessions).where(lt(sessions.expiresAt, new Date()));
  await db.insert(sessions).values({
    id: sha256(token),
    userId: user.id,
    expiresAt: new Date(Date.now() + TTL_MS),
  });
  await db.update(users).set({ lastLoginAt: new Date() }).where(eq(users.id, user.id));
  setCookie(c, COOKIE, token, {
    httpOnly: true,
    sameSite: 'Lax',
    secure: secure(c),
    path: '/',
    maxAge: TTL_MS / 1000,
  });
}

export async function endSession(c: Context): Promise<void> {
  const token = getCookie(c, COOKIE);
  if (token) await db.delete(sessions).where(eq(sessions.id, sha256(token)));
  deleteCookie(c, COOKIE, { path: '/', secure: secure(c) });
}

export async function currentUser(c: Context): Promise<User | null> {
  const token = getCookie(c, COOKIE);
  if (!token) return null;
  const [row] = await db
    .select({ user: users })
    .from(sessions)
    .innerJoin(users, eq(users.id, sessions.userId))
    .where(and(eq(sessions.id, sha256(token)), gt(sessions.expiresAt, new Date())));
  return row?.user ?? null;
}

export const requireUser = createMiddleware<AuthEnv>(async (c, next) => {
  const user = await currentUser(c);
  if (!user) return c.json({ error: 'Sign in to continue' }, 401);
  c.set('user', user);
  await next();
});
