type PluralForms = Partial<Record<Intl.LDMLPluralRule, string>> & { other: string };

export function pluralizer(locale: string) {
  const rules = new Intl.PluralRules(locale);
  return (n: number, forms: PluralForms): string => forms[rules.select(n)] ?? forms.other;
}
