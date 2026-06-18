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
    {
      type: 'category',
      label: 'How To Guides',
      items: ['how-to-different-models-per-prompt'],
    },
    {
      type: 'category',
      label: 'Advanced',
      items: ['settings-math'],
    },
    {
      type: 'category',
      label: 'Links & Help',
      items: ['links'],
    },
  ],
};

export default sidebars;
