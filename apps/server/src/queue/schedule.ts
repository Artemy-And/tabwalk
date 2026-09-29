import { and, ne, sql } from 'drizzle-orm';
import { db } from '../db/index.js';
import { type ScanSchedule, scans, sites } from '../db/schema.js';
import { getBoss, SCAN_QUEUE } from './boss.js';

export const SCHEDULE_QUEUE = 'scan.schedule';
export const SCHEDULE_CRON = '*/15 * * * *';

const INTERVAL_MS: Record<Exclude<ScanSchedule, 'off'>, number> = {
  daily: 24 * 3600 * 1000,
  weekly: 7 * 24 * 3600 * 1000,
};

export async function enqueueScan(siteId: string) {
  const [scan] = await db.insert(scans).values({ siteId }).returning();
  if (!scan) throw new Error('Could not create the scan');

  const boss = await getBoss();
  await boss.send(SCAN_QUEUE, { scanId: scan.id });
  return scan;
}

export function nextScanAt(schedule: ScanSchedule, lastScanAt: Date | null): Date | null {
  if (schedule === 'off') return null;
  const next = lastScanAt ? lastScanAt.getTime() + INTERVAL_MS[schedule] : Date.now();
  return new Date(Math.max(next, Date.now()));
}

// A site is due when it has no scan waiting or running and none started within its interval.
// The 15 minute slack matches the cron tick, so scans keep roughly the same time of day.
export async function enqueueDueScans(): Promise<number> {
  const due = await db
    .select({ id: sites.id })
    .from(sites)
    .where(
      and(
        ne(sites.schedule, 'off'),
        sql`not exists (
          select 1 from scans s
          where s.site_id = sites.id
            and (
              s.status in ('queued', 'running')
              or s.created_at > now() + interval '15 minutes' - case sites.schedule
                when 'daily' then interval '1 day'
                else interval '7 days'
              end
            )
        )`,
      ),
    );

  for (const site of due) await enqueueScan(site.id);
  return due.length;
}
