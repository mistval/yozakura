import z from 'zod';
import {
  characterRelationshipSchema,
  characterSchema as internalCharacterSchema,
  chatMediumSchema,
  chatMessageSchema,
  scenarioSchema,
  worldMapLocationSchema,
  worldMapSchema,
} from '../types';
import type { Character, CharacterRelationship } from '../types';

export type ContextResolvers = {
  getCharacter?: (id: string) => Character | undefined;
  getRelationship?: (fromId: string, toId: string) => Promise<CharacterRelationship | undefined>;
};

const characterSchema = internalCharacterSchema
  .pick({
    id: true,
    firstName: true,
    lastName: true,
    internalDescription: true,
    externalDescription: true,
    baseAppearanceTags: true,
    wardrobes: true,
    globalMemories: true,
    locationId: true,
    exampleDialogue: true,
    rollingConversationSummaries: true,
  })
  .extend({
    xmlTagSafeName: z.string().meta({
      description:
        'An encoding of the first and last name that is syntactically valid in the name of an XML tag',
      examples: ['alice_smith'],
    }),
  });

export type ContextCharacter = z.infer<typeof characterSchema>;

const contextSchemaFields = z.object({
  focusedCharacter: characterSchema.meta({
    description: `The character who is in focus for this prompt (maybe they are the speaker, maybe they are having memories generated, etc. The exact meaning of "in focus" depends on the specific prompt template.).`,
  }),
  focusedCharacterAppearance: z.string().meta({
    description: `The concatenation of the focused character's baseAppearanceTags with all of their enabled wardrobes. This is a convenience field and doesn't encode any information beyond what is already available in focusedCharacter.wardrobes.`,
  }),
  targetCharacter: characterSchema.meta({
    description:
      'The characters towards whom the focused character is directing their attention (generally when generating pairwise memories post-conversation).',
  }),
  targetCharacterRelationship: characterRelationshipSchema.meta({
    description:
      'The relationship between the focusedCharacter and targetCharacter. This field is provided when the prompt template is focused on generating pairwise memories or otherwise needs to reason about the relationship between these two characters.',
  }),
  allCharacters: z.array(characterSchema).meta({
    description:
      'All characters in the wider scenario, including those not taking part in or otherwise relevant to the current conversation so far.',
  }),
  participants: z.array(characterSchema).meta({
    description: 'All characters who are participating in the current conversation.',
  }),
  userCharacter: characterSchema.meta({
    description:
      'The character controlled by the user (might or might not be participating in the current conversation).',
  }),
  scenario: scenarioSchema.meta({
    description: 'The overall scenario that the current conversation is taking place within.',
  }),
  temporalContext: z.string().meta({
    description:
      "The current temporal/environmental context (date, time of day, weather, etc.) as plain text, produced by the scenario's temporal context script. May be empty.",
  }),
  chatMedium: chatMediumSchema,
  worldMap: worldMapSchema.meta({
    description: 'The world map that scenario takes place in, including all locations and their connections.',
  }),
  currentLocation: worldMapLocationSchema.meta({
    description:
      'The current location of the focused character within the world map. For conversations with chatMedium "in_person", this is the location of the conversation. For conversations with chatMedium "remote", this is the location of the focused character only (other participants may be elsewhere). This can be an ephemeral location, if the user modified the location in chat settings during the conversation.',
  }),
  raggedCharacters: z.array(characterSchema).meta({
    description:
      'Characters who are not participating in the conversation but who appear to have been mentioned in the conversation so far (via simple string matching against their names).',
  }),
  gossipTargetCharacter: characterSchema.optional().meta({
    description:
      'A character the system has chosen to nudge the chat participants to consider talking about. Generally they are not taking part in the current conversation, but on rare occasions they can join after the conversation begins. This field is only provided when certain conditions are met.',
  }),
  gossipTargetRelationship: characterRelationshipSchema.optional().meta({
    description:
      'The relationship between focusedCharacter and gossipTargetCharacter, including any relevant memories. This field is provided along with gossipTargetCharacter to give the system material to talk about.',
  }),
  transcript: z.string().meta({
    description: `A string transcript of the conversation so far. Each line has the speaker's name, a colon, and then their message.`,
  }),
  conversationMessages: z.array(chatMessageSchema).meta({
    description:
      'All messages exchanged in the current conversation. This can enable more advanced use cases than the plain text transcript, such as referencing message types or metadata.',
  }),
  chatInstructions: z.string().meta({
    description:
      'Free-form instructions entered by the user in chat settings that apply to every character in the current conversation. Empty if the user has not provided any.',
  }),
  focusedCharacterChatInstructions: z.string().meta({
    description:
      "Free-form instructions entered by the user in the focused character's chat settings that apply only to the focused character during the current conversation. Empty if the user has not provided any.",
  }),
  settings: z.record(z.string(), z.unknown()).meta({
    description: "The current user settings. This won't be documented in detail, but is available.",
  }),
  getRelationship: z.any().meta({
    description:
      'An async function that takes in two arguments, the "from" character ID, and the "to" character ID (both strings), and returns the relationship between the two, from the perspective of the first character.',
    relationshipFunctionSignature:
      '(characterIdA: string, characterIdB: string) => Promise<CharacterRelationship>',
  }),
  targetCharacterFormattedRollingMemoriesText: z.string().meta({
    description:
      'Contains the rollingPairwiseSummaries and rollingOffscreenLearnedInformation from the focusedCharacter towards the targetCharacter, formatted in a way that is convenient for injection into prompt templates, and ordered oldest-first. This field is provided for convenience to avoid having to write complex formatting code inside of the template, although that remains an option for advanced use cases.',
    examples: [
      `<informations>
<information>
Type: Conversation Summary (summary of a conversation between Alice and Bob, possibly including other participants as well)
Conversation medium: in_person
Summary:
Alice and Bob had a conversation about the upcoming school dance. Alice is excited but also nervous about asking someone to be her date. Bob is supportive and encourages Alice to ask someone she likes.
</information>
<information>
Type: Secondhand Information (information that Alice learned about Bob without Bob's being present)
Information: Bob recently got a new job at a cafe downtown. He seems to really enjoy it and has been talking about it a lot.
Source: A conversation between Alice and Charlie
</information>
</informations>`,
    ],
  }),
  rollingConversationSummariesText: z.string().meta({
    description:
      "Contains the focusedCharacter's rollingConversationSummaries, formatted in a way that is convenient for injection into prompt templates, and ordered oldest-first. This field is provided for convenience to avoid having to write complex formatting code inside of the template, although that remains an option for advanced use cases.",
    examples: [
      `<summaries>
<summary>
Conversation participants: Alice, Bob
Conversation medium: in_person
Conversation summary:
Alice and Bob had a conversation about the upcoming school dance. Alice is excited but also nervous about asking someone to be her date. Bob is supportive and encourages Alice to ask someone she likes.
</summary>

<summary>
Conversation participants: Alice, Charlie
Conversation medium: remote
Conversation summary:
Alice and Charlie chatted online about their weekend plans. Charlie mentioned that he might go hiking if the weather is nice. Alice said she might join him if she can finish her homework.
</summary>
</summaries>`,
    ],
  }),
  globalWritableContext: z.record(z.string(), z.unknown()).meta({
    description:
      'This object can be written to by templates, and it is shared among all templates across the entire lifetime of the application. The Yozakura system never reads, writes, or replaces this object. It is entirely managed by templates. It does not persist between full application shutdowns. This can be used for passing information between templates, caching, or other suitable purposes.',
  }),
  randomPersonalityTraits: z.array(z.string()).meta({
    description:
      'A short array of random personality traits that may be used as inputs for generating character information, to keep things interesting. Using these attributes is optional, there is no requirement for the prompt to respect these suggested attributes.',
    examples: [
      ['friendly', 'outgoing', 'introverted', 'adventurous', 'cautious'],
      ['sarcastic', 'witty', 'serious', 'playful', 'stoic'],
    ],
  }),
  mentionedByCharacter: characterSchema.meta({
    description: 'The character who mentioned the mentionedCharacter in the conversation.',
  }),
  candidateInformation: z.string().meta({
    description: `Newly learned information about the target character. Decide whether this implies a better next conversation goal than the current one.`,
  }),
  speakerCandidates: z.array(characterSchema).meta({
    description: 'The list of characters who are eligible to speak next in the conversation.',
  }),
  conversationEndJudge: z
    .object({
      targetLength: z.number(),
      maxLength: z.number(),
      currentLength: z.number(),
      historyLength: z.number(),
    })
    .meta({
      description:
        'Length constraints for the conversation-end judge prompt. targetLength is the suggested good length for the current chat (one-on-one or group), maxLength is the hard ceiling, currentLength is how many character messages have been sent so far, and historyLength is how many of the most recent messages the judge is shown.',
    }),
  characterMovementConstraint: z
    .object({
      status: z.enum(['in_designated_zone', 'moving_towards_designated_zone']),
      reason: z.string().optional(),
      targetLocationId: z.string().optional(),
      targetLocationName: z.string().optional(),
    })
    .optional()
    .meta({
      description:
        "Why the focused character is at, or heading toward, a location. Undefined if there's no known reason. status 'in_designated_zone' means they are where their character schedule wants them; 'moving_towards_designated_zone' means they are en route, with targetLocationName naming the target location. reason is the optional author-written justification for why the character is scheduled to be in the named location.",
    }),
});

