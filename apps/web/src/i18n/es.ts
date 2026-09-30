import type { Messages } from './en';
import { pluralizer } from './plural';

const plural = pluralizer('es');

export const es: Messages = {
  meta: {
    title: 'Tabwalk — monitorización de accesibilidad',
  },
  language: {
    label: 'Idioma',
  },
  layout: {
    skipToContent: 'Saltar al contenido',
    mainNav: 'Principal',
    breadcrumb: 'Ruta de navegación',
    sites: 'Sitios',
  },
  sites: {
    title: 'Sitios',
    subtitle: (n) => `${n} ${plural(n, { one: 'sitio', other: 'sitios' })}`,
    add: 'Añadir sitio',
    addHeading: 'Añadir un sitio',
    nameLabel: 'Nombre',
    namePlaceholder: 'Sitio del cliente',
    urlLabel: 'URL',
    urlHint:
      'Las páginas se toman del sitemap.xml o, si no existe, de los enlaces de la página de inicio',
    submit: 'Añadir',
    submitting: 'Añadiendo…',
    fillBoth: 'Rellena los dos campos',
    loading: 'Cargando sitios…',
    empty: 'Todavía no hay sitios. Añade el primero y lanza un análisis desde su página.',
    caption: 'Sitios de clientes, los analizados más recientemente primero',
    columns: {
      site: 'Sitio',
      lastScan: 'Último análisis',
      schedule: 'Análisis automático',
      problems: 'Problemas',
      needsHuman: 'Revisión manual',
      trend: 'Análisis recientes',
    },
    neverScanned: 'Sin analizar',
    noProblems: 'No se encontraron problemas',
    critical: (n) => `${n} ${plural(n, { one: 'crítico', other: 'críticos' })}`,
    serious: (n) => `${n} ${plural(n, { one: 'grave', other: 'graves' })}`,
    minorOnly: 'solo menores',
    total: (n) => `${n} en total`,
    trendLabel: (from, to, scans) =>
      `Los problemas pasaron de ${from} a ${to} en los últimos ${scans} análisis`,
    trendEmpty: 'Pocos análisis',
    disclaimer:
      'Las pruebas automáticas detectan solo una parte de lo que exige WCAG. Todo lo que una máquina ' +
      'no puede juzgar se marca como «Requiere revisión». Tabwalk nunca declara que un sitio cumple ' +
      'la normativa.',
  },
  site: {
    run: 'Iniciar análisis',
    queueing: 'Poniendo en cola…',
    queued: 'Análisis en cola.',
    loading: 'Cargando…',
    notFound: 'Sitio no encontrado.',
    empty: 'Todavía no hay análisis. Lanza el primero para ver qué falla.',
    caption: 'Historial de análisis, los más recientes primero',
    columns: {
      date: 'Análisis',
      pages: 'Páginas',
      problems: 'Problemas',
      needsHuman: 'Revisión manual',
    },
    pagesFailed: (n) => `(${n} con error)`,
  },
  schedule: {
    label: 'Análisis automáticos',
    options: {
      weekly: 'Semanal',
      daily: 'Diario',
      off: 'Desactivado',
    },
    next: (date) => `Próximo análisis: ${date}`,
    soon: 'Próximo análisis en menos de 15 minutos',
    manual: 'Los análisis solo se ejecutan cuando inicias uno',
    saving: 'Guardando…',
    saved: 'Guardado.',
  },
  scan: {
    loading: 'Cargando resultados…',
    notFound: 'Análisis no encontrado.',
    unknownSite: 'Sitio eliminado',
    finished: (date, pages) =>
      `Análisis terminado el ${date} · ${pages} ${plural(pages, { one: 'página', other: 'páginas' })}`,
    running: 'Análisis en curso, se están revisando las páginas…',
    queued: 'Análisis en cola…',
    failed: (error) => `El análisis falló: ${error}`,
    unknownError: 'error desconocido',
    uniqueProblems: (n) => plural(n, { one: 'problema único', other: 'problemas únicos' }),
    criticalFindings: (n) => plural(n, { one: 'crítico', other: 'críticos' }),
    needHuman: (n) =>
      plural(n, { one: 'requiere revisión manual', other: 'requieren revisión manual' }),
    elements: (n) =>
      `en ${n.toLocaleString('es')} ${plural(n, { one: 'elemento', other: 'elementos' })}`,
    pages: (n) => plural(n, { one: 'página revisada', other: 'páginas revisadas' }),
    findingsHeading: 'Hallazgos',
    loadingFindings: 'Cargando hallazgos…',
    exportCsv: 'Exportar CSV',
    filters: {
      label: 'Mostrar',
      all: 'Todos',
      critical: 'Críticos',
      review: 'Revisión manual',
      new: 'Nuevos desde el último análisis',
      fixed: 'Corregidos',
      recommendations: 'Recomendaciones',
    },
  },
  issues: {
    empty: 'Sin hallazgos.',
    emptyFilter: 'Nada coincide con este filtro.',
    caption:
      'Hallazgos agrupados por marcado repetido: un error en una plantilla cuenta una sola vez.',
    fixedCaption: 'Aparecían en el análisis anterior y ya no están en este.',
    recommendationsCaption:
      'Buenas prácticas más allá de WCAG. No cuentan como problemas y nunca hacen fallar una comprobación.',
    rows: (n) => `${n} ${plural(n, { one: 'fila', other: 'filas' })}.`,
    columns: {
      impact: 'Impacto',
      problem: 'Qué falla',
      ruleId: 'Regla',
      pagesAffected: 'Páginas',
    },
    sortedBy: {
      impact: 'impacto',
      ruleId: 'regla',
      pagesAffected: 'número de páginas',
    },
    sortAnnouncement: (column, ascending) =>
      `Tabla ordenada por ${column}, ${ascending ? 'ascendente' : 'descendente'}`,
    sortAction: (ascending) => `ordenar ${ascending ? 'ascendente' : 'descendente'}`,
    showMarkup: 'Mostrar marcado',
    opensInNewTab: ' (se abre en una pestaña nueva)',
    newTag: 'Nuevo',
    fixedNote: 'No encontrado en este análisis',
  },
  impact: {
    critical: 'Crítico',
    serious: 'Grave',
    moderate: 'Moderado',
    minor: 'Menor',
    needsReview: 'Requiere revisión',
    recommendation: 'Recomendación',
  },
  status: {
    queued: 'En cola',
    running: 'Analizando',
    done: 'Terminado',
    failed: 'Error',
  },
};
