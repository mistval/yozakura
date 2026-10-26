import { z } from 'zod';
import { focusedConversationExecutionContextSchema } from '../prompt_template_context_fields.js';
import type { PromptTemplateChainSpec } from '../template_types.js';

export const chatSceneImageChainSpec: PromptTemplateChainSpec<
  z.infer<typeof focusedConversationExecutionContextSchema>,
  string
> = {
  templateChainId: 'gen_chat_scene_image_prompt',
  defaultTitle: 'Chat Scene Image Generation',
  defaultDescription: 'Prompts used to generate scene image prompts.',
  contextSchema: focusedConversationExecutionContextSchema,
  templates: [
    {
      templateId: 'chat_scene_image_system',
      name: 'Chat Scene Image (System)',
      description: 'System prompt for converting chat context into an image prompt.',
      role: 'system',
      defaultTemplateString:
        'You write natural language image prompts. Return only the prompt text, with no quotes, no markdown, and no extra commentary.',
    },
    {
      templateId: 'chat_scene_image_user',
      name: 'Chat Scene Image (User)',
      description:
        'User prompt for scene details, transcript, and focused character appearance.',
      role: 'user',
      defaultTemplateString: `Current location:
<location_description>
<%= it.currentLocation.name %>: <%= it.currentLocation.description %>

Current environmental info: <%= it.temporalContext %>

</location_description>

The conversation medium is <%= it.chatMedium %>.

Conversation Transcript:
<transcript>
<%= it.transcript %>

</transcript>

The focus of the image prompt should be <%= it.focusedCharacter.firstName %>, whose appearance (and potentially some environmental information) is:
<appearance>
<%= it.focusedCharacterAppearance %>

</appearance>

<final_instruction>
Describe only <%= it.focusedCharacter.firstName %> and their place in the current scene, including what they are wearing and what they are doing (verbs/gerunds). The image model can understand directions (left, right, top, bottom, in front, behind, etc) so place <%= it.focusedCharacter.firstName %> in the image wherever you wish for an interesting composition. Use full English sentences written in sparse language when writing your prompt, focus purely on the concrete details of the scene.

</final_instruction>`,
    },
  ],
  parser: {
    defaultParserSource: 'async (response, it) => response',
    parserOutputSchema: z.string(),
  },
};
