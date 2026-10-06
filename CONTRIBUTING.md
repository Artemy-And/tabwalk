# Contributing to Tabwalk

Thanks for helping. Questions, bug reports, translations and code are all welcome.

## Where things go

- **Questions and setup help** — [Discussions → Q&A](https://github.com/Artemy-And/tabwalk/discussions/categories/q-a)
- **Ideas you want to talk through** — [Discussions → Ideas](https://github.com/Artemy-And/tabwalk/discussions/categories/ideas)
- **Bugs and clear feature requests** — [Issues](https://github.com/Artemy-And/tabwalk/issues/new/choose)
- **Security problems** — privately, see [SECURITY.md](SECURITY.md)

Looking for a first task? Try an issue labelled
[`good first issue`](https://github.com/Artemy-And/tabwalk/labels/good%20first%20issue).

## Setting up

Follow [Development without Docker](README.md#development-without-docker) in the README, or run
the whole stack from source with `docker compose -f docker-compose.dev.yml up -d --build`.

## Making a change

1. For anything larger than a small fix, open an issue or a discussion first so we agree on the
   approach before you spend time on it.
2. Branch from `develop` and open the pull request against `develop`. `main` only moves on releases.
3. Keep pull requests focused: one change, with a clear description of what and why.
4. Before pushing, run:

   ```bash
   pnpm lint
   pnpm typecheck
   ```

5. Write commit messages in English, in the imperative: "Add German translation", not "Added".

## The dashboard has to be accessible

Tabwalk checks other people's sites, so its own interface must pass the same bar:

- everything works with the keyboard and has a visible focus ring;
- new tables keep their caption and sortable headers keep `aria-sort`;
- text meets WCAG AA contrast in both the light and the dark theme.

Run Tabwalk against its own dashboard before you open a UI pull request.

## Translations

Interface strings live in `apps/web/src/i18n/`, one file per language. To add a language, copy
`en.ts`, translate it and register it in `context.ts`. Rule descriptions come from the official
axe-core translations: add the language to `apps/web/scripts/axe-rule-help.mjs` and run
`pnpm --filter @tabwalk/web i18n:rules`.

## Code of conduct

Everyone taking part is expected to follow the [Code of Conduct](CODE_OF_CONDUCT.md).
