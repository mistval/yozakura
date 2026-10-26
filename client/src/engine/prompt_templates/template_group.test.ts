import { describe, expect, it } from 'vitest';
import { z } from 'zod';
import { SettingsBridge } from '../settings/settings_bridge';
import { PromptTemplateChain } from './prompt_template_chain';
import { TemplateGroup } from './template_group';
import type { TemplateGroupSettingsData } from './template_types';
import { characterEditorExecutionContextSchema } from './prompt_template_context_fields';
import { buildCharacterEditorContext } from './prompt_context_builder';
import { createBlankCharacter } from '../character_gen';
import { createWardrobe } from '../wardrobes';
import {
  chatSceneImageTemplatesGroup,
  runtimeChatTemplatesGroup,
} from './chat/group';
import { characterCardImagePromptTemplateChain } from './character_generation/group';

describe('TemplateGroup and PromptTemplateChain with SettingsBridge', () => {
  const createTestInstantiator = () => {
    let counter = 0;
    return ({
      chainId = `test_chain.${++counter}`,
      groupSettingsBridge,
    }: {
      chainId?: string;
      groupSettingsBridge: SettingsBridge<TemplateGroupSettingsData>;
    }) =>
      new PromptTemplateChain({
        templateChainId: chainId,
        defaultTitle: `Chain ${chainId}`,
        defaultDescription: `Description for ${chainId}`,
        contextSchema: characterEditorExecutionContextSchema,
        groupSettingsBridge,
        templates: [
          {
            templateId: `${chainId}.system`,
            name: 'System',
            description: 'System prompt',
            role: 'system',
            defaultTemplateString: 'Hello <%= it.focusedCharacter.firstName %>',
          },
        ],
        parser: {
          defaultParserSource: 'async (response, it) => response.trim()',
          parserOutputSchema: z.string(),
        },
      });
  };

  it('populates initial chains and supports rendering', async () => {
    const bridge = SettingsBridge.createInMemory<TemplateGroupSettingsData>({
      templateChains: {},
    });

    const instantiator = createTestInstantiator();
    const initialChain = instantiator({ chainId: 'initial_chain.1', groupSettingsBridge: bridge });

    const group = new TemplateGroup({
      groupId: 'test_group',
      title: 'Test Group',
      description: 'Group Description',
      settingsBridge: bridge,
      chains: [initialChain],
      chainInstantiator: instantiator,
    });

    // Populate initial chain data into bridge as default
    bridge.set({
      templateChains: {
        [initialChain.templateChainId]: initialChain.defaultData,
      },
    });

    expect(group.getChains()).toHaveLength(1);
    expect(group.getChains()[0]!.templateChainId).toBe('initial_chain.1');
    expect(group.getChains()[0]!.templateChainTitle).toBe('Chain initial_chain.1');

    const testContext = buildCharacterEditorContext({
      ...createBlankCharacter(),
      firstName: 'Alice',
    });
    const rendered = await group.getChains()[0]!.render(testContext);
    expect(rendered).toEqual([{ role: 'system', content: 'Hello Alice' }]);
  });

  it('adds and deletes chains via chainInstantiator with period-delimited IDs', () => {
    const bridge = SettingsBridge.createInMemory<TemplateGroupSettingsData>({
      templateChains: {},
    });
    const instantiator = createTestInstantiator();

    const group = new TemplateGroup({
      groupId: 'test_group',
      title: 'Test Group',
      description: 'Group Description',
      settingsBridge: bridge,
      chainInstantiator: instantiator,
    });

    const chain1 = group.addChain();
    expect(chain1.templateChainId).toMatch(/^test_chain\.\d+$/);
    expect(chain1.templates[0]!.template.templateId).toBe(`${chain1.templateChainId}.system`);
    expect(group.getChains()).toHaveLength(1);

    const chain2 = group.addChain();
    expect(group.getChains()).toHaveLength(2);

    // Deleting one chain leaves one chain
    group.deleteChain(chain1.templateChainId);
    expect(group.getChains()).toHaveLength(1);
    expect(group.getChains()[0]!.templateChainId).toBe(chain2.templateChainId);

    // Attempting to delete the last remaining chain must throw
    expect(() => group.deleteChain(chain2.templateChainId)).toThrow(/must retain at least one chain/);
  });

  it('throws when trying to add or delete chains without a chainInstantiator', () => {
    const bridge = SettingsBridge.createInMemory<TemplateGroupSettingsData>({
      templateChains: {},
    });

    const group = new TemplateGroup({
      groupId: 'static_group',
      title: 'Static Group',
      description: 'Static Description',
      settingsBridge: bridge,
    });

    expect(group.canModifyChains()).toBe(false);
    expect(() => group.addChain()).toThrow(/no chain instantiator provided/);
    expect(() => group.deleteChain('any_id')).toThrow(/no chain instantiator provided/);
  });

  it('updates template data through subBridge and resets to default', async () => {
    const bridge = SettingsBridge.createInMemory<TemplateGroupSettingsData>({
      templateChains: {},
    });
    const instantiator = createTestInstantiator();

    const group = new TemplateGroup({
      groupId: 'test_group',
      title: 'Test Group',
      description: 'Group Description',
      settingsBridge: bridge,
      chainInstantiator: instantiator,
    });

    const chain = group.addChain();
    const systemTemplateId = `${chain.templateChainId}.system`;

    const bobContext = buildCharacterEditorContext({
      ...createBlankCharacter(),
      firstName: 'Bob',
    });
    expect(await chain.render(bobContext)).toEqual([{ role: 'system', content: 'Hello Bob' }]);

    // Update template via chain settingsBridge
    chain.settingsBridge.set({
      templates: {
        [systemTemplateId]: {
          templateString: 'Greetings, <%= it.focusedCharacter.firstName %>!',
        },
      },
    });

    expect(await chain.render(bobContext)).toEqual([{ role: 'system', content: 'Greetings, Bob!' }]);

    // Reset to default
    chain.settingsBridge.resetToDefault();
    expect(await chain.render(bobContext)).toEqual([{ role: 'system', content: 'Hello Bob' }]);
  });

  it('lazily instantiates existing persisted chains on reload', () => {
    const bridge = SettingsBridge.createInMemory<TemplateGroupSettingsData>({
      templateChains: {
        'persisted_chain.42': {
          title: 'Persisted Chain 42',
          description: 'Persisted Desc',
          templates: {
            'persisted_chain.42.system': {
              name: 'System',
              description: 'System prompt',
              role: 'system',
              templateString: 'Hello <%= it.focusedCharacter.firstName %>',
            },
          },
        },
      },
    });

    const group = new TemplateGroup({
      groupId: 'test_group',
      title: 'Test Group',
      description: 'Group Description',
      settingsBridge: bridge,
      chainInstantiator: createTestInstantiator(),
    });

    const chains = group.getChains();
    expect(chains).toHaveLength(1);
    expect(chains[0]!.templateChainId).toBe('persisted_chain.42');
    expect(chains[0]!.templateChainTitle).toBe('Persisted Chain 42');
  });

  it('supports updating chain title and description via chain settingsBridge', () => {
    const bridge = SettingsBridge.createInMemory<TemplateGroupSettingsData>({
      templateChains: {},
    });
    const instantiator = createTestInstantiator();

    const group = new TemplateGroup({
      groupId: 'test_group',
      title: 'Test Group',
      description: 'Group Description',
      settingsBridge: bridge,
      chainInstantiator: instantiator,
    });

    const chain = group.addChain();
    expect(chain.templateChainTitle).toMatch(/^Chain test_chain\.\d+$/);

    chain.settingsBridge.set({
      title: 'Updated Chain Title',
      description: 'Updated Chain Description',
    });

    expect(chain.templateChainTitle).toBe('Updated Chain Title');
    expect(chain.templateChainDescription).toBe('Updated Chain Description');

    chain.settingsBridge.resetToDefault();
    expect(chain.templateChainTitle).toMatch(/^Chain test_chain\.\d+$/);
  });

  it('configures chatSceneImageTemplatesGroup as a duplicative subgroup under runtimeChatTemplatesGroup', async () => {
    expect(runtimeChatTemplatesGroup.childGroups).toContain(chatSceneImageTemplatesGroup);
    expect(chatSceneImageTemplatesGroup.canModifyChains()).toBe(true);

    const chains = chatSceneImageTemplatesGroup.getChains();
    expect(chains).toHaveLength(3);
    expect(chains.map((c) => c.templateChainId)).toEqual([
      'gen_chat_scene_image_prompt',
      'gen_chat_scene_image_prompt.speaker_close_up',
      'gen_chat_scene_image_prompt.scenery',
    ]);
    expect(chains.map((c) => c.templateChainTitle)).toEqual([
      'Speaker',
      'Speaker Close-Up',
      'Scenery',
    ]);

    const dummyContext: any = {
      imagePromptPrefix: 'masterpiece, best quality',
      focusedCharacter: {
        firstName: 'Alice',
        lastName: 'Smith',
        baseAppearanceTags: 'blonde hair, blue eyes',
        wardrobes: [{ name: 'Casual', text: 'blue dress', enabled: true }],
      },
    };

    const speakerParsed = await chains[0]!.parse('standing in a park', dummyContext);
    expect(speakerParsed).toBe('masterpiece, best quality,blonde hair, blue eyes,blue dress,standing in a park');

    const closeUpParsed = await chains[1]!.parse('smiling gently', dummyContext);
    expect(closeUpParsed).toBe(
      'masterpiece, best quality, smiling gently, close-up, portrait, face focus, upper body, detailed face, detailed eyes'
    );

    const sceneryParsed = await chains[2]!.parse('a quiet park at sunset', dummyContext);
    expect(sceneryParsed).toBe('masterpiece, best quality, a quiet park at sunset');
  });

  it('filters out empty rendered messages and skips LLM call in renderAndExecute', async () => {
    const bridge = SettingsBridge.createInMemory<TemplateGroupSettingsData>({
      templateChains: {},
    });

    const emptyChain = new PromptTemplateChain({
      templateChainId: 'test_empty_chain',
      defaultTitle: 'Empty Chain',
      defaultDescription: 'Chain with empty templates',
      contextSchema: characterEditorExecutionContextSchema,
      groupSettingsBridge: bridge,
      templates: [
        {
          templateId: 'test_empty.system',
          name: 'System',
          description: 'Empty system prompt',
          role: 'system',
          defaultTemplateString: '   ',
        },
        {
          templateId: 'test_empty.user',
          name: 'User',
          description: 'Empty user prompt',
          role: 'user',
          defaultTemplateString: '',
        },
      ],
      parser: {
        defaultParserSource: 'async (response, it) => `parsed:${response}:prefix=${it.imagePromptPrefix}`',
        parserOutputSchema: z.string(),
      },
    });

    const testContext = buildCharacterEditorContext({
      ...createBlankCharacter(),
      firstName: 'Alice',
    });
    const rendered = await emptyChain.render(testContext);
    expect(rendered).toEqual([]);

    const output = await emptyChain.renderAndExecute(testContext);
    expect(output).toContain('parsed::prefix=');
  });

  it('characterCardImagePromptTemplateChain executes by default without LLM call and combines tags in parser', async () => {
    const character = {
      ...createBlankCharacter(),
      firstName: 'Alice',
      baseAppearanceTags: '1girl, silver hair, red eyes',
      wardrobes: [createWardrobe({ text: 'kimono' })],
    };
    const context = buildCharacterEditorContext(character);

    const rendered = await characterCardImagePromptTemplateChain.render(context);
    expect(rendered).toEqual([]);

    const prompt = await characterCardImagePromptTemplateChain.renderAndExecute(context);
    expect(prompt).toContain('1girl, silver hair, red eyes,kimono');
  });
});
