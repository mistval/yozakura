import { TemplateGroup } from '../template_group';
import { extractCharacterDescriptionTemplateGroup } from './extract_character_description';
import { exampleDialogueTemplateGroup } from './example_dialogue';
import { characterDescriptionGenerationTemplateGroup } from './character_description_generation';
import { externalDescriptionGenerationTemplateGroup } from './external_description_generation';
import { baseAppearanceGenerationTemplateGroup } from './base_appearance_generation';
import { wardrobeGenerationTemplateGroup } from './wardrobe_generation';

export const characterGenerationTemplatesGroup = new TemplateGroup({
  groupId: 'character_generation_templates',
  title: 'Character Generation Templates',
  description: 'Templates used to generate character information.',
  children: [
    extractCharacterDescriptionTemplateGroup,
    exampleDialogueTemplateGroup,
    characterDescriptionGenerationTemplateGroup,
    externalDescriptionGenerationTemplateGroup,
    baseAppearanceGenerationTemplateGroup,
    wardrobeGenerationTemplateGroup,
  ],
});
