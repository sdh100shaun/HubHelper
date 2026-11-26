// docmd configuration for the HubHelper documentation site.
// Reference: https://docs.docmd.io/configuration/overview/
//
// Layout of this workspace:
//   content/index.md   -> landing page (custom HTML, `noStyle: true`)
//   content/docs/**    -> documentation, served under /HubHelper/docs/...
//   public/**          -> copied verbatim to the site root (logo, favicon, .nojekyll)
//   assets/**          -> custom CSS/JS layered over the docmd theme

const REPO = 'https://github.com/sdh100shaun/hubhelper';

export default {
  title: 'HubHelper',
  // The path component of `url` sets the base path, so every generated link is
  // prefixed with /HubHelper/ to match GitHub Pages project hosting.
  url: 'https://sdh100shaun.github.io/HubHelper/',
  src: 'content',
  out: 'build',
  engine: 'js',
  favicon: '/img/favicon.svg',
  logo: {
    light: '/img/logo.svg',
    dark: '/img/logo.svg',
    alt: 'HubHelper Logo',
    href: '/',
  },

  // Keep the site's single dark theme, as before.
  theme: {
    name: 'default',
    appearance: 'dark',
    enableModeToggle: false,
    codeHighlight: true,
    customCss: ['/assets/css/hubhelper.css'],
  },

  layout: {
    spa: true,
    header: { enabled: true },
    sidebar: { collapsible: true, defaultCollapsed: false },
    optionsMenu: {
      position: 'header',
      components: { search: true, themeSwitch: false },
    },
    menubar: {
      left: [
        { text: 'HubHelper', url: '/', type: 'title' },
        { text: 'Docs', url: '/docs/intro/' },
        { text: 'Bring Your Own Policy', url: '/docs/features/bring-your-own-policy/' },
        { text: 'AI Integration', url: '/docs/features/ai-integration/' },
        { text: 'API', url: '/docs/api-reference/' },
      ],
      right: [{ text: 'GitHub', url: REPO, icon: 'github', external: true }],
    },
    footer: {
      style: 'complete',
      branding: false,
      columns: [
        {
          title: 'Documentation',
          links: [
            { text: 'Getting Started', url: '/docs/getting-started/' },
            { text: 'API Reference', url: '/docs/api-reference/' },
            { text: 'GitHub App Setup', url: '/docs/github-app/' },
            { text: 'Security', url: '/docs/security/' },
          ],
        },
        {
          title: 'Features',
          links: [
            { text: 'Bring Your Own Policy', url: '/docs/features/bring-your-own-policy/' },
            { text: 'AI Integration', url: '/docs/features/ai-integration/' },
            { text: 'Policy Standards', url: '/docs/features/policy-standards/' },
          ],
        },
        {
          title: 'Community',
          links: [
            { text: 'GitHub', url: REPO, external: true },
            { text: 'Issues', url: `${REPO}/issues`, external: true },
            { text: 'Contributing', url: '/docs/contributing/' },
          ],
        },
      ],
      copyright: `Copyright © ${new Date().getFullYear()} HubHelper. Built with open source.`,
    },
    editLink: {
      enabled: true,
      baseUrl: `${REPO}/edit/main/website/content`,
      text: 'Edit this page',
    },
  },

  minify: true,
  autoTitleFromH1: true,
  copyCode: true,
  pageNavigation: true,

  // Sidebar — mirrors the previous Docusaurus sidebar order.
  navigation: [
    { title: 'Introduction', path: '/docs/intro/' },
    { title: 'Getting Started', path: '/docs/getting-started/' },
    {
      title: '✨ Features',
      collapsible: true,
      children: [
        { title: 'Bring Your Own Policy', path: '/docs/features/bring-your-own-policy/' },
        { title: 'AI Integration', path: '/docs/features/ai-integration/' },
        { title: 'Copilot Insights', path: '/docs/features/copilot-insights/' },
        {
          title: 'Policy Standards & Compliance Frameworks',
          path: '/docs/features/policy-standards/',
        },
      ],
    },
    { title: 'API Reference', path: '/docs/api-reference/' },
    { title: 'GitHub App Setup', path: '/docs/github-app/' },
    { title: 'Security', path: '/docs/security/' },
    { title: 'Contributing', path: '/docs/contributing/' },
  ],

  // docmd enables every bundled plugin unless told otherwise. Keep only what the
  // static docs site needs; in particular, nothing that calls out to a hosted AI
  // relay, injects analytics, or needs git history at build time.
  plugins: {
    search: {},
    seo: { defaultDescription: 'Bring Your Own Policy. Powered by Copilot AI.' },
    sitemap: {},
    llms: {},
    mdx: false,
    ai: false,
    analytics: false,
    playground: false,
    okf: false,
    git: false,
    openapi: false,
    mermaid: false,
  },
};
