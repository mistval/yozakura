import { TemplateGroup } from '../template_group';
import { extractCharacterDescriptionTemplateChain } from './extract_character_description';
import { exampleDialogueTemplateChain } from './example_dialogue';
import { characterDescriptionGenerationTemplateChain } from './character_description_generation';
import { externalDescriptionGenerationTemplateChain } from './external_description_generation';
import { baseAppearanceGenerationTemplateChain } from './base_appearance_generation';
import { wardrobeGenerationTemplateChain } from './wardrobe_generation';

export const characterGenerationTemplatesGroup = new TemplateGroup({
  groupId: 'character_generation_templates',
  title: 'Character Generation Templates',
  description: 'Templates used to generate character information.',
  children: [
    extractCharacterDescriptionTemplateChain,
    exampleDialogueTemplateChain,
    characterDescriptionGenerationTemplateChain,
    externalDescriptionGenerationTemplateChain,
    baseAppearanceGenerationTemplateChain,
    wardrobeGenerationTemplateChain,
  ],
});
