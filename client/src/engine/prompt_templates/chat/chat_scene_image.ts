import { z } from 'zod';
import { focusedConversationExecutionContextSchema } from '../prompt_template_context_fields.js';
import type { PromptTemplateChainSpec } from '../template_types.js';

export const DEFAULT_CHAT_SCENE_IMAGE_CHAIN_ID = 'gen_chat_scene_image_prompt';
export const SPEAKER_CLOSE_UP_CHAT_SCENE_IMAGE_CHAIN_ID =
  'gen_chat_scene_image_prompt.speaker_close_up';
export const SCENERY_CHAT_SCENE_IMAGE_CHAIN_ID = 'gen_chat_scene_image_prompt.scenery';

const DEFAULT_SPEAKER_PARSER_SOURCE = `async (response, it) => {
  return [it.imagePromptPrefix, it.focusedCharacterAppearance, response].join(',');
}`;

const DEFAULT_SPEAKER_CLOSE_UP_PARSER_SOURCE = `async (response, it) => {
  const closeUpTags = 'close-up, portrait, face focus, upper body, detailed face, detailed eyes';
  return [it.imagePromptPrefix, closeUpTags, it.focusedCharacter.baseAppearanceTags, response].join(', ');
}`;

const DEFAULT_SCENERY_PARSER_SOURCE = `async (response, it) => {
  return [it.imagePromptPrefix, response].join(', ');
}`;

export function createChatSceneImageChainSpec(
  chainId: string = DEFAULT_CHAT_SCENE_IMAGE_CHAIN_ID
): PromptTemplateChainSpec<
  z.infer<typeof focusedConversationExecutionContextSchema>,
  string
> {
  return {
    templateChainId: chainId,
    defaultTitle: 'Speaker',
    defaultDescription:
      'Generates a scene image prompt focused on the speaking character in the current setting.',
    contextSchema: focusedConversationExecutionContextSchema,
    templates: [
      {
        templateId: `${chainId}.system`,
        name: 'Chat Scene Image (System)',
        description: 'System prompt for converting chat context into an image prompt.',
        role: 'system',
        defaultTemplateString:
          'You write natural language image prompts. Return only the prompt text, with no quotes, no markdown, and no extra commentary.',
      },
      {
        templateId: `${chainId}.user`,
        name: 'Chat Scene Image (User)',
        description: 'User prompt for scene details, transcript, and focused character appearance.',
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
      defaultParserSource: DEFAULT_SPEAKER_PARSER_SOURCE,
      parserOutputSchema: z.string(),
    },
  };
}

export function createChatSceneImageSpeakerCloseUpChainSpec(
  chainId: string = SPEAKER_CLOSE_UP_CHAT_SCENE_IMAGE_CHAIN_ID
): PromptTemplateChainSpec<
  z.infer<typeof focusedConversationExecutionContextSchema>,
  string
> {
  return {
    templateChainId: chainId,
    defaultTitle: 'Speaker Close-Up',
    defaultDescription:
      'Generates a close-up portrait image prompt of the speaking character.',
    contextSchema: focusedConversationExecutionContextSchema,
    templates: [
      {
        templateId: `${chainId}.system`,
        name: 'Speaker Close-Up (System)',
        description: 'System prompt for converting chat context into a face close-up image prompt.',
        role: 'system',
        defaultTemplateString:
          'You write natural language image prompts. Return only the prompt text, with no quotes, no markdown, and no extra commentary.',
      },
      {
        templateId: `${chainId}.user`,
        name: 'Speaker Close-Up (User)',
        description: 'User prompt for character details and face close-up instructions.',
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

The focus of the image is <%= it.focusedCharacter.firstName %>, whose appearance details are:
<appearance>
<%= it.focusedCharacterAppearance %>

</appearance>

<final_instruction>
Describe a close-up portrait of <%= it.focusedCharacter.firstName %>'s face and upper body in the current moment, capturing their facial expression, gaze, emotional state, and any visible facial features. Use full English sentences written in sparse language when writing your prompt, focusing purely on concrete visual details of their face and expression.

</final_instruction>`,
      },
    ],
    parser: {
      defaultParserSource: DEFAULT_SPEAKER_CLOSE_UP_PARSER_SOURCE,
      parserOutputSchema: z.string(),
    },
  };
}

export function createChatSceneImageSceneryChainSpec(
  chainId: string = SCENERY_CHAT_SCENE_IMAGE_CHAIN_ID
): PromptTemplateChainSpec<
  z.infer<typeof focusedConversationExecutionContextSchema>,
  string
> {
  return {
    templateChainId: chainId,
    defaultTitle: 'Scenery',
    defaultDescription:
      'Generates an environmental scenery image prompt with no characters.',
    contextSchema: focusedConversationExecutionContextSchema,
    templates: [
      {
        templateId: `${chainId}.system`,
        name: 'Scenery Image (System)',
        description: 'System prompt for converting location and chat context into a scenery image prompt.',
        role: 'system',
        defaultTemplateString:
          'You write natural language image prompts. Return only the prompt text, with no quotes, no markdown, and no extra commentary.',
      },
      {
        templateId: `${chainId}.user`,
        name: 'Scenery Image (User)',
        description: 'User prompt for setting and environment with no character details.',
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

<final_instruction>
Describe only the physical environment, setting, atmosphere, background, and lighting of the current scene based on the location and conversation context. Do not include, mention, or reference any characters, people, or human figures in the image prompt. Focus purely on concrete, visual environmental details.

</final_instruction>`,
      },
    ],
    parser: {
      defaultParserSource: DEFAULT_SCENERY_PARSER_SOURCE,
      parserOutputSchema: z.string(),
    },
  };
}

export const chatSceneImageChainSpec = createChatSceneImageChainSpec(
  DEFAULT_CHAT_SCENE_IMAGE_CHAIN_ID
);

export const chatSceneImageSpeakerCloseUpChainSpec =
  createChatSceneImageSpeakerCloseUpChainSpec(SPEAKER_CLOSE_UP_CHAT_SCENE_IMAGE_CHAIN_ID);

export const chatSceneImageSceneryChainSpec =
  createChatSceneImageSceneryChainSpec(SCENERY_CHAT_SCENE_IMAGE_CHAIN_ID);
