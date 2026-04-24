import type { SidebarsConfig } from '@docusaurus/plugin-content-docs';

const sidebars: SidebarsConfig = {
  docsSidebar: [
    'intro',
    'getting-started',
    {
      type: 'category',
      label: '✨ Features',
      collapsed: false,
      items: [
        'features/bring-your-own-policy',
        'features/ai-integration',
      ],
    },
    'api-reference',
    'github-app',
    'security',
    'contributing',
  ],
};

export default sidebars;
