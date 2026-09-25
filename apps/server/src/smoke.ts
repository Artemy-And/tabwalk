import { chromium } from 'playwright';
import { axeChecker } from './scanner/checkers/axe.js';
import { fingerprint } from './scanner/fingerprint.js';

const target = process.argv[2];
if (!target) {
  console.error('Pass a URL or a file path');
  process.exit(1);
}

const url = target.startsWith('http') ? target : `file://${target}`;

const browser = await chromium.launch({
  args: ['--no-sandbox', '--disable-dev-shm-usage'],
  ...(process.env.CHROMIUM_EXECUTABLE ? { executablePath: process.env.CHROMIUM_EXECUTABLE } : {}),
});

const context = await browser.newContext({ reducedMotion: 'reduce' });
const page = await context.newPage();
await page.goto(url, { waitUntil: 'domcontentloaded' });

const findings = await axeChecker.run(page);

const violations = findings.filter((f) => f.kind === 'violation');
const incomplete = findings.filter((f) => f.kind === 'incomplete');

console.log(`\nViolations: ${violations.length}, need a human: ${incomplete.length}\n`);

for (const f of findings) {
  const mark = f.kind === 'violation' ? '✗' : '?';
  console.log(`${mark} [${f.impact ?? 'n/a'}] ${f.ruleId} — ${f.help}`);
  console.log(`   wcag: ${f.wcagTags.join(', ') || '—'}`);
  console.log(`   fingerprint: ${fingerprint(f.ruleId, f.html)}`);
  console.log(`   ${f.html.slice(0, 90)}\n`);
}

await browser.close();
