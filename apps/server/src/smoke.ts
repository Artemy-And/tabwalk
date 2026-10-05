import { checkPage, launchBrowser } from './scanner/check.js';

const target = process.argv[2];
if (!target) {
  console.error('Pass a URL or a file path');
  process.exit(1);
}

const url = target.startsWith('http') ? target : `file://${target}`;

const browser = await launchBrowser(process.env.CHROMIUM_EXECUTABLE);
const started = Date.now();
const { findings } = await checkPage(browser, url, 30_000);

const violations = findings.filter((f) => f.kind === 'violation');
const incomplete = findings.filter((f) => f.kind === 'incomplete');

console.log(
  `\nViolations: ${violations.length}, need a human: ${incomplete.length}, ` +
    `${((Date.now() - started) / 1000).toFixed(1)}s\n`,
);

for (const f of findings) {
  const mark = f.kind === 'violation' ? '✗' : f.kind === 'incomplete' ? '?' : '·';
  console.log(`${mark} [${f.impact ?? 'n/a'}] ${f.checker}/${f.ruleId} — ${f.help}`);
  console.log(`   wcag: ${f.wcagTags.join(', ') || '—'} | ${f.standards.join(', ') || '—'}`);
  console.log(`   fingerprint: ${f.fingerprint}`);
  console.log(`   ${f.target.join(' ')}`);
  console.log(`   ${f.html.slice(0, 90)}`);
  if (f.failureSummary && f.checker !== 'axe-core') console.log(`   ${f.failureSummary}`);
  console.log();
}

await browser.close();
