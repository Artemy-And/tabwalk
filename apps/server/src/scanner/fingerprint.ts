import { createHash } from 'node:crypto';

export function fingerprint(ruleId: string, html: string): string {
  const normalized = html
    .replace(/\s+/g, ' ')
    .replace(/<svg\b[^>]*>.*?<\/svg>/gi, '<svg>')
    .replace(/<svg\b[^>]*>/gi, '<svg>')
    .replace(
      /\b(id|for|href|src|srcset|value|aria-labelledby|aria-describedby|aria-controls|data-[\w-]+)="[^"]*"/gi,
      '$1="*"',
    )
    .replace(/>[^<>]{1,400}</g, '><')
    .trim()
    .slice(0, 800);

  return createHash('sha256').update(`${ruleId}|${normalized}`).digest('hex').slice(0, 16);
}
