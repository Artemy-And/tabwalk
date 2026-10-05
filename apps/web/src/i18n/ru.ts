import type { Messages } from './en';
import { pluralizer } from './plural';

const plural = pluralizer('ru');

export const ru: Messages = {
  meta: {
    title: 'Tabwalk — мониторинг доступности',
  },
  language: {
    label: 'Язык',
  },
  layout: {
    skipToContent: 'Перейти к содержимому',
    mainNav: 'Основная',
    breadcrumb: 'Навигационная цепочка',
    sites: 'Сайты',
    settings: 'Настройки',
  },
  settings: {
    title: 'Настройки',
  },
  notifications: {
    title: 'Уведомления',
    intro:
      'Tabwalk присылает сообщение, когда скан находит новые проблемы, когда сайт сканируется впервые и когда скан не удался.',
    noLinks: 'Задайте PUBLIC_URL в .env, чтобы в каждом сообщении была ссылка на отчёт.',
    loading: 'Загружаем каналы…',
    kinds: {
      slack: 'Slack',
      discord: 'Discord',
      ntfy: 'ntfy',
      webhook: 'Webhook (JSON)',
      email: 'Email',
    },
    emailOff: 'Email (нужен SMTP_URL)',
    caption: 'Куда приходят сообщения',
    columns: {
      kind: 'Канал',
      target: 'Адрес',
      status: 'Последнее сообщение',
      actions: 'Действия',
    },
    empty: 'Каналов пока нет.',
    neverSent: 'Ещё ничего не отправлено',
    sent: (when: string) => `Отправлено ${when}`,
    failed: (error: string) => `Ошибка: ${error}`,
    test: 'Отправить тест',
    testing: 'Отправляем…',
    testSent: 'Тестовое сообщение отправлено.',
    remove: 'Удалить',
    removeLabel: (kind: string, target: string) => `Удалить ${kind}, ${target}`,
    addHeading: 'Добавить канал',
    kindLabel: 'Канал',
    targetLabel: {
      slack: 'URL вебхука Slack',
      discord: 'URL вебхука Discord',
      ntfy: 'URL темы ntfy',
      webhook: 'URL вебхука',
      email: 'Адрес email',
    },
    targetHint: {
      slack: 'Из приложения Slack с Incoming Webhooks, начинается с https://hooks.slack.com/',
      discord: 'Настройки канала → Интеграция → Вебхуки → Копировать URL вебхука',
      ntfy: 'Сервер и тема, например https://ntfy.sh/a11y-alerts',
      webhook: 'Tabwalk отправляет JSON с сайтом, сканом и новыми проблемами',
      email: 'Отправка через SMTP_URL от имени SMTP_FROM',
    },
    add: 'Добавить канал',
    adding: 'Добавляем…',
  },
  auth: {
    checking: 'Проверяем вход…',
    setupTitle: 'Создайте аккаунт администратора',
    setupIntro:
      'В этом Tabwalk ещё нет аккаунтов. Аккаунт, который вы создадите сейчас, сможет добавлять сайты и читать все отчёты, поэтому создайте его, прежде чем открывать дашборд другим.',
    loginTitle: 'Вход в Tabwalk',
    email: 'Email',
    password: 'Пароль',
    passwordHint: 'Не короче 8 символов',
    create: 'Создать аккаунт',
    creating: 'Создаём…',
    signIn: 'Войти',
    signingIn: 'Входим…',
    forgot: 'Забыли пароль? Задайте новый на сервере:',
  },
  account: {
    title: 'Аккаунт',
    signedInAs: (email: string) => `Вы вошли как ${email}`,
    signOut: 'Выйти',
    passwordHeading: 'Смена пароля',
    current: 'Текущий пароль',
    next: 'Новый пароль',
    save: 'Сменить пароль',
    saving: 'Сохраняем…',
    saved: 'Пароль изменён. В других браузерах выполнен выход.',
    ssoOnly: 'Вы входите через единый вход (SSO), поэтому пароля для смены здесь нет.',
  },
  sites: {
    title: 'Сайты',
    subtitle: (n) => `${n} ${plural(n, { one: 'сайт', few: 'сайта', other: 'сайтов' })}`,
    add: 'Добавить сайт',
    addHeading: 'Добавить сайт',
    nameLabel: 'Название',
    namePlaceholder: 'Сайт клиента',
    urlLabel: 'Адрес',
    urlHint: 'Страницы берутся из sitemap.xml, а если его нет — из ссылок на главной',
    submit: 'Добавить',
    submitting: 'Добавляем…',
    fillBoth: 'Заполните оба поля',
    loading: 'Загружаем сайты…',
    empty: 'Сайтов пока нет. Добавьте первый, затем запустите проверку на его странице.',
    caption: 'Сайты клиентов, сначала недавно проверенные',
    columns: {
      site: 'Сайт',
      lastScan: 'Последняя проверка',
      schedule: 'Автопроверки',
      problems: 'Проблемы',
      needsHuman: 'Нужен человек',
      trend: 'Последние проверки',
    },
    neverScanned: 'Ещё не проверялся',
    noProblems: 'Проблем не найдено',
    critical: (n) =>
      `${n} ${plural(n, { one: 'критическая', few: 'критические', other: 'критических' })}`,
    serious: (n) => `${n} ${plural(n, { one: 'серьёзная', few: 'серьёзные', other: 'серьёзных' })}`,
    minorOnly: 'только мелкие',
    total: (n) => `всего ${n}`,
    trendLabel: (from, to, scans) =>
      `Проблем было ${from}, стало ${to} за последние ${scans} ${plural(scans, {
        one: 'проверку',
        few: 'проверки',
        other: 'проверок',
      })}`,
    trendEmpty: 'Мало проверок',
    disclaimer:
      'Автоматические проверки ловят только часть того, что требует WCAG. Всё, что машина ' +
      'оценить не может, помечено «Нужна проверка». Tabwalk никогда не называет сайт соответствующим.',
  },
  site: {
    run: 'Запустить проверку',
    queueing: 'Ставим в очередь…',
    queued: 'Проверка поставлена в очередь.',
    loading: 'Загрузка…',
    notFound: 'Сайт не найден.',
    empty: 'Проверок пока нет. Запустите первую, чтобы увидеть, что сломано.',
    caption: 'История проверок, сначала новые',
    columns: {
      date: 'Проверка',
      pages: 'Страницы',
      problems: 'Проблемы',
      needsHuman: 'Нужен человек',
    },
    pagesFailed: (n) => `(${n} с ошибкой)`,
  },
  schedule: {
    label: 'Автоматические проверки',
    options: {
      weekly: 'Раз в неделю',
      daily: 'Каждый день',
      off: 'Выключены',
    },
    next: (date) => `Следующая проверка: ${date}`,
    soon: 'Следующая проверка в ближайшие 15 минут',
    manual: 'Проверки запускаются только вручную',
    saving: 'Сохраняем…',
    saved: 'Сохранено.',
  },
  scan: {
    loading: 'Загружаем результаты…',
    notFound: 'Проверка не найдена.',
    unknownSite: 'Удалённый сайт',
    finished: (date, pages) =>
      `Проверка завершена ${date} · ${pages} ${plural(pages, {
        one: 'страница',
        few: 'страницы',
        other: 'страниц',
      })}`,
    running: 'Идёт проверка, страницы обрабатываются…',
    queued: 'Проверка в очереди…',
    failed: (error) => `Проверка не удалась: ${error}`,
    unknownError: 'неизвестная ошибка',
    uniqueProblems: (n) =>
      plural(n, {
        one: 'уникальная проблема',
        few: 'уникальные проблемы',
        other: 'уникальных проблем',
      }),
    criticalFindings: (n) =>
      plural(n, { one: 'критическая', few: 'критические', other: 'критических' }),
    needHuman: (n) =>
      plural(n, { one: 'требует ручной проверки', other: 'требуют ручной проверки' }),
    elements: (n) =>
      `на ${n.toLocaleString('ru')} ${plural(n, { one: 'элементе', other: 'элементах' })}`,
    pages: (n) =>
      plural(n, {
        one: 'страница проверена',
        few: 'страницы проверены',
        other: 'страниц проверено',
      }),
    findingsHeading: 'Найденные проблемы',
    loadingFindings: 'Загружаем проблемы…',
    exportCsv: 'Скачать CSV',
    filters: {
      label: 'Показать',
      all: 'Все',
      critical: 'Критические',
      review: 'Нужен человек',
      new: 'Новые с прошлой проверки',
      fixed: 'Исправлено',
      recommendations: 'Рекомендации',
    },
  },
  pages: {
    heading: 'Страницы',
    caption: 'Страницы, проверенные в этом скане. Откройте страницу, чтобы увидеть порядок Tab.',
    loading: 'Загружаем страницы…',
    columns: {
      page: 'Страница',
      problems: 'Проблемы',
      tabStops: 'Шаги Tab',
    },
    failed: (error: string) => `Не удалось проверить: ${error}`,
  },
  page: {
    loading: 'Загружаем страницу…',
    notFound: 'Страница не найдена.',
    tabOrder: 'Порядок Tab',
    tabOrderIntro: (n: number) =>
      `${n} ${plural(n, { one: 'шаг', few: 'шага', many: 'шагов', other: 'шага' })} Tab. Каждый номер показывает, куда попадает фокус при нажатии Tab, начиная с верха страницы.`,
    pictureAlt: (n: number) =>
      `Страница с пронумерованными шагами Tab: ${n}. Те же шаги перечислены ниже.`,
    listHeading: 'Шаги Tab по порядку',
    unnamed: 'без текста',
    notDrawn: 'нет на картинке',
    noPicture:
      'Для этой страницы нет картинки порядка Tab. Картинки хранятся только для последнего скана каждого сайта.',
  },
  issues: {
    empty: 'Проблем не найдено.',
    emptyFilter: 'Под этот фильтр ничего не подходит.',
    caption:
      'Проблемы сгруппированы по повторяющейся разметке, поэтому одна ошибка в шаблоне считается один раз.',
    fixedCaption: 'Были в прошлой проверке, в этой их нет.',
    recommendationsCaption:
      'Хорошие практики сверх WCAG. Не считаются проблемами и никогда не валят проверку.',
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
    newTag: 'Новая',
    fixedNote: 'В этой проверке не найдена',
  },
  impact: {
    critical: 'Критическая',
    serious: 'Серьёзная',
    moderate: 'Умеренная',
    minor: 'Незначительная',
    needsReview: 'Нужна проверка',
    recommendation: 'Рекомендация',
  },
  status: {
    queued: 'В очереди',
    running: 'Идёт проверка',
    done: 'Готово',
    failed: 'Ошибка',
  },
  rules: {
    'keyboard-trap': 'Фокус клавиатуры не должен застревать в одной части страницы',
    'focus-visible': 'Фокус клавиатуры должен быть виден',
    'focus-obscured': 'Элемент в фокусе не должен скрываться под другим содержимым',
    'skip-link-target':
      'Ссылка «Перейти к содержимому» должна переносить фокус клавиатуры за повторяющиеся блоки',
  },
};
