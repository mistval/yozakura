import { z } from 'zod';

export type OpenAIChatCompletionRequestMessage = {
  role: 'system' | 'user' | 'assistant';
  content: string;
};

export const chatMediumSchema = z.enum(['in_person', 'remote']).meta({
  description: 'The medium of the chat, which can influence the style and content of the generated messages.',
});

export type ChatMedium = z.infer<typeof chatMediumSchema>;

const basePersistedObjectSchema = z.object({
  id: z.string(),
  createdAt: z.string(),
  updatedAt: z.string(),
});

export type RootPersistedObject = z.infer<typeof basePersistedObjectSchema>;

const conversationSummarySchema = basePersistedObjectSchema.extend({
  conversationId: z.string(),
  turnNumber: z.number(),
  createdAt: z.string(),
  summary: z.string().meta({
    description:
      'A summary of a conversation from the perspective of the focus character. Typically 1-3 paragraphs long.',
    examples: [
      'Alice had a great conversation with Bob at the park. They talked about their favorite books and found out they both love science fiction. Alice learned that Bob is planning a trip to Japan next month.',
    ],
  }),
  participantIds: z.array(z.string()),
  chatMedium: chatMediumSchema,
});

export type ConversationSummary = z.infer<typeof conversationSummarySchema>;

const offscreenLearnedInformationSchema = basePersistedObjectSchema.extend({
  sourceConversationId: z.string(),
  turnNumber: z.number(),
  createdAt: z.string(),
  information: z.string().meta({
    description:
      'Information focused character has learned about the target character from a secondhand source without the target character being present.',
    examples: [
      'Alice learned from Carol that Bob has a younger sister named Emily who is a talented musician.',
    ],
  }),
  source: z.string().meta({
    description: 'The source of the information',
    examples: ['A conversation between Alice and Carol.'],
  }),
});

export type OffscreenLearnedInformation = z.infer<typeof offscreenLearnedInformationSchema>;

export const wardrobeSchema = basePersistedObjectSchema
  .extend({
    text: z
      .string()
      .trim()
      .min(1)
      .meta({
        description:
          'A comma-separated list of tags describing this wardrobe entry. These should be concise and focused on visual details relevant for automatic image generation.',
        examples: ['red dress, elegant, evening wear', 'blue jeans, casual, modern'],
      }),
    enabled: z.boolean().meta({
      description:
        "Whether this wardrobe entry is currently enabled for the character. Enabled wardrobes are included in the character description for image generation and can influence the character's appearance in generated content. ",
    }),
    autoSelectGroup: z.string().meta({
      description: `An optional identifier for grouping wardrobe entries. If multiple wardrobe entries share the same non-empty autoSelectGroup value, only one of them will be enabled at a time by the system (though the user can still enable multiple if they wish to). This is useful for mutually exclusive options like different outfits or facial expressions.`,
    }),
    autoRevert: z.boolean().meta({
      description: `If true, changes to the enabled state of this wardrobe during a chat will be reverted after the chat ends. This is useful for temporary states like "surprised expression" that should be turned off again after the conversation.`,
    }),
  })
  .meta({
    description:
      "Represents a single wardrobe entry for a character. A wardrobe is a set of clothing, accessories, or even poses and facial expressions. Unlike baseAppearanceTags, enabled wardrobes can change dynamically based on the character's state or actions.",
  });

export type Wardrobe = z.infer<typeof wardrobeSchema>;

