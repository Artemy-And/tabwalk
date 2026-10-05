import { z } from 'zod';

// docker compose passes an unset variable as an empty string
const optional = <T extends z.ZodTypeAny>(type: T) =>
  z.preprocess((value) => (value === '' ? undefined : value), type.optional());

const list = z
  .string()
  .default('')
  .transform((value) =>
    value
      .split(',')
      .map((item) => item.trim().toLowerCase())
      .filter(Boolean),
  );

const schema = z
  .object({
    DATABASE_URL: z.string().min(1),
    PORT: z.coerce.number().int().positive().default(3000),
    MAX_PAGES_PER_SCAN: z.coerce.number().int().positive().default(50),
    SCAN_CONCURRENCY: z.coerce.number().int().positive().max(16).default(3),
    PAGE_TIMEOUT_MS: z.coerce.number().int().positive().default(30_000),
    CHROMIUM_EXECUTABLE: z.string().optional(),
    PUBLIC_URL: optional(z.string().url()),
    OIDC_ISSUER: optional(z.string().url()),
    OIDC_CLIENT_ID: optional(z.string()),
    OIDC_CLIENT_SECRET: optional(z.string()),
    OIDC_LABEL: optional(z.string()),
    OIDC_ALLOWED_DOMAINS: list,
    SMTP_URL: optional(z.string().url()),
    SMTP_FROM: optional(z.string()),
  })
  .superRefine((value, ctx) => {
    if (!value.OIDC_ISSUER) return;
    for (const key of ['OIDC_CLIENT_ID', 'PUBLIC_URL'] as const) {
      if (!value[key]) {
        ctx.addIssue({ code: 'custom', path: [key], message: 'Required when OIDC_ISSUER is set' });
      }
    }
  });

const parsed = schema.safeParse(process.env);

if (!parsed.success) {
  console.error('Invalid environment variables:');
  console.error(parsed.error.flatten().fieldErrors);
  process.exit(1);
}

export const env = parsed.data;
