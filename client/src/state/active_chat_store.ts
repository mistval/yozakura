import { create } from 'zustand';
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
  chatMediumSchema,
  ephemeralLocationSchema,
  serializedConversationTranscriptSchema,
  wardrobeSchema,
} from '../engine/types.js';
import { ConversationTranscript } from '../engine/chat/transcript.js';
import { MemoryRAGHelper } from '../engine/memory_rag_helper.js';
import type { OmitFunctions } from '../util/types.js';
import { getRequiredActiveScenario, useScenarioStore } from './scenario_store.js';
import { useScenarioCharacterStore, useUserCharacter } from './scenario_character_store.js';
import { useScenarioCharacterRelationshipStore } from './scenario_character_relationship_store.js';
import { assertNonNullish } from '../errors/application_error.js';

type StartChatSessionArgs = {
  participantIds: string[];
  initiatorId: string;
  gossipTargetCharacterId: string | undefined;
};

export const persistedActiveChatSchema = z.object({
  participantIds: z.array(z.string()),
  removedParticipantIds: z.array(z.string()),
  chatMode: chatMediumSchema,
  gossipTargetCharacterId: z.string().optional(),
  serializedTranscript: serializedConversationTranscriptSchema,
  preConversationWardrobeSnapshotByCharacterId: z.record(z.string(), z.array(wardrobeSchema)),
  ephemeralLocation: ephemeralLocationSchema.optional(),
  initiatorId: z.string().optional(),
  chatInstructions: z.string().optional(),
  chatInstructionsByCharacterId: z.record(z.string(), z.string()).optional(),
});

export type PersistedActiveChat = z.infer<typeof persistedActiveChatSchema>;

type BaseChatStoreState = {
  chatState: 'inactive' | 'awaiting_user_input' | 'generating_image' | 'processing_memories' | 'npc_speaking';
  processingMemoryStatusInfo: string | undefined;
  participantIds: string[];
  removedParticipantIds: string[];
  chatMode: ChatMedium | undefined;
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
  activate: (args: StartChatSessionArgs) => void;
  restoreFromPersisted: (persisted: PersistedActiveChat) => void;
  deactivate: () => void;
  setEphemeralLocation: (setter: (prev: EphemeralLocation) => EphemeralLocation) => void;
  userIsParticipant: () => boolean;
  addChatParticipant: (participantId: string) => void;
  removeChatParticipant: (participantId: string) => void;
  setChatInstructions: (instructions: string) => void;
  setCharacterChatInstructions: (characterId: string, instructions: string) => void;
  setStateProcessingMemories: (info: string) => void;
  setStateAwaitingUserInput: () => void;
  setStateNpcSpeaking: () => void;
  doWithStateGenerationImage: <T>(action: () => Promise<T>) => Promise<T>;
  getChatCharacterLocation: (
    charId: string,
    getCharacterById?: (id: string) => Character,
    activeScenarioMap?: WorldMap,
    ephemeralLocation?: EphemeralLocation
  ) => WorldMapLocation | undefined;
};

type ActiveChatStoreState = OmitFunctions<BaseChatStoreState> & {
  chatState: 'awaiting_user_input' | 'generating_image' | 'processing_memories' | 'npc_speaking';
  participantIds: string[];
  removedParticipantIds: string[];
  gossipTargetCharacterId: string | undefined;
  transcript: ConversationTranscript;
  preConversationWardrobeSnapshotByCharacterId: Record<string, Wardrobe[]>;
  ephemeralLocation: WorldMapLocation | undefined;
  initiatorId: string | undefined;
  memoryRagHelper: MemoryRAGHelper;
};

