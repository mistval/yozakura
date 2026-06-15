export const settingsTooltips = {
  'scenario.activeMap': 'Change the map. Moves characters to random locations on the new map.',
  'scenario.activeMapName':
    'Change the map name, just for this scenario. Your global map will remain unchanged.',
  'scenario.activeMapDescription':
    'Change the map description, just for this scenario. Your global map will remain unchanged. You can use this to influence narrative directionality too, for example by adding "it\'s Winter now and everyone is trying to find food."',
  'appearance.theme':
    'Select a theme. <strong>System</strong> chooses either Sakura or Yozakura based on your system light/dark setting.',
  'image.promptPrefix': 'This text is prepended to all image generation prompts.',
  'image.apiUrl':
    'Image API endpoint URL. For AUTOMATIC1111, typically you should use the <code>/sdapi/v1/txt2img</code> endpoint. For OpenRouter (or similar), use the <code>/v1/chat/completions</code> endpoint.',
  'image.apiShape':
    '<strong>AUTOMATIC1111</strong> is the most common API shape for local software. <strong>OpenRouter</strong> supports OpenRouter and possibly other similar providers, depending on the details of the provider API.',
  'image.authToken':
    'Optional bearer token sent as <code>Authorization: Bearer &lt;token&gt;</code>. Required for most cloud  providers.',
  'image.metaOptions':
    'Extra JSON fields merged into every image generation request. For OpenRouter, this is where you set <code>model</code>, <code>size</code>, <code>n</code>, etc. For AUTOMATIC1111, this controls diffusion parameters such as <code>steps</code>, <code>sampler_name</code>, <code>cfg_scale</code>.',
  'image.model':
    'The image model to request (for example <code>x-ai/grok-imagine-image-quality</code>). This is saved as the <code>model</code> field of the meta options below.',
  'image.negativePrompt':
    'This text is appended as a <strong>negative prompt</strong> to discourage unwanted visual artifacts.',
  'image.editPromptBeforeDispatch':
    'When enabled, generated image prompts open in an editor before the request is sent to the image API. When disabled, prompts are dispatched immediately without an opportunity to edit.',
  'image.autoRate':
    'Chance that each new chat message automatically generates an image. <strong>0</strong> disables auto image and <strong>100</strong> triggers on every message.',
  'image.autoNpcOnly':
    'When enabled, auto image runs only for NPC-only chats. If the user is a chat participant, auto image will not trigger and images can only be generated via the Gen Image button.',
  'image.width': 'Target width (in pixels) for generated chat images.',
  'image.height': 'Target height (in pixels) for generated chat images.',
  'image.cardWidth': 'Target width (in pixels) for character card image generation.',
  'image.cardHeight': 'Target height (in pixels) for character card image generation.',
  'npc.richRate':
    "When an NPC chooses to interact with another, it will trigger a rich interaction this percentage of the time. A rich interaction is a full conversation via an LLM, while a non-rich interaction just increases the two characters' familiarity towards each other without generating dialogue or memories. Increase this if you want NPCs to converse with each other more, decrease it if you want them to converse less.",
  'npc.richMessageCount': 'Number of back-and-forth messages generated per NPC in rich two-way chats.',
  'npc.familiarityGain':
    'Amount of familiarity increase between two characters when they interact. Characters with high mutual familiarity are more likely to interact in the future.',
  'npc.familiarityDecay': 'Amount of familiarity lost per turn when characters do not interact.',
  'npc.userFamiliarityMultiplier':
    'Multiplier applied to familiarity gains towards the user. Setting a multiplier above one effectively makes NPCs approach the user more often.',
  'npc.familiarityWeightMultiplier':
    'Controls how strongly familiarity affects weighted choices that use familiarity weighting (for example, which character an NPC prefers to interact with and gossip target weighting). Increasing this makes NPCs more "cliquey" and likely to interact with characters they have already interacted with frequently.',
  'npc.userGossipChanceMultiplier':
    "Multiplier applied only to the user's gossip target selection weight when the user is a gossip target candidate. <strong>0</strong> disables user selection as a gossip target. <strong>1</strong> is neutral. Higher than 1 makes the user more likely to be selected as the gossip target than their baseline chance (which is controlled by familiarity). Increase this if you like being the center of attention.",
  'npc.groupLimit': 'The total number of messages generated during an NPC-only group chat.',
  'npc.offscreenMentionLimit':
    'The maximum number of characters who are not participating in a chat to inject memories for when they are mentioned. A higher number may decrease conversation coherence.',
  'npc.rollingSummaryLimit':
    'How many recent conversation summaries are retained per character globally and also pairwise. Older summaries are discarded and will no longer be injected into memory rewrite prompts, thus information no longer in that window is more likely to be discarded from character memory.',
  'npc.offscreenLearnedInformationLimit':
    'How many pieces of recent offscreen learned information are retained per character-pair. Older information is discarded and will no longer be injected into memory rewrite prompts, thus information no longer in that window is more likely to be discarded from character memory.',
  'chat.paneWidth': 'Controls the horizontal layout width of the chat panel.',
  'npc.groupSpeakerSelectionMode':
    '<strong>Round Robin</strong> rotates speakers in a consistent order. <strong>Intelligent</strong> uses LLM-based moderation to choose who speaks next. This setting only applies to chats without the user as a participant.',
  'user.speakerSelectionMode':
    '<strong>Round Robin</strong> rotates speakers in a consistent order. <strong>Manual</strong> waits for you to click <strong>Speak</strong>. <strong>Intelligent</strong> uses LLM-based moderation to choose who speaks next. This setting only applies to chats that include the user.',
  'npc.freedomOfMovement':
    "When enabled, movement and conversation do not consume the user's turn. Your turn ends only when you press <strong>Wait</strong>.",
  'npc.onlyChatDelay':
    'Optional delay, in seconds, after each NPC message in NPC-only chats (chats where the user is not a participant). Use this to slow the pace of messages as they appear on screen.',
  'npc.gossipRate':
    'In this percentage of rich interactions, a character who is not participating in the conversation will be selected as the gossip target. The memory each participant has towards the gossip target will be injected into their system prompt, increasing the chance that the gossip target will be mentioned in the conversation (which can then trigger memory updates towards that character).',
  'npc.npcTextRate':
    'The chance that non-present NPCs will be included among chat target candidates when an NPC decides to chat instead of move (thus potentially starting a remote chat between characters who are not in the same location).',
  'npc.triggeredGroupRate':
    'Chance that an NPC decides to start a group chat (if they have already decided to chat instead of moving).',
  'npc.groupAdditionalParticipants':
    'When an NPC starts a group chat, this is how many other participants it attempts to include (limited by how many other chat candidates there are).',
  'npc.singleChatRate': 'Chance that an NPC chooses to chat during their turn (as opposed to moving).',
  'llm.name': 'Friendly label for this LLM option group.',
  'llm.url': 'Optional endpoint override. Leave blank to inherit URL from earlier matching groups.',
  'llm.authToken':
    'Optional bearer token override. Leave blank to inherit token from earlier matching groups.',
  'llm.tokenStreaming':
    'When enabled, NPC responses stream token-by-token. This requires your OpenAI-compatible API provider to support streaming (SSE).',
  'llm.responsePreParser':
    'Optional JavaScript function source that pre-processes raw model responses for this option group. Leave blank to inherit from earlier matching groups. It must evaluate to a function like <code>(response) => string</code>. The parser runs before any parsers configured for prompt templates',
  'llm.model':
    'If your API accepts a <code>model</code> field in request bodies to select the model, set it here. This is saved as the <code>model</code> field of the meta options below.',
  'llm.metaOptions':
    'JSON object merged into LLM payload for this group, for example <code>{ "max_tokens": 220 }</code>.',
  'llm.rule':
    'Optional JavaScript expression that will be evaluated to determine if these settings should be used. Example: <code>context.promptTemplateGroup === \'gen_intelligent_next_speaker_select\'</code>. The context object contains the fields <a href="https://mistval.github.io/yozakura/docs/template-system#prompt-template-group-context-docs">documented here</a>, which is different for each prompt group',
  'promptTemplates.templateBody':
    'Template Body uses <a href="https://eta.js.org/docs/syntax">Eta/EJS-style templating syntax</a>. Use tags like <code>&lt;% ... %&gt;</code> and <code>&lt;%= ... %&gt;</code> to compute dynamic text.',
} as const;

export type SettingsTooltipKey = keyof typeof settingsTooltips;
