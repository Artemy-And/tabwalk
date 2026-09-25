import { drizzle } from 'drizzle-orm/node-postgres';
import { migrate } from 'drizzle-orm/node-postgres/migrator';
import pg from 'pg';
import { env } from './env.js';

async function main() {
  const pool = new pg.Pool({ connectionString: env.DATABASE_URL, max: 1 });
  const db = drizzle(pool);

  console.log('Applying migrations…');
  await migrate(db, { migrationsFolder: new URL('../drizzle', import.meta.url).pathname });
  console.log('Migrations applied.');

  await pool.end();
}

main().catch((err) => {
  console.error('Migrations failed:', err);
  process.exit(1);
});
