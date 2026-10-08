import { z } from 'zod';

const selector = z.string().trim().min(1).max(1000);
export const scenarioStepSchema = z.discriminatedUnion('action', [
  z.object({ action: z.literal('click'), selector }).strict(),
  z.object({ action: z.literal('fill'), selector, value: z.string().max(2000) }).strict(),
  z.object({ action: z.literal('press'), key: z.string().trim().min(1).max(80) }).strict(),
  z
    .object({ action: z.literal('waitFor'), selector, state: z.enum(['visible', 'hidden']) })
    .strict(),
  z.object({ action: z.literal('expectFocus'), selector }).strict(),
]);
export const scenariosSchema = z
  .array(
    z
      .object({
        name: z.string().trim().min(1).max(80),
        path: z
          .string()
          .trim()
          .min(1)
          .max(1000)
          .refine((path) => {
            if (!path.startsWith('/') || path.startsWith('//') || /[?#\\\s]/.test(path))
              return false;
            return new URL(path, 'https://example.test').pathname === path;
          }, 'Use an exact pathname such as /contact.html, without a query or fragment'),
        steps: z.array(scenarioStepSchema).min(1).max(20),
      })
      .strict(),
  )
  .max(5)
  .refine(
    (scenarios) => new Set(scenarios.map((s) => s.name.toLowerCase())).size === scenarios.length,
    'Scenario names must be unique',
  );
