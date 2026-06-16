import remarkMath from 'remark-math';
import rehypeKatex from 'rehype-katex';
import { themes as prismThemes } from 'prism-react-renderer';
import type { Config } from '@docusaurus/types';
import type * as Preset from '@docusaurus/preset-classic';

// This runs in Node.js - Don't use client-side code here (browser APIs, JSX...)

const config: Config = {
  title: 'Yozakura Docs',
  tagline:
    'An AI-powered social simulation where LLM-driven characters live on a map, chat, and form lasting memories.',
  favicon: 'img/favicon.svg',

  // Future flags, see https://docusaurus.io/docs/api/docusaurus-config#future
  future: {
    v4: true, // Improve compatibility with the upcoming Docusaurus v4
  },

  // Set the production url of your site here
  url: 'https://mistval.github.io',
  // Set the /<baseUrl>/ pathname under which your site is served
  // For GitHub pages deployment, it is often '/<projectName>/'
  baseUrl: '/yozakura/',

  organizationName: 'mistval',
  projectName: 'yozakura',

  onBrokenLinks: 'throw',
  markdown: {
    hooks: {
      onBrokenMarkdownLinks: 'warn',
    },
  },

  // OpenGraph tags that must use the `property` attribute (the OG spec and
  // Facebook/LinkedIn parsers ignore `name="og:*"`). Docusaurus emits its
  // `metadata` entries with `name`, so these site-wide OG defaults are set
  // here instead. og:title/description/image/url/locale are generated
  // per-page by Docusaurus automatically.
  headTags: [
    {
      tagName: 'meta',
      attributes: { property: 'og:type', content: 'website' },
    },
    {
      tagName: 'meta',
      attributes: { property: 'og:site_name', content: 'Yozakura Docs' },
    },
  ],

  // Even if you don't use internationalization, you can use this field to set
  // useful metadata like html lang. For example, if your site is Chinese, you
  // may want to replace "en" with "zh-Hans".
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
          remarkPlugins: [remarkMath],
          rehypePlugins: [rehypeKatex],
        },
        blog: false,
        pages: {
          showLastUpdateTime: false,
        },
        theme: {
          customCss: './src/css/custom.css',
        },
      } satisfies Preset.Options,
    ],
  ],

  themeConfig: {
    // Branded 1200x630 social card used for OpenGraph/Twitter link previews.
    // Pages can override it per-page via front matter `image`.
    image: 'img/yozakura-social-card.png',
    // Site-wide metadata. Per-page `description`/`keywords` front matter
    // overrides these defaults. Docusaurus already emits og:title,
    // og:description, og:image, og:url, og:locale and the twitter:image tags;
    // the entries below add the pieces it doesn't generate on its own.
    // og:* tags that must use the `property` attribute live in `headTags`
    // below, because Docusaurus emits `metadata` entries with `name`.
    metadata: [
      {
        name: 'description',
        content:
          'Documentation for Yozakura, an AI-powered social simulation where dozens of LLM-driven characters move around a map, chat, generate images, and form evolving memories and relationships.',
      },
      {
        name: 'keywords',
        content:
          'yozakura, ai social simulation, llm characters, ai roleplay, generative agents, npc simulation, character ai, ai sandbox, ai memory, sillytavern alternative, koboldcpp, openrouter',
      },
      { name: 'twitter:card', content: 'summary_large_image' },
    ],
    colorMode: {
      respectPrefersColorScheme: true,
    },
    navbar: {
      title: 'Yozakura',
      logo: {
        alt: 'Yozakura Logo',
        src: 'img/logo.svg',
      },
      items: [
        {
          type: 'docSidebar',
          sidebarId: 'docsSidebar',
          position: 'left',
          label: 'Documentation',
        },
        { to: '/docs/getting-started', label: 'Get Started', position: 'left' },
      ],
    },
    footer: {
      style: 'dark',
      links: [
        {
          title: 'Docs',
          items: [
            {
              label: 'Introduction',
              to: '/docs/intro',
            },
            {
              label: 'Memory System',
              to: '/docs/memory-system',
            },
            {
              label: 'Template System',
              to: '/docs/template-system',
            },
          ],
        },
        {
          title: 'Get Running',
          items: [
            {
              label: 'Getting Started',
              to: '/docs/getting-started',
            },
          ],
        },
      ],
      copyright: `Copyright © ${new Date().getFullYear()} Yozakura. Built with Docusaurus.`,
    },
    prism: {
      theme: prismThemes.github,
      darkTheme: prismThemes.dracula,
    },
  } satisfies Preset.ThemeConfig,
  stylesheets: [
    {
      href: 'https://cdn.jsdelivr.net/npm/katex@0.13.24/dist/katex.min.css',
      type: 'text/css',
      integrity: 'sha384-odtC+0UGzzFL/6PNoE8rX/SPcQDXBJ+uRepguP4QkPCm2LBxH3FA3y+fKSiJ+AmM',
      crossorigin: 'anonymous',
    },
  ],
};

export default config;