export const characterSchema = basePersistedObjectSchema.extend({
  id: z.string().meta({
    examples: ['char_123'],
    description: 'Unique identifier for the character.',
  }),
  globalCharacterId: z.string().meta({
    description:
      'This is the ID of the globally available character that this scenario character was instantiated from.',
  }),
  scenarioId: z.string(),
  firstName: z
    .string()
    .min(1)
    .meta({
      description: 'The first name of the character.',
      examples: ['Alice'],
    }),
  lastName: z.string().meta({
    description: 'The last name of the character (can be an empty string if the character has no last name).',
    examples: ['Smith'],
  }),
  internalDescription: z.string().meta({
    description:
      "A private internal description of the character's personality, background, traits, and inner life. This is typically used to help the model roleplay the character more consistently and with more depth, and is typically not directly known to other characters.",
    examples: [
      'Alice is a curious and adventurous soul with a love for exploring new places. She has a quick wit and a warm heart, always eager to help others. Alice grew up in a small town but dreams of traveling the world and experiencing different cultures.',
    ],
  }),
  externalDescription: z.string().meta({
    description:
      'A public description of the character that is intended to be known by all other characters (even those who have not yet met this character). This can include appearance, social status, and other surface level attributes. This is optional and might be an empty string.',
    examples: [
      'Alice is known around town as a friendly, restless traveler with a warm smile and a habit of asking everyone about their latest adventure.',
    ],
  }),
  baseAppearanceTags: z.string().meta({
    description:
      "Comma-separated list of tags describing the character's base appearance (without reference to clothing, accessories, etc). These tags are used for image generation and should be concise. This is optional and might be an empty string.",
    examples: ['brown hair, green eyes, tall, athletic build'],
  }),
  imagePath: z.string(),
  wardrobes: z.array(wardrobeSchema),
  globalMemories: z.string().meta({
    description:
      'Important memories, beliefs, or goals that the character carries with them across all conversations (with all other characters). These memories are updated via LLM after each conversation. This may be an empty string if the character has not formed any memories yet.',
    examples: [
      "Alice's goal is to find her long-lost sibling. Alice recently met Evan at a coffee shop and they had a great conversation about travel.",
    ],
  }),
  locationId: z.string().meta({
    description: 'The ID of the world map location where the character is currently located.',
    examples: ['loc_123'],
  }),
  nextConversationWithCharacterId: z.string(),
  exampleDialogue: z.string().meta({
    description:
      "Example dialogue for the character that can be used in system prompts to help ground the character's voice and manner of speaking. This should ideally be a snippet of dialogue in first person perspective, so the model can more easily mimic the style and content. May be an empty string.",
    examples: [
      `Alice: Hi I'm Alice!
Alice: I love going on adventures and exploring new places.
Alice: I have a pet cat named Whiskers who is very mischievous.`,
    ],
  }),
  rollingConversationSummaries: z.array(conversationSummarySchema).meta({
    description:
      'Brief summaries of past conversations involving this character, used to help the model keep track of important past events and relationships. A new conversation is added after every conversation the character is involved in, and only the most recent ten (by default) summaries are kept in this array.',
  }),
});

export type Character = z.infer<typeof characterSchema>;

export type PromptMessage = { role: string; content: string };

export const worldMapLocationSchema = basePersistedObjectSchema.extend({
  name: z.string().meta({
    description: 'The name of the location, which can be referenced in prompts and conversations.',
    examples: ['Central Park', 'Downtown Cafe', "Alice's Apartment"],
  }),
  description: z.string().meta({
    description:
      'A detailed description of the location, which can be used in prompts to help set the scene and inspire relevant details in generated content.',
  }),
  adjacency: z.array(z.string()).meta({
    description: 'An array of IDs of other locations that are directly accessible from this location',
  }),
  isEphemeral: z.boolean().meta({
    description:
      'Whether this location is an ephemeral location, which means it only exists for the scope of the current conversation and does not actually exist among world map locations. The id and adjacency of an ephemeral location are equivalent to that of the actual location that the focused character was in when the conversation began. After the conversation ends, they will be back in that location (technically they never really left). An ephemeral location gets created when the character edits the name/description of the location in the current chat settings, and this feature exists to allow flexibility in moving conversations to arbitrary imaginary locations.',
  }),
});

export type WorldMapLocation = z.infer<typeof worldMapLocationSchema>;

