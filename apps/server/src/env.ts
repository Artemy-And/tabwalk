import { z } from 'zod';

const schema = z.object({
  DATABASE_URL: z.string().min(1),
  PORT: z.coerce.number().int().positive().default(3000),
  MAX_PAGES_PER_SCAN: z.coerce.number().int().positive().default(50),
  SCAN_CONCURRENCY: z.coerce.number().int().positive().max(16).default(3),
  PAGE_TIMEOUT_MS: z.coerce.number().int().positive().default(30_000),
  CHROMIUM_EXECUTABLE: z.string().optional(),
});

const parsed = schema.safeParse(process.env);

if (!parsed.success) {
  console.error('Invalid environment variables:');
  console.error(parsed.error.flatten().fieldErrors);
  process.exit(1);
}

export const env = parsed.data;
