# HubHelper documentation site

The documentation site at <https://sdh100shaun.github.io/HubHelper/> is built with
[docmd](https://docmd.io) (`@docmd/core`), a static site generator for Markdown docs.

## Layout

```text
website/
├── docmd.config.js      # Site config: base URL, menubar, sidebar, footer, theme, plugins
├── content/
│   ├── index.md         # Landing page — hand-written HTML (`noStyle: true`)
│   └── docs/            # Documentation pages → /HubHelper/docs/<page>/
│       └── features/
├── assets/
│   ├── css/hubhelper.css    # Brand theme (docs + landing page)
│   └── js/
│       ├── landing.js       # Landing page tabs, demo scenarios, mobile nav
│       └── docmd-git.js     # Empty stub (see file header)
├── public/              # Copied verbatim to the site root (logo, favicon, .nojekyll)
└── scripts/serve.mjs    # Local preview server for the built site under /HubHelper/
```

## Commands

Run from the repository root (the site is an npm workspace) or from `website/`:

| Root command          | Workspace command | What it does                                            |
|-----------------------|-------------------|---------------------------------------------------------|
| `npm run docs:start`  | `npm run dev`     | Dev server with live reload at <http://127.0.0.1:3000/> |
| `npm run docs:build`  | `npm run build`   | Build the static site to `website/build/`               |
| `npm run docs:serve`  | `npm run serve`   | Serve `build/` at <http://localhost:3000/HubHelper/>    |
| `npm run docs:validate` | `npm run validate` | Check internal links and container syntax            |

The dev server serves from `/`; production builds use the `/HubHelper/` base path taken
from `url` in `docmd.config.js`. Links in Markdown should be absolute site paths
(`/docs/getting-started/`); docmd rewrites them for the base path.

## Writing docs

- Add a Markdown file under `content/docs/` and add it to `navigation` in
  `docmd.config.js` (the sidebar order is explicit, not taken from frontmatter).
- Frontmatter supports `title` and `description`.
- Callouts use docmd container syntax:

  ```markdown
  ::: callout tip "Optional title"
  Body text.
  :::
  ```

  Types: `info`, `tip`, `warning`, `danger`, `success`.
- Give every fenced code block a language (`bash`, `json`, `yaml`, `typescript`, or
  `text` for plain output), otherwise docmd guesses and may highlight prose.

## Landing page

`content/index.md` is plain HTML that docmd passes through untouched. Its styles are in
the "Landing page" section of `assets/css/hubhelper.css` and its behaviour in
`assets/js/landing.js`. Keep links relative (`docs/intro/`, not `/docs/intro/`) so the
page works both under `/HubHelper/` and on the dev server.

## Accessibility

Colours are chosen to meet WCAG AAA. The Playwright suite in `e2e/accessibility.spec.ts`
runs axe against the built site; run it locally with:

```bash
npm run docs:build
npm run docs:serve &
npx playwright test e2e/accessibility.spec.ts --project=chromium
```

## Plugins

docmd enables all bundled plugins by default. `docmd.config.js` keeps only search, SEO,
sitemap and `llms.txt`, and explicitly disables the AI assistant (hosted relay),
analytics, playground, OKF, git history, OpenAPI, Mermaid and MDX.

## Deployment

`.github/workflows/deploy-docs.yml` builds the site and publishes `website/build` to
GitHub Pages on pushes to `main` that touch `website/**`.
