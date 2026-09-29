import { serve } from '@hono/node-server';
import { app } from './api/app.js';
import { pool } from './db/index.js';
import { env } from './env.js';
import { getBoss, SCAN_QUEUE, type ScanJob, stopBoss } from './queue/boss.js';
import { enqueueDueScans, SCHEDULE_CRON, SCHEDULE_QUEUE } from './queue/schedule.js';
import { runScan } from './scanner/runner.js';

const mode = process.argv[2] ?? 'api';

async function startApi(): Promise<void> {
  await getBoss();

  serve({ fetch: app.fetch, port: env.PORT }, (info) => {
    console.log(`API listening on http://localhost:${info.port}`);
  });
}

async function startWorker(): Promise<void> {
  const boss = await getBoss();

  await boss.work<ScanJob>(
    SCAN_QUEUE,
    { batchSize: 1, pollingIntervalSeconds: 2 },
    async (jobs) => {
      for (const job of jobs) {
        await runScan(job.data.scanId);
      }
    },
  );

  await boss.createQueue(SCHEDULE_QUEUE);
  await boss.schedule(SCHEDULE_QUEUE, SCHEDULE_CRON);
  await boss.work(SCHEDULE_QUEUE, async () => {
    const queued = await enqueueDueScans();
    if (queued > 0) console.log(`Queued ${queued} scheduled scan(s)`);
  });

  console.log(`Worker waiting for jobs on "${SCAN_QUEUE}"`);
}

async function shutdown(signal: string): Promise<void> {
  console.log(`Received ${signal}, shutting down…`);
  await stopBoss().catch(() => {});
  await pool.end().catch(() => {});
  process.exit(0);
}

process.on('SIGTERM', () => void shutdown('SIGTERM'));
process.on('SIGINT', () => void shutdown('SIGINT'));

const start = mode === 'worker' ? startWorker : startApi;

start().catch((err) => {
  console.error('Failed to start:', err);
  process.exit(1);
});
