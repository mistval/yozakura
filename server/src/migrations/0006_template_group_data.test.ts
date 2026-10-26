import { describe, expect, it } from 'vitest';
import { migrateSettingsOverrides } from './0006_template_group_data.js';

describe('migration 0006_template_group_data', () => {
  it('migrates promptTemplateOverrides and promptParserOverrides into templateGroupData', () => {
    const inputOverrides = {
      theme: 'dark',
      promptTemplateOverrides: {
        chat_system_prompt: {
          templateString: 'Custom system prompt',
        },
        chat_scene_image_user: {
          templateString: 'Custom image prompt',
        },
      },
      promptParserOverrides: {
        chat_system_prompt_parser: {
          source: 'async (response, it) => response.toUpperCase()',
        },
      },
    };

    const result = migrateSettingsOverrides(inputOverrides);

    expect(result.theme).toBe('dark');
    expect(result.promptTemplateOverrides).toBeUndefined();
    expect(result.promptParserOverrides).toBeUndefined();

    expect(result.templateGroupData).toEqual({
      runtime_chat_templates: {
        templateChains: {
          gen_npc_response: {
            parserSource: 'async (response, it) => response.toUpperCase()',
            templates: {
              chat_system_prompt: {
                templateString: 'Custom system prompt',
              },
            },
          },
          gen_chat_scene_image_prompt: {
            templates: {
              chat_scene_image_user: {
                templateString: 'Custom image prompt',
              },
            },
          },
        },
      },
    });
  });

  it('leaves overrides without template/parser overrides unchanged', () => {
    const inputOverrides = {
      theme: 'neon',
      autoImageRate: 0.5,
    };

    const result = migrateSettingsOverrides(inputOverrides);
    expect(result).toEqual(inputOverrides);
  });
});
