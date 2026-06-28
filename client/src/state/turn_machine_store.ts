import { create } from 'zustand';
import _ from 'lodash';
import { z } from 'zod';
import type {
  Character,
  ChatMedium,
  EphemeralLocation,
  Wardrobe,
  WorldMap,
  WorldMapLocation,
} from '../engine/types.js';
import {
  ephemeralLocationSchema,
  serializedConversationTranscriptSchema,
  wardrobeSchema,
} from '../engine/types.js';
import { ConversationTranscript } from '../engine/chat/transcript.js';
import { MemoryRAGHelper } from '../engine/memory_rag_helper.js';
import type { ContextResolvers } from '../engine/prompt_templates/prompt_template_context_fields.js';
import type { OmitFunctions } from '../util/types.js';
import { getRequiredActiveScenario, getRequiredUserCharacterId, useScenarioStore } from './scenario_store.js';
import { useScenarioCharacterStore, useUserCharacter } from './scenario_character_store.js';
import { useScenarioCharacterRelationshipStore } from './scenario_character_relationship_store.js';
import { assert, assertNonNullish } from '../errors/application_error.js';

export type ChatState =
  | 'inactive'
  | 'generating_image'
  | 'processing_memories'
  | 'character_speaking'
  | 'awaiting_character_input'
  | 'selecting_speaker'
  | 'judging_conversation_end';

export type StartChatSessionArgs = {
  participantIds: string[];
  initiatorId: string;
  gossipTargetCharacterId: string | undefined;
};

export const persistedActiveChatSchema = z.object({
  participantIds: z.array(z.string()),
  removedParticipantIds: z.array(z.string()),
  gossipTargetCharacterId: z.string().optional(),
  serializedTranscript: serializedConversationTranscriptSchema,
  preConversationWardrobeSnapshotByCharacterId: z.record(z.string(), z.array(wardrobeSchema)),
  ephemeralLocation: ephemeralLocationSchema.optional(),
  initiatorId: z.string().optional(),
  chatInstructions: z.string(),
  chatInstructionsByCharacterId: z.record(z.string(), z.string()),
});

export type PersistedActiveChat = z.infer<typeof persistedActiveChatSchema>;

export type TurnMachineState = 'deciding' | 'chatting';

export const serializedTurnSchema = z.object({
  turnMachineState: z.enum(['deciding', 'chatting']),
  pendingTurnCharacterIds: z.array(z.string()),
  chatsSoFar: z.record(z.string(), z.array(z.object({ withIds: z.array(z.string()) }))),
  activeChat: persistedActiveChatSchema.optional(),
});

export type SerializedTurn = z.infer<typeof serializedTurnSchema>;

type BaseTurnMachineStoreState = {
  turnMachineState: TurnMachineState | undefined;
  pendingTurnCharacterIds: string[];
  chatsSoFar: Record<string, { withIds: string[] }[]>;

  chatState: ChatState;
  processingMemoryStatusInfo: string | undefined;
  participantIds: string[];
  removedParticipantIds: string[];
  gossipTargetCharacterId: string | undefined;
  transcript: ConversationTranscript | undefined;
  preConversationWardrobeSnapshotByCharacterId: Record<string, Wardrobe[]>;
  ephemeralLocation: EphemeralLocation | undefined;
  initiatorId: string | undefined;
  memoryRagHelper: MemoryRAGHelper | undefined;
  chatInstructions: string;
  chatInstructionsByCharacterId: Record<string, string>;

  isActive: () => boolean;
  setTranscript: (transcript: ConversationTranscript) => void;
  startNewTurn: (opts?: { userMovesFirst?: boolean | undefined }) => void;
  currentCharacterId: () => string | undefined;
  currentCharacterIsUser: () => boolean;
  finishCurrentCharacter: () => boolean;
  setTurnMachineState: (turnMachineState: TurnMachineState) => void;
  recordChat: (initiatorId: string, withIds: string[]) => void;
  hasChatted: (characterAId: string, characterBId: string) => boolean;
  beginChat: (args: StartChatSessionArgs) => void;
  enterActiveChat: () => void;
  deactivateChat: () => void;
  reset: () => void;
  serialize: () => SerializedTurn | undefined;
  hydrate: (snapshot: SerializedTurn) => void;
  setEphemeralLocation: (setter: (prev: EphemeralLocation) => EphemeralLocation) => void;
  userIsParticipant: () => boolean;
  addChatParticipant: (participantId: string) => void;
  setCurrentCharacter: (characterId: string) => void;
  removeChatParticipant: (participantId: string) => void;
  setChatInstructions: (instructions: string) => void;
  setCharacterChatInstructions: (characterId: string, instructions: string) => void;
  setStateProcessingMemories: (info: string) => void;
  setStateAwaitingCharacterInput: () => void;
  setStateCharacterSpeaking: () => void;
  doWithState: <T>(chatState: ChatState, action: () => Promise<T>) => Promise<T>;
  getChatCharacterLocation: (
    charId: string,
    getCharacterById?: (id: string) => Character,
    activeScenarioMap?: WorldMap,
    ephemeralLocation?: EphemeralLocation
  ) => WorldMapLocation | undefined;
};

