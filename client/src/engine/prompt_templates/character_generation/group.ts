import { createTemplateGroupSettingsBridge } from '../../../state/template_group_settings_bridge.js';
import { PromptTemplateChain } from '../prompt_template_chain.js';
import { TemplateGroup } from '../template_group.js';
import { CHARACTER_GENERATION_TEMPLATES_GROUP_ID } from '../template_types.js';
import { baseAppearanceGenerationChainSpec } from './base_appearance_generation.js';
import { characterDescriptionGenerationChainSpec } from './character_description_generation.js';
import { exampleDialogueChainSpec } from './example_dialogue.js';
import { externalDescriptionGenerationChainSpec } from './external_description_generation.js';
import { extractCharacterDescriptionChainSpec } from './extract_character_description.js';
import { wardrobeGenerationChainSpec } from './wardrobe_generation.js';
import { characterCardImagePromptChainSpec } from './character_card_image_prompt.js';

export { CHARACTER_GENERATION_TEMPLATES_GROUP_ID };

export const characterGenerationTemplatesBridge = createTemplateGroupSettingsBridge(
  CHARACTER_GENERATION_TEMPLATES_GROUP_ID
);

export const extractCharacterDescriptionTemplateChain = new PromptTemplateChain({
  ...extractCharacterDescriptionChainSpec,
  groupSettingsBridge: characterGenerationTemplatesBridge,
});

export const exampleDialogueTemplateChain = new PromptTemplateChain({
  ...exampleDialogueChainSpec,
  groupSettingsBridge: characterGenerationTemplatesBridge,
});

export const characterDescriptionGenerationTemplateChain = new PromptTemplateChain({
  ...characterDescriptionGenerationChainSpec,
  groupSettingsBridge: characterGenerationTemplatesBridge,
});

export const externalDescriptionGenerationTemplateChain = new PromptTemplateChain({
  ...externalDescriptionGenerationChainSpec,
  groupSettingsBridge: characterGenerationTemplatesBridge,
});

export const baseAppearanceGenerationTemplateChain = new PromptTemplateChain({
  ...baseAppearanceGenerationChainSpec,
  groupSettingsBridge: characterGenerationTemplatesBridge,
});

export const wardrobeGenerationTemplateChain = new PromptTemplateChain({
  ...wardrobeGenerationChainSpec,
  groupSettingsBridge: characterGenerationTemplatesBridge,
});

export const characterCardImagePromptTemplateChain = new PromptTemplateChain({
  ...characterCardImagePromptChainSpec,
  groupSettingsBridge: characterGenerationTemplatesBridge,
});

export const characterGenerationTemplatesGroup = new TemplateGroup({
  groupId: CHARACTER_GENERATION_TEMPLATES_GROUP_ID,
  title: 'Character Generation Templates',
  description: 'Templates used to generate character information.',
  settingsBridge: characterGenerationTemplatesBridge,
  chains: [
    extractCharacterDescriptionTemplateChain,
    exampleDialogueTemplateChain,
    characterDescriptionGenerationTemplateChain,
    externalDescriptionGenerationTemplateChain,
    baseAppearanceGenerationTemplateChain,
    wardrobeGenerationTemplateChain,
    characterCardImagePromptTemplateChain,
  ],
});
