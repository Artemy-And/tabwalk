import PgBoss from 'pg-boss';
import { env } from '../env.js';

export const SCAN_QUEUE = 'scan.run';

export interface ScanJob {
  scanId: string;
}

let boss: PgBoss | null = null;

export async function getBoss(): Promise<PgBoss> {
  if (boss) return boss;

  boss = new PgBoss({
    connectionString: env.DATABASE_URL,
    schema: 'pgboss',
    retryLimit: 2,
    retryDelay: 30,
  });

  boss.on('error', (err) => console.error('[pg-boss]', err));

  await boss.start();
  await createQueue(boss, SCAN_QUEUE);

  return boss;
}

export async function createQueue(boss: PgBoss, name: string): Promise<void> {
  for (let attempt = 1; ; attempt++) {
    try {
      await boss.createQueue(name);
      return;
    } catch (err) {
      // 40P01: the API and the worker created the queue at the same moment
      if ((err as { code?: string }).code !== '40P01' || attempt >= 3) throw err;
    }
  }
}

export async function stopBoss(): Promise<void> {
  await boss?.stop({ graceful: true });
  boss = null;
}
