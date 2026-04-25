import { themes as prismThemes } from 'prism-react-renderer';
import type { Config } from '@docusaurus/types';
import type * as Preset from '@docusaurus/preset-classic';

const config: Config = {
  title: 'HubHelper',
  tagline: 'Bring Your Own Policy. Powered by Copilot AI.',
  favicon: 'img/favicon.svg',

  future: {
    v4: true,
  },

  url: 'https://sdh100shaun.github.io',
  baseUrl: '/HubHelper/',

  organizationName: 'sdh100shaun',
  projectName: 'HubHelper',

  onBrokenLinks: 'warn',
  markdown: {
    hooks: {
      onBrokenMarkdownLinks: 'warn',
    },
  },

  i18n: {
    defaultLocale: 'en',
    locales: ['en'],
  },

  presets: [
    [
      'classic',
      {
        docs: {
          sidebarPath: './sidebars.ts',
          editUrl: 'https://github.com/sdh100shaun/hubhelper/edit/main/website/',
        },
        blog: false,
        theme: {
          customCss: './src/css/custom.css',
        },
      } satisfies Preset.Options,
    ],
  ],

  themeConfig: {
    image: 'img/docusaurus-social-card.jpg',
    colorMode: {
      defaultMode: 'dark',
      disableSwitch: true,
      respectPrefersColorScheme: false,
    },
    navbar: {
      title: 'HubHelper',
      logo: {
        alt: 'HubHelper Logo',
        src: 'img/logo.svg',
      },
      style: 'dark',
      items: [
        {
          type: 'docSidebar',
          sidebarId: 'docsSidebar',
          position: 'left',
          label: 'Docs',
        },
        {
          to: '/docs/features/bring-your-own-policy',
          label: 'Bring Your Own Policy',
          position: 'left',
        },
        {
          to: '/docs/features/ai-integration',
          label: 'AI Integration',
          position: 'left',
        },
        {
          to: '/docs/api-reference',
          label: 'API',
          position: 'left',
        },
        {
          href: 'https://github.com/sdh100shaun/hubhelper',
          position: 'right',
          className: 'header-github-link',
          'aria-label': 'GitHub repository',
        },
      ],
    },
    footer: {
      style: 'dark',
      links: [
        {
          title: 'Documentation',
          items: [
            { label: 'Getting Started', to: '/docs/getting-started' },
            { label: 'API Reference', to: '/docs/api-reference' },
            { label: 'GitHub App Setup', to: '/docs/github-app' },
            { label: 'Security', to: '/docs/security' },
          ],
        },
        {
          title: 'Features',
          items: [
            { label: 'Bring Your Own Policy', to: '/docs/features/bring-your-own-policy' },
            { label: 'AI Integration', to: '/docs/features/ai-integration' },
          ],
        },
        {
          title: 'Community',
          items: [
            { label: 'GitHub', href: 'https://github.com/sdh100shaun/hubhelper' },
            { label: 'Issues', href: 'https://github.com/sdh100shaun/hubhelper/issues' },
            { label: 'Contributing', to: '/docs/contributing' },
          ],
        },
      ],
      copyright: `Copyright © ${new Date().getFullYear()} HubHelper. Built with open source.`,
    },
    prism: {
      theme: prismThemes.oneDark,
      darkTheme: prismThemes.oneDark,
      additionalLanguages: ['bash', 'json', 'typescript'],
    },
  } satisfies Preset.ThemeConfig,
};

export default config;
