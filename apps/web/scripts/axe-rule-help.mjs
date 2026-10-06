import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { dirname, join } from 'node:path';

const require = createRequire(new URL('../../server/package.json', import.meta.url));
const axeDir = dirname(require.resolve('axe-core/package.json'));
const out = new URL('../src/i18n/rules/', import.meta.url);

const LOCALES = {
  de: 'de',
  es: 'es',
  fr: 'fr',
  it: 'it',
  nl: 'nl',
  pl: 'pl',
  ru: 'ru',
  zh: 'zh_CN',
};

for (const [locale, file] of Object.entries(LOCALES)) {
  const { rules = {} } = JSON.parse(readFileSync(join(axeDir, 'locales', `${file}.json`), 'utf8'));
  // axe-core's own translation wins; scripts/rule-help/<locale>.json fills the rules it lacks,
  // as for Dutch, where axe-core translates one rule
  const ownFile = new URL(`./rule-help/${locale}.json`, import.meta.url);
  const own = existsSync(ownFile) ? JSON.parse(readFileSync(ownFile, 'utf8')) : {};
  const texts = {
    ...own,
    ...Object.fromEntries(
      Object.keys(rules)
        .filter((id) => rules[id].help)
        .map((id) => [id, rules[id].help]),
    ),
  };
  const help = Object.fromEntries(
    Object.keys(texts)
      .sort()
      .map((id) => [id, texts[id].trim().replace(/[.。]$/, '')]),
  );
  writeFileSync(new URL(`${locale}.json`, out), `${JSON.stringify(help, null, 2)}\n`);
  console.log(`${locale}: ${Object.keys(help).length} rules`);
}
