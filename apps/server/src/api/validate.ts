import { zValidator } from '@hono/zod-validator';
import type { z } from 'zod';

// answers { error } with the first problem, the shape the dashboard shows
export function json<T extends z.ZodTypeAny>(schema: T) {
  return zValidator('json', schema, (result, c) => {
    if (!result.success) {
      return c.json({ error: result.error.issues[0]?.message ?? 'Invalid request' }, 400);
    }
  });
}
