import type { SidebarsConfig } from '@docusaurus/plugin-content-docs';

const sidebars: SidebarsConfig = {
  docsSidebar: [
    'intro',
    {
      type: 'category',
      label: 'Get Started',
      items: ['getting-started', 'api-setup'],
    },
    {
      type: 'category',
      label: 'Core Systems',
      items: ['chat', 'memory-system', 'template-system'],
    },
  ],
};

export default sidebars;