export const ephemeralLocationSchema = worldMapLocationSchema.extend({
  ephemeral: z.literal(true),
});

export type EphemeralLocation = z.infer<typeof ephemeralLocationSchema>;

export const worldMapSchema = basePersistedObjectSchema.extend({
  name: z.string(),
  description: z.string(),
  locations: z.array(worldMapLocationSchema),
});

export type WorldMap = z.infer<typeof worldMapSchema>;

export const scenarioSchema = basePersistedObjectSchema.extend({
  mapId: z.string(),
  userCharacterId: z.string(),
  turnNumber: z.number(),
  mapOverrides: z
    .object({
      name: z.string().optional(),
      description: z.string().optional(),
    })
    .optional(),
});

export type Scenario = z.infer<typeof scenarioSchema>;

export type ScenarioSummary = {
  scenario: Scenario;
  mapName: string;
  userCharacterName: string;
  createdAt: string;
  updatedAt: string;
};

export const characterRelationshipSchema = basePersistedObjectSchema.extend({
  fromId: z.string(),
  toId: z.string(),
  familiarity: z.number().meta({
    description:
      'A numeric value representing how familiar the from character is with the to character. This increases with interactions. It influences how likely the two characters are to approach each other.',
  }),
  lastProcessedTurn: z.number().int(),
  descriptor: z.string().meta({
    description:
      'A short (usually 1-3 words) description of what the "to" character means to the "from" character, from the perspective of the "from" character.',
    examples: ['best friend', 'rival', 'distant acquaintance', 'sibling', 'mentor'],
  }),
  memory: z.string().meta({
    description:
      'The current memory that the "from" character has about the "to" character, from the perspective of the "from" character. This is generated by an LLM based on the list of conversation summaries and secondhand (offscreen) learned information.',
    examples: [
      `Alice has fond memories of a trip to the beach she took with Bob during their childhood. They got caught in a sudden rainstorm and had to take shelter under a small pavilion. Alice often reminisces about this trip when she thinks of Bob.`,
    ],
  }),
  nextConversationGoal: z.string().meta({
    description:
      'A goal that the "from" character has towards the "to" character that would motivate them to approach the "to" character in conversation.',
    examples: [
      "Alice is interested in meeting up with Bob to reminisce about old times and catch up on each other's lives.",
    ],
  }),
  rollingPairwiseSummaries: z.array(conversationSummarySchema).meta({
    description:
      'Brief summaries of past conversations between the two characters, from the perspective of the "from" character. A new summary is added after every conversation they have together, and only the most recent ten (by default) summaries are kept in this array.',
  }),
  rollingOffscreenLearnedInformation: z.array(offscreenLearnedInformationSchema).meta({
    description:
      'Information that the "from" character has learned about the "to" character via secondhand ("offscreen") sources. Only the most recent ten (by default) pieces of information are kept in this array.',
  }),
});

export type CharacterRelationship = z.infer<typeof characterRelationshipSchema>;

export type CharacterRelationships = Record<string, CharacterRelationship>;

export type CharacterPair = {
  fromId: string;
  toId: string;
};

const conversationPairwiseUpdateSchema = basePersistedObjectSchema.extend({
  towardsCharacter: characterSchema.pick({ id: true, firstName: true }),
  oldMemory: z.string(),
  newMemory: z.string(),
  oldConversationGoal: z.string(),
  newConversationGoal: z.string(),
  oldRelationshipDescriptor: z.string(),
  newRelationshipDescriptor: z.string(),
  oldFamiliarity: z.number(),
  newFamiliarity: z.number(),
  learnedInformation: offscreenLearnedInformationSchema.optional(),
});

export type ConversationPairwiseUpdate = z.infer<typeof conversationPairwiseUpdateSchema>;

const conversationCharacterUpdateSchema = basePersistedObjectSchema.extend({
  characterId: z.string(),
  oldGlobalMemory: z.string(),
  newGlobalMemory: z.string(),
  conversationSummary: conversationSummarySchema.pick({
    summary: true,
  }),
  pairwiseUpdates: z.array(conversationPairwiseUpdateSchema),
});

