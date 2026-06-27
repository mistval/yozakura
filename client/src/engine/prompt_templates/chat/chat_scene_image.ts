import { z } from 'zod';
import { PromptTemplateBase } from '../prompt_template';
import { PromptOutputParser } from '../prompt_output_parser';
import { PromptTemplateChain } from '../prompt_template_chain';
import { focusedConversationExecutionContextSchema } from '../prompt_template_context_fields';

class ChatSceneImageSystemTemplate extends PromptTemplateBase<
  z.infer<typeof focusedConversationExecutionContextSchema>
> {
  public readonly defaultTemplateString =
    'You write natural language image prompts. Return only the prompt text, with no quotes, no markdown, and no extra commentary.';
  public readonly contextSchema = focusedConversationExecutionContextSchema;

  public readonly templateName = 'Chat Scene Image (System)';
  public readonly templateDescription = 'System prompt for converting chat context into an image prompt.';
  public readonly templateId = 'chat_scene_image_system';
  public readonly templateSettings = [];
  public readonly role = 'system';
}

class ChatSceneImageUserTemplate extends PromptTemplateBase<
  z.infer<typeof focusedConversationExecutionContextSchema>
> {
  public readonly defaultTemplateString = `Current location:
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

</final_instruction>`;
  public readonly contextSchema = focusedConversationExecutionContextSchema;

  public readonly templateName = 'Chat Scene Image (User)';
  public readonly templateDescription =
    'User prompt for scene details, transcript, and focused character appearance.';
  public readonly templateId = 'chat_scene_image_user';
  public readonly templateSettings = [];
  public readonly role = 'user';
}

const chatSceneImageSystemTemplate = new ChatSceneImageSystemTemplate();
const chatSceneImageUserTemplate = new ChatSceneImageUserTemplate();

export const chatSceneImageChainGroup = new PromptTemplateChain({
  templateChainId: 'gen_chat_scene_image_prompt',
  templateChainTitle: 'Chat Scene Image Generation',
  templateChainDescription: 'Prompts used to generate scene image prompts.',
  contextSchema: focusedConversationExecutionContextSchema,
  templates: [{ template: chatSceneImageSystemTemplate }, { template: chatSceneImageUserTemplate }],
  parser: new PromptOutputParser<z.infer<typeof focusedConversationExecutionContextSchema>, string>(
    'async (response, it) => response',
    'chat_scene_image_parser',
    z.string()
  ),
});