type ActiveChatTurnMachineStoreState = OmitFunctions<BaseTurnMachineStoreState> & {
  chatState: Exclude<ChatState, 'inactive'>;
  participantIds: string[];
  removedParticipantIds: string[];
  gossipTargetCharacterId: string | undefined;
  transcript: ConversationTranscript;
  preConversationWardrobeSnapshotByCharacterId: Record<string, Wardrobe[]>;
  ephemeralLocation: WorldMapLocation | undefined;
  initiatorId: string | undefined;
  memoryRagHelper: MemoryRAGHelper;
};

type InactiveChatFields = Omit<
  OmitFunctions<BaseTurnMachineStoreState>,
  'turnMachineState' | 'pendingTurnCharacterIds' | 'chatsSoFar'
>;

const inactiveChatTurnMachineState: InactiveChatFields = {
  chatState: 'inactive',
  removedParticipantIds: [],
  processingMemoryStatusInfo: undefined,
  participantIds: [],
  gossipTargetCharacterId: undefined,
  transcript: undefined,
  preConversationWardrobeSnapshotByCharacterId: {},
  ephemeralLocation: undefined,
  initiatorId: undefined,
  memoryRagHelper: undefined,
  chatInstructions: '',
  chatInstructionsByCharacterId: {},
};

function getRequiredCharacterById(characterId: string): Character {
  return useScenarioCharacterStore.getState().getRequiredCharacterById(characterId);
}

function getCharactersByIds(characterIds: string[]): Character[] {
  return useScenarioCharacterStore.getState().getCharactersByIds(characterIds);
}

function getActiveChatStateSnapshotFromState(
  state: BaseTurnMachineStoreState
): ActiveChatTurnMachineStoreState {
  if (state.chatState === 'inactive') {
    throw new Error('Requesting active chat state, but chat is not active');
  }

  return state as ActiveChatTurnMachineStoreState;
}

export function getActiveChatParticipants(
  options: {
    includeRemoved?: boolean;
    includeUser?: boolean;
  } = {}
): Character[] {
  const state = useTurnMachineStore.getState();
  const scenarioState = useScenarioStore.getState();
  const { includeRemoved = false, includeUser = true } = options;

  return getCharactersByIds(
    state.participantIds
      .concat(includeRemoved ? state.removedParticipantIds : [])
      .filter((id) => includeUser || id !== scenarioState.activeScenario?.userCharacterId)
  );
}

export function useActiveChatParticipants(): Character[] {
  const participantIds = useTurnMachineStore((state) => state.participantIds);
  const charactersById = useScenarioCharacterStore((state) => state.scenarioCharactersById);

  return participantIds
    .map((id) => charactersById[id])
    .filter((character): character is Character => Boolean(character));
}

export function getActiveChatMedium(
  participants = useTurnMachineStore.getState().participantIds,
  getRequiredCharacterById = useScenarioCharacterStore.getState().getRequiredCharacterById,
  getCharacterLocation = useTurnMachineStore.getState().getChatCharacterLocation,
  map = useScenarioStore.getState().activeScenarioMap,
  ephemeralLocation = useTurnMachineStore.getState().ephemeralLocation
): ChatMedium {
  const allLocations = new Set(
    participants.map((p) => getCharacterLocation(p, getRequiredCharacterById, map, ephemeralLocation)?.id)
  );

  return allLocations.size === 1 ? 'in_person' : 'remote';
}

export function useActiveChatMedium(): ChatMedium {
  const getCharacterLocation = useTurnMachineStore((s) => s.getChatCharacterLocation);
  const getRequiredCharacterById = useScenarioCharacterStore((s) => s.getRequiredCharacterById);
  const ephemeralLocation = useTurnMachineStore((s) => s.ephemeralLocation);
  const map = useScenarioStore((s) => s.activeScenarioMap);
  const participants = useActiveChatParticipants();

  return getActiveChatMedium(
    participants.map((p) => p.id),
    getRequiredCharacterById,
    getCharacterLocation,
    map,
    ephemeralLocation
  );
}