export type ConversationStateUpdateNode = {
  kind: 'spoiler' | 'text' | 'inline-delta';
  name?: string | undefined;
  text?: string | undefined;
  children?: ConversationStateUpdateNode[] | undefined;
  inlineFromName?: string | undefined;
  inlineToName?: string | undefined;
  inlineFromValue?: string | number | undefined;
  inlineToValue?: string | number | undefined;
  [key: string]: unknown;
};

const conversationStateUpdateNodeSchema: z.ZodType<ConversationStateUpdateNode> = z.lazy(() =>
  z
    .object({
      kind: z.enum(['spoiler', 'text', 'inline-delta']),
      name: z.string().optional(),
      text: z.string().optional(),
      children: z.array(conversationStateUpdateNodeSchema).optional(),
      inlineFromName: z.string().optional(),
      inlineToName: z.string().optional(),
      inlineFromValue: z.union([z.string(), z.number()]).optional(),
      inlineToValue: z.union([z.string(), z.number()]).optional(),
    })
    .passthrough()
);

export const timeOfDaySchema = z.enum(['morning', 'afternoon', 'evening', 'night']);
export type TimeOfDay = z.infer<typeof timeOfDaySchema>;

const baseMessageSchema = basePersistedObjectSchema.extend({
  id: z.string(),
});

const baseSystemMessageSchema = baseMessageSchema.extend({
  messageType: z.literal('system_message'),
  isPrivateToCharacterId: z.string().optional(),
});

const imageMessageSchema = baseMessageSchema.extend({
  messageType: z.literal('image'),
  imageUrl: z.string(),
});

export type ImageMessage = z.infer<typeof imageMessageSchema>;

const joinLeaveSystemMessageSchema = baseSystemMessageSchema.extend({
  systemMessageType: z.enum(['join', 'leave']),
  characterId: z.string(),
});

export type JoinLeaveSystemMessage = z.infer<typeof joinLeaveSystemMessageSchema>;

const memoryCharacterRagMessageSchema = baseSystemMessageSchema.extend({
  systemMessageType: z.literal('memory_character_rag'),
  mentionedCharacterId: z.string(),
  message: z.string(),
  isPrivateToCharacterId: z.string(),
});

export type MemoryCharacterRagMessage = z.infer<typeof memoryCharacterRagMessageSchema>;

const characterMessageSchema = baseMessageSchema.extend({
  messageType: z.literal('chat_message'),
  senderId: z.string(),
  message: z.string(),
});

export type CharacterMessage = z.infer<typeof characterMessageSchema>;

export const chatMessageSchema = z.union([
  characterMessageSchema,
  joinLeaveSystemMessageSchema,
  imageMessageSchema,
  memoryCharacterRagMessageSchema,
]);

export type ChatMessage = z.infer<typeof chatMessageSchema>;

const transcriptParticipantSchema = characterSchema.pick({
  id: true,
  firstName: true,
  lastName: true,
  imagePath: true,
});

export type TranscriptParticipant = z.infer<typeof transcriptParticipantSchema>;

export const serializedConversationTranscriptSchema = basePersistedObjectSchema.extend({
  rawMessages: z.array(chatMessageSchema),
  participants: z.array(transcriptParticipantSchema),
});

export type SerializedConversationTranscript = z.infer<typeof serializedConversationTranscriptSchema>;

export const storedConversationSchema = basePersistedObjectSchema.extend({
  turnNumber: z.number(),
  participants: z.array(transcriptParticipantSchema),
  label: z.string(),
  serializedTranscript: serializedConversationTranscriptSchema,
  characterUpdates: z.array(conversationCharacterUpdateSchema),
  stateUpdates: z.array(conversationStateUpdateNodeSchema),
});

export type StoredConversation = z.infer<typeof storedConversationSchema>;
