// Sets a new random password for an account and signs it out everywhere.
// Docker: docker compose exec api node dist/reset-password.js you@example.com
import { eq } from 'drizzle-orm';
import { hashPassword, randomToken } from './auth/crypto.js';
import { db, pool } from './db/index.js';
import { sessions, users } from './db/schema.js';

const email = process.argv[2]?.trim().toLowerCase();
if (!email) {
  console.error('Usage: reset-password <email>');
  process.exit(1);
}

const user = await db.query.users.findFirst({ where: eq(users.email, email) });
if (!user) {
  const all = await db.select({ email: users.email }).from(users);
  console.error(
    all.length > 0
      ? `No account with the email ${email}. Accounts: ${all.map((u) => u.email).join(', ')}`
      : 'Nobody has an account yet. Open the dashboard to create the first one.',
  );
  await pool.end();
  process.exit(1);
}

const password = randomToken(12);
await db
  .update(users)
  .set({ passwordHash: await hashPassword(password) })
  .where(eq(users.id, user.id));
await db.delete(sessions).where(eq(sessions.userId, user.id));
await pool.end();

console.log(
  `New password for ${email}: ${password}\nChange it on the Account page after signing in.`,
);