export function useChatUserLocation() {
  const getCharacterLocation = useTurnMachineStore((s) => s.getChatCharacterLocation);
  const getRequiredCharacterById = useScenarioCharacterStore((s) => s.getRequiredCharacterById);
  const ephemeralLocation = useTurnMachineStore((s) => s.ephemeralLocation);
  const userCharacter = useUserCharacter();
  const map = useScenarioStore((s) => s.activeScenarioMap);

  if (!userCharacter || !map) {
    return undefined;
  }

  return getCharacterLocation(userCharacter.id, getRequiredCharacterById, map, ephemeralLocation);
}

export async function getActiveChatGossipCharacter(fromCharacterId?: string, resolvers?: ContextResolvers) {
  const activeChatStore = useTurnMachineStore.getState();
  if (!activeChatStore.gossipTargetCharacterId) {
    return {};
  }

  const gossipTargetId = activeChatStore.gossipTargetCharacterId;
  const gossipTargetCharacter =
    resolvers?.getCharacter?.(gossipTargetId) ?? getRequiredCharacterById(gossipTargetId);
  const gossipTargetRelationship = fromCharacterId
    ? ((await resolvers?.getRelationship?.(fromCharacterId, gossipTargetId)) ??
      (await useScenarioCharacterRelationshipStore
        .getState()
        .getCharacterRelationship(fromCharacterId, gossipTargetId)))
    : undefined;

  return {
    gossipTargetCharacter,
    gossipTargetRelationship,
  };
}

export function getAllActiveChatSpeakers(): Character[] {
  const transcript = useTurnMachineStore.getState().transcript;
  assertNonNullish(transcript, 'Expected transcript to be available when getting all speakers');

  const speakerIds = transcript.getAllSpeakerIds();
  const scenarioCharacterStore = useScenarioCharacterStore.getState();

  return speakerIds
    .map((id) => scenarioCharacterStore.scenarioCharactersById[id])
    .filter((character): character is Character => Boolean(character));
}

