import { readFileSync, writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { dirname, join } from 'node:path';

const require = createRequire(new URL('../../server/package.json', import.meta.url));
const axeDir = dirname(require.resolve('axe-core/package.json'));
const out = new URL('../src/i18n/rules/', import.meta.url);

const LOCALES = { de: 'de', es: 'es', fr: 'fr', it: 'it', pl: 'pl', ru: 'ru', zh: 'zh_CN' };

for (const [locale, file] of Object.entries(LOCALES)) {
  const { rules = {} } = JSON.parse(readFileSync(join(axeDir, 'locales', `${file}.json`), 'utf8'));
  const help = Object.fromEntries(
    Object.keys(rules)
      .sort()
      .filter((id) => rules[id].help)
      .map((id) => [id, rules[id].help.trim().replace(/[.。]$/, '')]),
  );
  writeFileSync(new URL(`${locale}.json`, out), `${JSON.stringify(help, null, 2)}\n`);
  console.log(`${locale}: ${Object.keys(help).length} rules`);
}
