import { TemplateGroup } from './template_group';
import { runtimeChatTemplatesGroup } from './chat/group';
import { characterGenerationTemplatesGroup } from './character_generation/group';
import { memoriesGroup } from './memories/group';

export const promptTemplatesRootGroup = new TemplateGroup({
  groupId: 'prompt_templates_root',
  title: 'Prompt Templates',
  description: 'Edit prompt templates used for prompting your LLM.',
  children: [runtimeChatTemplatesGroup, memoriesGroup, characterGenerationTemplatesGroup],
});
