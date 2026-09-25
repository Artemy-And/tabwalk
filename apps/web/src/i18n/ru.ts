import type { Messages } from './en';
import { pluralizer } from './plural';

const plural = pluralizer('ru');

export const ru: Messages = {
  meta: {
    title: 'Skiplink — мониторинг доступности',
  },
  language: {
    label: 'Язык',
  },
  layout: {
    skipToContent: 'Перейти к содержимому',
    mainNav: 'Основная',
    sites: 'Сайты',
  },
  sites: {
    title: 'Сайты',
    addHeading: 'Добавить сайт',
    nameLabel: 'Название',
    namePlaceholder: 'Сайт клиента',
    urlLabel: 'Адрес',
    urlHint: 'Страницы берутся из sitemap.xml, а если его нет — из ссылок на главной',
    submit: 'Добавить сайт',
    submitting: 'Добавляем…',
    fillBoth: 'Заполните оба поля',
    loading: 'Загружаем сайты…',
    empty: 'Сайтов пока нет. Добавьте первый в форме выше.',
    neverScanned: 'Ещё не проверялся',
  },
  site: {
    title: 'Проверки',
    run: 'Запустить проверку',
    queueing: 'Ставим в очередь…',
    queued: 'Проверка поставлена в очередь.',
    loading: 'Загрузка…',
    empty: 'Проверок пока нет.',
    pagesScanned: (n) => `Проверено страниц: ${n}`,
    pagesFailed: (n) => `, с ошибкой: ${n}`,
  },
  scan: {
    loading: 'Загружаем результаты…',
    notFound: 'Проверка не найдена.',
    title: (date) => `Проверка от ${date}`,
    running: 'Идёт проверка, страницы обрабатываются…',
    queued: 'Проверка в очереди…',
    done: (pages) => `Готово. Проверено страниц: ${pages}.`,
    failed: (error) => `Проверка не удалась: ${error}`,
    unknownError: 'неизвестная ошибка',
    uniqueProblems: (n) =>
      plural(n, {
        one: 'уникальная проблема',
        few: 'уникальные проблемы',
        other: 'уникальных проблем',
      }),
    criticalFindings: (n) =>
      plural(n, {
        one: 'критическая проблема',
        few: 'критические проблемы',
        other: 'критических проблем',
      }),
    needHuman: (n) =>
      plural(n, { one: 'требует ручной проверки', other: 'требуют ручной проверки' }),
    pages: (n) => plural(n, { one: 'страница', few: 'страницы', other: 'страниц' }),
    findingsHeading: 'Найденные проблемы',
    loadingFindings: 'Загружаем проблемы…',
  },
  issues: {
    empty: 'Проблем не найдено.',
    caption:
      'Проблемы сгруппированы по повторяющейся разметке, поэтому одна ошибка в шаблоне считается один раз.',
    rows: (n) => `${n} ${plural(n, { one: 'строка', few: 'строки', other: 'строк' })}.`,
    columns: {
      impact: 'Критичность',
      problem: 'Что не так',
      ruleId: 'Правило',
      pagesAffected: 'Страницы',
    },
    sortedBy: {
      impact: 'по критичности',
      ruleId: 'по правилу',
      pagesAffected: 'по числу страниц',
    },
    sortAnnouncement: (column, ascending) =>
      `Таблица отсортирована ${column}, ${ascending ? 'по возрастанию' : 'по убыванию'}`,
    sortAction: (ascending) => `сортировать ${ascending ? 'по возрастанию' : 'по убыванию'}`,
    showMarkup: 'Показать разметку',
    opensInNewTab: ' (откроется в новой вкладке)',
  },
  impact: {
    critical: 'Критическая',
    serious: 'Серьёзная',
    moderate: 'Умеренная',
    minor: 'Незначительная',
    needsReview: 'Нужна проверка',
  },
  status: {
    queued: 'В очереди',
    running: 'Идёт проверка',
    done: 'Готово',
    failed: 'Ошибка',
  },
};