const globalExecutionContextSchema = contextSchemaFields
  .pick({
    settings: true,
    globalWritableContext: true,
  })
  .meta({
    description: 'This is the context that is available to every single prompt in Yozakura.',
  });

export type GlobalExecutionContext = z.infer<typeof globalExecutionContextSchema>;

const scenarioExecutionContextSchema = globalExecutionContextSchema.and(
  contextSchemaFields.pick({
    allCharacters: true,
    userCharacter: true,
    scenario: true,
    temporalContext: true,
    worldMap: true,
    getRelationship: true,
  })
);

export type ScenarioExecutionContext = z.infer<typeof scenarioExecutionContextSchema>;

const conversationExecutionContextSchema = scenarioExecutionContextSchema.and(
  contextSchemaFields.pick({
    allCharacters: true,
    participants: true,
    userCharacter: true,
    chatMedium: true,
    raggedCharacters: true,
    gossipTargetCharacter: true,
    gossipTargetRelationship: true,
    transcript: true,
    conversationMessages: true,
    chatInstructions: true,
  })
);

export type ConversationExecutionContext = z.infer<typeof conversationExecutionContextSchema>;

export const focusedConversationExecutionContextSchema = conversationExecutionContextSchema.and(
  contextSchemaFields.pick({
    currentLocation: true,
    focusedCharacter: true,
    focusedCharacterAppearance: true,
    rollingConversationSummariesText: true,
    focusedCharacterChatInstructions: true,
    characterMovementConstraint: true,
  })
);