export const useTurnMachineStore = create<BaseTurnMachineStoreState>((set, get) => ({
  ...inactiveChatTurnMachineState,
  turnMachineState: undefined,
  pendingTurnCharacterIds: [],
  chatsSoFar: {},

  isActive() {
    return get().chatState !== 'inactive';
  },

  startNewTurn(_opts: { userMovesFirst?: boolean | undefined } = {}) {
    const allCharacterIds = useScenarioCharacterStore.getState().scenarioCharacters.map((c) => c.id);
    const userCharacterId = getRequiredUserCharacterId();

    const nonUserCharacterIds = () => allCharacterIds.filter((id) => id !== userCharacterId);

    const ordered = true // opts.userMovesFirst TODO: Need to think more about whether user should always go first or not.
      ? [userCharacterId].concat(_.shuffle(nonUserCharacterIds()))
      : _.shuffle(allCharacterIds);

    set({
      ...inactiveChatTurnMachineState,
      turnMachineState: 'deciding',
      pendingTurnCharacterIds: ordered,
      chatsSoFar: {},
    } satisfies Partial<BaseTurnMachineStoreState>);
  },

  currentCharacterId() {
    return get().pendingTurnCharacterIds[0];
  },

  currentCharacterIsUser() {
    const currentId = get().currentCharacterId();
    return currentId === useScenarioStore.getState().activeScenario?.userCharacterId;
  },

  setCurrentCharacter(characterId: string) {
    assert(
      get().turnMachineState === 'deciding',
      'Cannot change current character while not in the deciding state'
    );

    set({
      pendingTurnCharacterIds: [characterId].concat(
        get().pendingTurnCharacterIds.filter((id) => id !== characterId)
      ),
    } satisfies Partial<BaseTurnMachineStoreState>);
  },

  finishCurrentCharacter() {
    const remaining = get().pendingTurnCharacterIds.slice(1);
    const turnEnded = remaining.length === 0;
    set({
      pendingTurnCharacterIds: remaining,
      turnMachineState: turnEnded ? undefined : 'deciding',
    } satisfies Partial<BaseTurnMachineStoreState>);
    return turnEnded;
  },

  setTurnMachineState(machineState) {
    set({ turnMachineState: machineState } satisfies Partial<BaseTurnMachineStoreState>);
  },

  recordChat(initiatorId, withIds) {
    const existing = get().chatsSoFar[initiatorId] ?? [];
    set({
      chatsSoFar: {
        ...get().chatsSoFar,
        [initiatorId]: existing.concat({ withIds }),
      },
    } satisfies Partial<BaseTurnMachineStoreState>);
  },

  hasChatted(characterAId, characterBId) {
    const chatsSoFar = get().chatsSoFar;
    return (
      (chatsSoFar[characterAId] ?? []).some((chat) => chat.withIds.includes(characterBId)) ||
      (chatsSoFar[characterBId] ?? []).some((chat) => chat.withIds.includes(characterAId))
    );
  },

  beginChat(args) {
    const participants = getCharactersByIds(args.participantIds);

    set({
      ...inactiveChatTurnMachineState,
      turnMachineState: 'chatting',
      participantIds: args.participantIds,
      initiatorId: args.initiatorId,
      gossipTargetCharacterId: args.gossipTargetCharacterId,
      chatState: 'awaiting_character_input',
      transcript: ConversationTranscript.new(),
      preConversationWardrobeSnapshotByCharacterId: Object.fromEntries(
        participants.map((p) => [p.id, p.wardrobes])
      ),
    } satisfies Partial<BaseTurnMachineStoreState>);
  },

  enterActiveChat() {
    const transcript = get().transcript;
    assertNonNullish(transcript, 'Cannot enter chat without a transcript');

    const memoryRagHelper = new MemoryRAGHelper();
    for (const rawMessage of transcript.getRawMessages()) {
      if (rawMessage.messageType === 'chat_message') {
        memoryRagHelper.collectMentionedOffscreenCharacterIds(rawMessage.id, rawMessage.message);
      }
    }

    set({ memoryRagHelper } satisfies Partial<BaseTurnMachineStoreState>);
  },

  deactivateChat() {
    get().memoryRagHelper?.teardown();
    set(inactiveChatTurnMachineState);
  },

  reset() {
    get().memoryRagHelper?.teardown();
    set({
      ...inactiveChatTurnMachineState,
      turnMachineState: undefined,
      pendingTurnCharacterIds: [],
      chatsSoFar: {},
    } satisfies Partial<BaseTurnMachineStoreState>);
  },

  serialize() {
    const state = get();
    if (state.turnMachineState === undefined) {
      return undefined;
    }

    return {
      turnMachineState: state.turnMachineState,
      pendingTurnCharacterIds: state.pendingTurnCharacterIds,
      chatsSoFar: state.chatsSoFar,
      activeChat: state.turnMachineState === 'chatting' ? buildPersistedActiveChat(state) : undefined,
    };
  },

  hydrate(snapshot) {
    const base = {
      ...inactiveChatTurnMachineState,
      turnMachineState: snapshot.turnMachineState,
      pendingTurnCharacterIds: snapshot.pendingTurnCharacterIds,
      chatsSoFar: snapshot.chatsSoFar,
    } satisfies Partial<BaseTurnMachineStoreState>;

    if (!snapshot.activeChat) {
      set(base);
      return;
    }

    const { serializedTranscript, ...chatFields } = snapshot.activeChat;
    set({
      ...base,
      ...chatFields,
      chatState: 'awaiting_character_input',
      transcript: ConversationTranscript.deserialize(serializedTranscript),
    } satisfies Partial<BaseTurnMachineStoreState>);
  },

  setStateProcessingMemories(statusInfo: string) {
    set({
      chatState: 'processing_memories',
      processingMemoryStatusInfo: statusInfo,
    } satisfies Partial<BaseTurnMachineStoreState>);
  },

  setStateAwaitingCharacterInput() {
    set({
      chatState: 'awaiting_character_input',
      processingMemoryStatusInfo: undefined,
    } satisfies Partial<BaseTurnMachineStoreState>);
  },

  setStateCharacterSpeaking() {
    set({
      chatState: 'character_speaking',
      processingMemoryStatusInfo: undefined,
    } satisfies Partial<BaseTurnMachineStoreState>);
  },

  async doWithState<T>(chatState: ChatState, action: () => Promise<T>) {
    const toRestore = {
      chatState: get().chatState,
    };

    set({
      chatState,
    } satisfies Partial<BaseTurnMachineStoreState>);

    try {
      return await action();
    } finally {
      set(toRestore);
    }
  },

  userIsParticipant() {
    const scenario = getRequiredActiveScenario();
    return get().participantIds.some((id) => id === scenario.userCharacterId);
  },

  addChatParticipant(participantId: string) {
    const currentState = get();
    const activeState = getActiveChatStateSnapshotFromState(currentState);

    if (activeState.participantIds.includes(participantId)) {
      return;
    }

    const participant = getRequiredCharacterById(participantId);
    const nextParticipantIds = activeState.participantIds.concat(participantId);
    const nextTranscript =
      activeState.transcript.updateMessagesForParticipantJoining(participant).updatedTranscript;

    set({
      participantIds: nextParticipantIds,
      transcript: nextTranscript,
      preConversationWardrobeSnapshotByCharacterId: {
        ...activeState.preConversationWardrobeSnapshotByCharacterId,
        [participantId]: participant.wardrobes,
      },
    } satisfies Partial<BaseTurnMachineStoreState>);
  },

  removeChatParticipant(participantId: string) {
    const currentState = get();
    const activeState = getActiveChatStateSnapshotFromState(currentState);

    if (!activeState.participantIds.includes(participantId)) {
      return;
    }

    if (activeState.participantIds.length <= 2) {
      throw new Error('Cannot remove participant from a two-person chat');
    }

    const nextParticipantIds = activeState.participantIds.filter((id) => id !== participantId);
    const { updatedTranscript, didPurge } =
      activeState.transcript.updateMessagesForParticipantLeaving(participantId);

    set({
      participantIds: nextParticipantIds,
      transcript: updatedTranscript,
      removedParticipantIds: didPurge
        ? currentState.removedParticipantIds
        : currentState.removedParticipantIds.concat(participantId),
    } satisfies Partial<BaseTurnMachineStoreState>);
  },

  setTranscript(transcript: ConversationTranscript) {
    set({
      transcript,
    } satisfies Partial<BaseTurnMachineStoreState>);
  },

  setChatInstructions(instructions: string) {
    set({ chatInstructions: instructions } satisfies Partial<BaseTurnMachineStoreState>);
  },

  setCharacterChatInstructions(characterId: string, instructions: string) {
    set({
      chatInstructionsByCharacterId: {
        ...get().chatInstructionsByCharacterId,
        [characterId]: instructions,
      },
    } satisfies Partial<BaseTurnMachineStoreState>);
  },

  setEphemeralLocation(setter: (prev: EphemeralLocation) => EphemeralLocation) {
    const userId = useScenarioStore.getState().activeScenario?.userCharacterId;
    assertNonNullish(userId, 'no user for scenario');

    const currentLocation = get().getChatCharacterLocation(userId);
    assertNonNullish(currentLocation, 'unable to get character location');

    set({
      ephemeralLocation: setter(
        get().ephemeralLocation || {
          ...currentLocation,
          ephemeral: true,
        }
      ),
    } satisfies Partial<BaseTurnMachineStoreState>);
  },

  getChatCharacterLocation(
    charId: string,
    getRequiredCharacterById = useScenarioCharacterStore.getState().getRequiredCharacterById,
    activeScenarioMap = useScenarioStore.getState().activeScenarioMap,
    ephemeralLocation = get().ephemeralLocation
  ) {
    if (ephemeralLocation) {
      return ephemeralLocation;
    }

    const character = getRequiredCharacterById(charId);
    assertNonNullish(activeScenarioMap, 'no active scenario map');
    const location = activeScenarioMap.locations.find((l) => l.id === character.locationId);

    return location;
  },
}));

export function buildPersistedActiveChat(state: BaseTurnMachineStoreState): PersistedActiveChat {
  assertNonNullish(state.transcript, 'Cannot persist active chat without a transcript');

  return persistedActiveChatSchema.parse({
    ...state,
    serializedTranscript: state.transcript.serialize(),
  });
}

export function useCurrentTurnCharacterId(): string | undefined {
  return useTurnMachineStore((state) => state.pendingTurnCharacterIds[0]);
}

useScenarioStore.subscribe((newState, prevState) => {
  if (!newState.activeScenario || !prevState.activeScenario) {
    return;
  }

  if (newState.activeScenario.id !== prevState.activeScenario.id) {
    return;
  }

  if (newState.activeScenario.userCharacterId === prevState.activeScenario.userCharacterId) {
    return;
  }

  const turnMachineState = useTurnMachineStore.getState();
  assert(
    turnMachineState.turnMachineState === 'deciding',
    'User character changed when turn machine was not in the deciding state'
  );

  turnMachineState.setCurrentCharacter(newState.activeScenario.userCharacterId);
});
