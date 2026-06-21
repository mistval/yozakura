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
import type { OmitFunctions } from '../util/types.js';
import { getRequiredActiveScenario, useScenarioStore } from './scenario_store.js';
import { useScenarioCharacterStore, useUserCharacter } from './scenario_character_store.js';
import { useScenarioCharacterRelationshipStore } from './scenario_character_relationship_store.js';
import { assertNonNullish } from '../errors/application_error.js';

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
  machineState: z.enum(['deciding', 'chatting']),
  pendingTurnCharacterIds: z.array(z.string()),
  chatsSoFar: z.record(z.string(), z.array(z.object({ withIds: z.array(z.string()) }))),
  activeChat: persistedActiveChatSchema.optional(),
});

export type SerializedTurn = z.infer<typeof serializedTurnSchema>;

type BaseChatStoreState = {
  machineState: TurnMachineState | undefined;
  pendingTurnCharacterIds: string[];
  chatsSoFar: Record<string, { withIds: string[] }[]>;

  chatState: 'inactive' | 'awaiting_user_input' | 'generating_image' | 'processing_memories' | 'npc_speaking';
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
  startNewTurn: (allCharacterIds: string[], userCharacterId: string) => void;
  currentCharacterId: () => string | undefined;
  finishCurrentCharacter: () => boolean;
  setMachineState: (machineState: TurnMachineState) => void;
  recordChat: (initiatorId: string, withIds: string[]) => void;
  hasChatted: (characterAId: string, characterBId: string) => boolean;
  beginChat: (args: StartChatSessionArgs) => void;
  enterActiveChat: () => void;
  deactivate: () => void;
  reset: () => void;
  serialize: () => SerializedTurn | undefined;
  hydrate: (snapshot: SerializedTurn) => void;
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

type InactiveChatFields = Omit<
  OmitFunctions<BaseChatStoreState>,
  'machineState' | 'pendingTurnCharacterIds' | 'chatsSoFar'
>;

const inactiveChatState: InactiveChatFields = {
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
  ...inactiveChatState,
  machineState: undefined,
  pendingTurnCharacterIds: [],
  chatsSoFar: {},

  isActive() {
    return get().chatState !== 'inactive';
  },

  startNewTurn(allCharacterIds, userCharacterId) {
    const otherCharacterIds = allCharacterIds.filter((id) => id !== userCharacterId);
    const ordered = [userCharacterId, ..._.shuffle(otherCharacterIds)];

    get().memoryRagHelper?.teardown();
    set({
      ...inactiveChatState,
      machineState: 'deciding',
      pendingTurnCharacterIds: ordered,
      chatsSoFar: {},
    });
  },

  currentCharacterId() {
    return get().pendingTurnCharacterIds[0];
  },

  finishCurrentCharacter() {
    const remaining = get().pendingTurnCharacterIds.slice(1);
    const turnEnded = remaining.length === 0;
    set({
      pendingTurnCharacterIds: remaining,
      machineState: turnEnded ? undefined : 'deciding',
    });
    return turnEnded;
  },

  setMachineState(machineState) {
    set({ machineState });
  },

  recordChat(initiatorId, withIds) {
    const existing = get().chatsSoFar[initiatorId] ?? [];
    set({
      chatsSoFar: {
        ...get().chatsSoFar,
        [initiatorId]: existing.concat({ withIds }),
      },
    });
  },

  hasChatted(characterAId, characterBId) {
    const chatsSoFar = get().chatsSoFar;
    return (
      (chatsSoFar[characterAId] ?? []).some((chat) => chat.withIds.includes(characterBId)) ||
      (chatsSoFar[characterBId] ?? []).some((chat) => chat.withIds.includes(characterAId))
    );
  },

  beginChat(args) {
    const userCharacter = useScenarioCharacterStore.getState().getUserCharacter();
    const participants = getCharactersByIds(args.participantIds);
    const initiatorIsUser = args.initiatorId === userCharacter?.id;

    set({
      ...inactiveChatState,
      machineState: 'chatting',
      participantIds: args.participantIds,
      initiatorId: args.initiatorId,
      gossipTargetCharacterId: args.gossipTargetCharacterId,
      chatState: initiatorIsUser ? 'awaiting_user_input' : 'npc_speaking',
      transcript: ConversationTranscript.new(),
      preConversationWardrobeSnapshotByCharacterId: Object.fromEntries(
        participants.map((p) => [p.id, p.wardrobes])
      ),
    });
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

    set({ memoryRagHelper });
  },

  deactivate() {
    get().memoryRagHelper?.teardown();
    set(inactiveChatState);
  },

  reset() {
    get().memoryRagHelper?.teardown();
    set({
      ...inactiveChatState,
      machineState: undefined,
      pendingTurnCharacterIds: [],
      chatsSoFar: {},
    });
  },

  serialize() {
    const state = get();
    if (state.machineState === undefined) {
      return undefined;
    }

    return {
      machineState: state.machineState,
      pendingTurnCharacterIds: state.pendingTurnCharacterIds,
      chatsSoFar: state.chatsSoFar,
      activeChat: state.machineState === 'chatting' ? buildPersistedActiveChat(state) : undefined,
    };
  },

  hydrate(snapshot) {
    const base = {
      ...inactiveChatState,
      machineState: snapshot.machineState,
      pendingTurnCharacterIds: snapshot.pendingTurnCharacterIds,
      chatsSoFar: snapshot.chatsSoFar,
    };

    if (!snapshot.activeChat) {
      set(base);
      return;
    }

    const { serializedTranscript, ...chatFields } = snapshot.activeChat;
    set({
      ...base,
      ...chatFields,
      chatState: 'awaiting_user_input',
      transcript: ConversationTranscript.deserialize(serializedTranscript),
    });
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

export function buildPersistedActiveChat(state: BaseChatStoreState): PersistedActiveChat {
  assertNonNullish(state.transcript, 'Cannot persist active chat without a transcript');

  return persistedActiveChatSchema.parse({
    ...state,
    serializedTranscript: state.transcript.serialize(),
  });
}

export function useCurrentTurnCharacterId(): string | undefined {
  return useActiveChatStore((state) => state.pendingTurnCharacterIds[0]);
}
