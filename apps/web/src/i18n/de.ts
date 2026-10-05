import type { Messages } from './en';
import { pluralizer } from './plural';

const plural = pluralizer('de');

export const de: Messages = {
  meta: {
    title: 'Tabwalk — Barrierefreiheit überwachen',
  },
  language: {
    label: 'Sprache',
  },
  layout: {
    skipToContent: 'Zum Inhalt springen',
    mainNav: 'Hauptnavigation',
    breadcrumb: 'Brotkrümelnavigation',
    sites: 'Websites',
    account: 'Konto',
  },
  auth: {
    checking: 'Sitzung wird geprüft…',
    setupTitle: 'Administratorkonto anlegen',
    setupIntro:
      'Dieses Tabwalk hat noch kein Konto. Das Konto, das Sie jetzt anlegen, kann Websites hinzufügen und alle Berichte lesen. Legen Sie es an, bevor Sie das Dashboard anderen zugänglich machen.',
    loginTitle: 'Bei Tabwalk anmelden',
    email: 'E-Mail',
    password: 'Passwort',
    passwordHint: 'Mindestens 8 Zeichen',
    create: 'Konto anlegen',
    creating: 'Wird angelegt…',
    signIn: 'Anmelden',
    signingIn: 'Anmeldung…',
    forgot: 'Passwort vergessen? Setzen Sie auf dem Server ein neues:',
  },
  account: {
    title: 'Konto',
    signedInAs: (email: string) => `Angemeldet als ${email}`,
    signOut: 'Abmelden',
    passwordHeading: 'Passwort ändern',
    current: 'Aktuelles Passwort',
    next: 'Neues Passwort',
    save: 'Passwort ändern',
    saving: 'Wird gespeichert…',
    saved: 'Passwort geändert. Andere Browser wurden abgemeldet.',
    ssoOnly: 'Sie melden sich per Single Sign-on an, daher gibt es hier kein Passwort zu ändern.',
  },
  sites: {
    title: 'Websites',
    subtitle: (n) => `${n} ${plural(n, { one: 'Website', other: 'Websites' })}`,
    add: 'Website hinzufügen',
    addHeading: 'Website hinzufügen',
    nameLabel: 'Name',
    namePlaceholder: 'Kunden-Website',
    urlLabel: 'URL',
    urlHint:
      'Die Seiten kommen aus der sitemap.xml oder, falls es keine gibt, aus den Links der Startseite',
    submit: 'Hinzufügen',
    submitting: 'Wird hinzugefügt…',
    fillBoth: 'Bitte beide Felder ausfüllen',
    loading: 'Websites werden geladen…',
    empty:
      'Noch keine Websites. Fügen Sie die erste hinzu und starten Sie dann auf ihrer Seite eine Prüfung.',
    caption: 'Kunden-Websites, zuletzt geprüfte zuerst',
    columns: {
      site: 'Website',
      lastScan: 'Letzte Prüfung',
      schedule: 'Auto-Prüfung',
      problems: 'Probleme',
      needsHuman: 'Manuell prüfen',
      trend: 'Letzte Prüfungen',
    },
    neverScanned: 'Noch nie geprüft',
    noProblems: 'Keine Probleme gefunden',
    critical: (n) => `${n} kritisch`,
    serious: (n) => `${n} schwerwiegend`,
    minorOnly: 'nur geringfügige',
    total: (n) => `${n} insgesamt`,
    trendLabel: (from, to, scans) =>
      `Die Probleme gingen in den letzten ${scans} Prüfungen von ${from} auf ${to}`,
    trendEmpty: 'Zu wenige Prüfungen',
    disclaimer:
      'Automatische Tests erfassen nur einen Teil dessen, was die WCAG verlangen. Alles, was eine ' +
      'Maschine nicht beurteilen kann, ist als „Prüfung nötig“ markiert. Tabwalk bescheinigt nie, ' +
      'dass eine Website konform ist.',
  },
  site: {
    run: 'Prüfung starten',
    queueing: 'Wird eingereiht…',
    queued: 'Prüfung eingereiht.',
    loading: 'Wird geladen…',
    notFound: 'Website nicht gefunden.',
    empty: 'Noch keine Prüfungen. Starten Sie die erste, um zu sehen, was nicht funktioniert.',
    caption: 'Prüfverlauf, neueste zuerst',
    columns: {
      date: 'Prüfung',
      pages: 'Seiten',
      problems: 'Probleme',
      needsHuman: 'Manuell prüfen',
    },
    pagesFailed: (n) => `(${n} fehlgeschlagen)`,
  },
  schedule: {
    label: 'Automatische Prüfungen',
    options: {
      weekly: 'Wöchentlich',
      daily: 'Täglich',
      off: 'Aus',
    },
    next: (date) => `Nächste Prüfung ${date}`,
    soon: 'Nächste Prüfung in den nächsten 15 Minuten',
    manual: 'Prüfungen laufen nur, wenn Sie eine starten',
    saving: 'Wird gespeichert…',
    saved: 'Gespeichert.',
  },
  scan: {
    loading: 'Ergebnisse werden geladen…',
    notFound: 'Prüfung nicht gefunden.',
    unknownSite: 'Gelöschte Website',
    finished: (date, pages) =>
      `Prüfung abgeschlossen am ${date} · ${pages} ${plural(pages, { one: 'Seite', other: 'Seiten' })}`,
    running: 'Prüfung läuft, die Seiten werden getestet…',
    queued: 'Prüfung in der Warteschlange…',
    failed: (error) => `Prüfung fehlgeschlagen: ${error}`,
    unknownError: 'unbekannter Fehler',
    uniqueProblems: (n) => plural(n, { one: 'eindeutiges Problem', other: 'eindeutige Probleme' }),
    criticalFindings: (n) => plural(n, { other: 'kritisch' }),
    needHuman: (n) =>
      plural(n, { one: 'muss manuell geprüft werden', other: 'müssen manuell geprüft werden' }),
    elements: (n) =>
      `auf ${n.toLocaleString('de')} ${plural(n, { one: 'Element', other: 'Elementen' })}`,
    pages: (n) => plural(n, { one: 'Seite geprüft', other: 'Seiten geprüft' }),
    findingsHeading: 'Befunde',
    loadingFindings: 'Befunde werden geladen…',
    exportCsv: 'Als CSV exportieren',
    filters: {
      label: 'Anzeigen',
      all: 'Alle',
      critical: 'Kritisch',
      review: 'Manuell prüfen',
      new: 'Neu seit letzter Prüfung',
      fixed: 'Behoben',
      recommendations: 'Empfehlungen',
    },
  },
  pages: {
    heading: 'Seiten',
    caption: 'In diesem Scan geprüfte Seiten. Öffnen Sie eine, um ihre Tab-Reihenfolge zu sehen.',
    loading: 'Seiten werden geladen…',
    columns: {
      page: 'Seite',
      problems: 'Probleme',
      tabStops: 'Tab-Stopps',
    },
    failed: (error: string) => `Prüfung fehlgeschlagen: ${error}`,
  },
  page: {
    loading: 'Seite wird geladen…',
    notFound: 'Seite nicht gefunden.',
    tabOrder: 'Tab-Reihenfolge',
    tabOrderIntro: (n: number) =>
      `${n} ${plural(n, { one: 'Tab-Stopp', other: 'Tab-Stopps' })}. Jede Zahl zeigt, wohin der Fokus beim Drücken von Tab springt, vom Seitenanfang an.`,
    pictureAlt: (n: number) =>
      `Die Seite mit ihren ${n} nummerierten ${plural(n, { one: 'Tab-Stopp', other: 'Tab-Stopps' })}. Dieselben Stopps sind unten aufgeführt.`,
    listHeading: 'Tab-Stopps in Reihenfolge',
    unnamed: 'ohne Text',
    notDrawn: 'nicht im Bild',
    noPicture:
      'Für diese Seite gibt es kein Bild der Tab-Reihenfolge. Bilder werden nur für den letzten Scan jeder Website aufbewahrt.',
  },
  issues: {
    empty: 'Keine Befunde.',
    emptyFilter: 'Nichts passt zu diesem Filter.',
    caption:
      'Befunde sind nach wiederholtem Markup gruppiert, ein Fehler in einer Vorlage zählt also nur einmal.',
    fixedCaption: 'In der vorigen Prüfung gefunden, in dieser nicht mehr.',
    recommendationsCaption:
      'Gute Praxis über die WCAG hinaus. Zählt nicht als Problem und lässt keine Prüfung scheitern.',
    rows: (n) => `${n} ${plural(n, { one: 'Zeile', other: 'Zeilen' })}.`,
    columns: {
      impact: 'Auswirkung',
      problem: 'Was ist falsch',
      ruleId: 'Regel',
      pagesAffected: 'Seiten',
    },
    sortedBy: {
      impact: 'Auswirkung',
      ruleId: 'Regel',
      pagesAffected: 'Seitenzahl',
    },
    sortAnnouncement: (column, ascending) =>
      `Tabelle sortiert nach ${column}, ${ascending ? 'aufsteigend' : 'absteigend'}`,
    sortAction: (ascending) => `${ascending ? 'aufsteigend' : 'absteigend'} sortieren`,
    showMarkup: 'Markup anzeigen',
    opensInNewTab: ' (öffnet in neuem Tab)',
    newTag: 'Neu',
    fixedNote: 'In dieser Prüfung nicht gefunden',
  },
  impact: {
    critical: 'Kritisch',
    serious: 'Schwerwiegend',
    moderate: 'Mittel',
    minor: 'Geringfügig',
    needsReview: 'Prüfung nötig',
    recommendation: 'Empfehlung',
  },
  status: {
    queued: 'In der Warteschlange',
    running: 'Wird geprüft',
    done: 'Fertig',
    failed: 'Fehlgeschlagen',
  },
  rules: {
    'keyboard-trap': 'Der Tastaturfokus darf nicht in einem Teil der Seite hängen bleiben',
    'focus-visible': 'Der Tastaturfokus muss sichtbar sein',
    'focus-obscured': 'Fokussierte Elemente dürfen nicht von anderen Inhalten verdeckt werden',
    'skip-link-target':
      'Sprunglinks müssen den Tastaturfokus hinter die wiederholten Inhalte setzen',
  },
};