const inactiveState: OmitFunctions<BaseChatStoreState> = {
  chatState: 'inactive',
  chatMode: 'in_person',
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

function getActiveChatStateSnapshotFromState(state: BaseChatStoreState): ActiveChatStoreState {
  if (state.chatState === 'inactive') {
    throw new Error('Requesting active chat state, but chat is not active');
  }

  return state as ActiveChatStoreState;
}

export function getActiveChatParticipants(
  options: {
    includeRemoved?: boolean;
    includeUser?: boolean;
  } = {}
): Character[] {
  const state = useActiveChatStore.getState();
  const scenarioState = useScenarioStore.getState();
  const { includeRemoved = false, includeUser = true } = options;

  return getCharactersByIds(
    state.participantIds
      .concat(includeRemoved ? state.removedParticipantIds : [])
      .filter((id) => includeUser || id !== scenarioState.activeScenario?.userCharacterId)
  );
}

export function useActiveChatParticipants(): Character[] {
  const participantIds = useActiveChatStore((state) => state.participantIds);
  const charactersById = useScenarioCharacterStore((state) => state.scenarioCharactersById);

  return participantIds
    .map((id) => charactersById[id])
    .filter((character): character is Character => Boolean(character));
}

export function getActiveChatMedium(
  participants = useActiveChatStore.getState().participantIds,
  getRequiredCharacterById = useScenarioCharacterStore.getState().getRequiredCharacterById,
  getCharacterLocation = useActiveChatStore.getState().getChatCharacterLocation,
  map = useScenarioStore.getState().activeScenarioMap,
  ephemeralLocation = useActiveChatStore.getState().ephemeralLocation
): ChatMedium {
  const allLocations = new Set(
    participants.map((p) => getCharacterLocation(p, getRequiredCharacterById, map, ephemeralLocation)?.id)
  );

  return allLocations.size === 1 ? 'in_person' : 'remote';
}

export function useActiveChatMedium(): ChatMedium {
  const getCharacterLocation = useActiveChatStore((s) => s.getChatCharacterLocation);
  const getRequiredCharacterById = useScenarioCharacterStore((s) => s.getRequiredCharacterById);
  const ephemeralLocation = useActiveChatStore((s) => s.ephemeralLocation);
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
  const getCharacterLocation = useActiveChatStore((s) => s.getChatCharacterLocation);
  const getRequiredCharacterById = useScenarioCharacterStore((s) => s.getRequiredCharacterById);
  const ephemeralLocation = useActiveChatStore((s) => s.ephemeralLocation);
  const userCharacter = useUserCharacter();
  const map = useScenarioStore((s) => s.activeScenarioMap);

  if (!userCharacter || !map) {
    return undefined;
  }

  return getCharacterLocation(userCharacter.id, getRequiredCharacterById, map, ephemeralLocation);
}

export async function getActiveChatGossipCharacter(fromCharacterId?: string) {
  const activeChatStore = useActiveChatStore.getState();
  if (!activeChatStore.gossipTargetCharacterId) {
    return {};
  }

  const gossipTargetCharacter = getRequiredCharacterById(activeChatStore.gossipTargetCharacterId);
  const gossipTargetRelationship = fromCharacterId
    ? await useScenarioCharacterRelationshipStore
        .getState()
        .getCharacterRelationship(fromCharacterId, activeChatStore.gossipTargetCharacterId)
    : undefined;

  return {
    gossipTargetCharacter,
    gossipTargetRelationship,
  };
}

export function getAllActiveChatSpeakers(): Character[] {
  const transcript = useActiveChatStore.getState().transcript;
  assertNonNullish(transcript, 'Expected transcript to be available when getting all speakers');

  const speakerIds = transcript.getAllSpeakerIds();
  const scenarioCharacterStore = useScenarioCharacterStore.getState();

  return speakerIds
    .map((id) => scenarioCharacterStore.scenarioCharactersById[id])
    .filter((character): character is Character => Boolean(character));
}

export const useActiveChatStore = create<BaseChatStoreState>((set, get) => ({
  ...inactiveState,

  isActive() {
    return get().chatState !== 'inactive';
  },

  activate(args) {
    const userCharacter = useScenarioCharacterStore.getState().getUserCharacter();
    const participants = getCharactersByIds(args.participantIds);
    const initiatorIsUser = args.initiatorId === userCharacter?.id;

    set({
      ...args,
      chatState: initiatorIsUser ? 'awaiting_user_input' : 'npc_speaking',
      processingMemoryStatusInfo: undefined,
      transcript: ConversationTranscript.new(),
      memoryRagHelper: new MemoryRAGHelper(),
      preConversationWardrobeSnapshotByCharacterId: Object.fromEntries(
        participants.map((p) => [p.id, p.wardrobes])
      ),
    });
  },

  restoreFromPersisted(persisted) {
    const transcript = ConversationTranscript.deserialize(persisted.serializedTranscript);
    const memoryRagHelper = new MemoryRAGHelper();

    set({
      chatState: 'awaiting_user_input',
      processingMemoryStatusInfo: undefined,
      participantIds: persisted.participantIds,
      removedParticipantIds: persisted.removedParticipantIds,
      chatMode: persisted.chatMode,
      gossipTargetCharacterId: persisted.gossipTargetCharacterId,
      transcript,
      preConversationWardrobeSnapshotByCharacterId: persisted.preConversationWardrobeSnapshotByCharacterId,
      ephemeralLocation: persisted.ephemeralLocation,
      initiatorId: persisted.initiatorId,
      memoryRagHelper,
      chatInstructions: persisted.chatInstructions ?? '',
      chatInstructionsByCharacterId: persisted.chatInstructionsByCharacterId ?? {},
    });

    for (const rawMessage of transcript.getRawMessages()) {
      if (rawMessage.messageType === 'chat_message') {
        memoryRagHelper.collectMentionedOffscreenCharacterIds(rawMessage.id, rawMessage.message);
      }
    }
  },

  deactivate() {
    get().memoryRagHelper?.teardown();
    set(inactiveState);
  },

  setStateAwaitingUserInput() {
    set({
      chatState: 'awaiting_user_input',
      processingMemoryStatusInfo: undefined,
    });
  },

  setStateProcessingMemories(statusInfo: string) {
    set({
      chatState: 'processing_memories',
      processingMemoryStatusInfo: statusInfo,
    });
  },

  setStateNpcSpeaking() {
    set({
      chatState: 'npc_speaking',
      processingMemoryStatusInfo: undefined,
    });
  },

  async doWithStateGenerationImage<T>(action: () => Promise<T>) {
    const toRestore = {
      chatState: get().chatState,
      processingMemoryStatusInfo: get().processingMemoryStatusInfo,
    };

    set({
      chatState: 'generating_image',
      processingMemoryStatusInfo: undefined,
    });

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
    });
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
    });
  },

  setTranscript(transcript: ConversationTranscript) {
    set({
      transcript,
    });
  },

  setChatInstructions(instructions: string) {
    set({ chatInstructions: instructions });
  },

  setCharacterChatInstructions(characterId: string, instructions: string) {
    set({
      chatInstructionsByCharacterId: {
        ...get().chatInstructionsByCharacterId,
        [characterId]: instructions,
      },
    });
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
    });
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

// Pure serialization of the active chat for persistence. Database I/O and restore scheduling are
// owned by the scenario loop (see engine/scenario_loop/turn_persistence.ts), which persists the
// active chat together with the turn state in a single row.
export function buildPersistedActiveChat(state: BaseChatStoreState): PersistedActiveChat {
  assertNonNullish(state.transcript, 'Cannot persist active chat without a transcript');

  return {
    participantIds: state.participantIds,
    removedParticipantIds: state.removedParticipantIds,
    chatMode: state.chatMode ?? 'in_person',
    gossipTargetCharacterId: state.gossipTargetCharacterId,
    serializedTranscript: state.transcript.serialize(),
    preConversationWardrobeSnapshotByCharacterId: state.preConversationWardrobeSnapshotByCharacterId,
    ephemeralLocation: state.ephemeralLocation,
    initiatorId: state.initiatorId,
    chatInstructions: state.chatInstructions,
    chatInstructionsByCharacterId: state.chatInstructionsByCharacterId,
  };
}