export type FocusedConversationExecutionContext = z.infer<typeof focusedConversationExecutionContextSchema>;

export const characterEditorExecutionContextSchema = globalExecutionContextSchema.and(
  contextSchemaFields.pick({
    focusedCharacter: true,
    randomPersonalityTraits: true,
  })
);

export type CharacterEditorExecutionContext = z.infer<typeof characterEditorExecutionContextSchema>;

export const targetedConversationExecutionContextSchema = focusedConversationExecutionContextSchema.and(
  contextSchemaFields.pick({
    targetCharacter: true,
    targetCharacterRelationship: true,
    targetCharacterFormattedRollingMemoriesText: true,
  })
);
export type TargetedConversationExecutionContext = z.infer<typeof targetedConversationExecutionContextSchema>;

export const memoryRagExecutionContext = targetedConversationExecutionContextSchema.and(
  contextSchemaFields.pick({
    mentionedByCharacter: true,
  })
);

export type MemoryRagExectionContext = z.infer<typeof memoryRagExecutionContext>;

export const offscreenMemoryUpdateConversationGoalContextSchema =
  targetedConversationExecutionContextSchema.and(
    contextSchemaFields
      .pick({
        candidateInformation: true,
      })
      .meta({
        description:
          'This OffscreenMemoryUpdateConversationGoalContext is available to the Offscreen Conversation Goal Updat prompt, and is identical to TargetedConversationContext except for adding the speakerCandidates field',
      })
  );

type OffscreenMemoryUpdateConversationGoalExecutionContext = z.infer<
  typeof offscreenMemoryUpdateConversationGoalContextSchema
>;

export const moderationNextSpeakerExecutionContextSchema = conversationExecutionContextSchema.and(
  contextSchemaFields
    .pick({
      speakerCandidates: true,
    })
    .meta({
      description:
        'This ModerationNextSpeakerExecutionContext is available to the Next Speaker Selection prompt, and is identical to ConversationExecutionContext except for adding the speakerCandidates field',
    })
);

export type ModerationNextSpeakerExecutionContext = z.infer<
  typeof moderationNextSpeakerExecutionContextSchema
>;

export const conversationEndJudgeExecutionContextSchema = focusedConversationExecutionContextSchema.and(
  contextSchemaFields
    .pick({
      conversationEndJudge: true,
    })
    .meta({
      description:
        'This ConversationEndJudgeExecutionContext is available to the Conversation End Judgement prompt. The focusedCharacter is the most recent speaker in the conversation.',
    })
);

export type ConversationEndJudgeExecutionContext = z.infer<typeof conversationEndJudgeExecutionContextSchema>;

export type PromptExecutionContext =
  | GlobalExecutionContext
  | ScenarioExecutionContext
  | ConversationExecutionContext
  | FocusedConversationExecutionContext
  | CharacterEditorExecutionContext
  | TargetedConversationExecutionContext
  | OffscreenMemoryUpdateConversationGoalExecutionContext
  | ModerationNextSpeakerExecutionContext
  | ConversationEndJudgeExecutionContext
  | MemoryRagExectionContext;
