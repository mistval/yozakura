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
import * as Database from '../backend_bridge/database.js';
import { getRequiredActiveScenario, useScenarioStore } from './scenario_store.js';
import { useScenarioCharacterStore, useUserCharacter } from './scenario_character_store.js';
import { useScenarioCharacterRelationshipStore } from './scenario_character_relationship_store.js';
import { assertNonNullish } from '../errors/application_error.js';

type StartChatSessionArgs = {
  participantIds: string[];
  initiatorId: string;
  gossipTargetCharacterId: string | undefined;
};

const persistedActiveChatSchema = z.object({
  participantIds: z.array(z.string()),
  removedParticipantIds: z.array(z.string()),
  chatMode: chatMediumSchema,
  gossipTargetCharacterId: z.string().optional(),
  serializedTranscript: serializedConversationTranscriptSchema,
  preConversationWardrobeSnapshotByCharacterId: z.record(z.string(), z.array(wardrobeSchema)),
  ephemeralLocation: ephemeralLocationSchema.optional(),
  initiatorId: z.string().optional(),
});

type PersistedActiveChat = z.infer<typeof persistedActiveChatSchema>;

function activeChatPersistenceKey(scenarioId: string) {
  return `scenario_${scenarioId}_active_chat`;
}

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

  isActive: () => boolean;
  setTranscript: (transcript: ConversationTranscript) => void;
  activate: (args: StartChatSessionArgs) => void;
  restoreFromPersisted: (persisted: PersistedActiveChat) => void;
  deactivate: () => void;
  setEphemeralLocation: (setter: (prev: EphemeralLocation) => EphemeralLocation) => void;
  userIsParticipant: () => boolean;
  addChatParticipant: (participantId: string) => void;
  removeChatParticipant: (participantId: string) => void;
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
};

function getRequiredCharacterById(characterId: string): Character {
  return useScenarioCharacterStore.getState().getRequiredCharacterById(characterId);
}

function getCharactersByIds(characterIds: string[]): Character[] {
  return useScenarioCharacterStore.getState().getCharactersByIds(characterIds);
}

function calculateChatMedium(participants: Character[]): ChatMedium {
  const uniqueLocationIds = new Set(participants.map((participant) => participant.locationId));
  return uniqueLocationIds.size === 1 ? 'in_person' : 'remote';
}

function calculateChatMediumFromIds(participantIds: string[]): ChatMedium {
  const participants = getCharactersByIds(participantIds);
  return calculateChatMedium(participants);
}

function getActiveChatStateSnapshotFromState(state: BaseChatStoreState): ActiveChatStoreState {
  if (state.chatState === 'inactive') {
    throw new Error('Requesting active chat state, but chat is not active');
  }

  return state as ActiveChatStoreState;
}

export function getActiveChatParticipants(): Character[] {
  return getCharactersByIds(useActiveChatStore.getState().participantIds);
}

export function useActiveChatParticipants(): Character[] {
  const participantIds = useActiveChatStore((state) => state.participantIds);
  const charactersById = useScenarioCharacterStore((state) => state.scenarioCharactersById);

  return participantIds
    .map((id) => charactersById[id])
    .filter((character): character is Character => Boolean(character));
}

export function getActiveChatMedium(): ChatMedium {
  return calculateChatMedium(getActiveChatParticipants());
}

export function useActiveChatMedium(): ChatMedium {
  const participants = useActiveChatParticipants();
  return calculateChatMedium(participants);
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
      chatMode: calculateChatMedium(participants),
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
      chatMode: calculateChatMediumFromIds(nextParticipantIds),
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

    if (participantId === getRequiredActiveScenario().userCharacterId) {
      throw new Error('Cannot remove user from chat');
    }

    const nextParticipantIds = activeState.participantIds.filter((id) => id !== participantId);
    const nextTranscript = activeState.transcript.updateMessagesForParticipantLeaving(participantId);

    set({
      participantIds: nextParticipantIds,
      transcript: nextTranscript,
      chatMode: calculateChatMediumFromIds(nextParticipantIds),
      removedParticipantIds: currentState.removedParticipantIds.concat(participantId),
    });
  },

  setTranscript(transcript: ConversationTranscript) {
    set({
      transcript,
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

    assertNonNullish(location, 'Character in non-existent location');
    return location;
  },
}));

function buildPersistedActiveChat(state: BaseChatStoreState): PersistedActiveChat {
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
  };
}

function activeChatShouldPersist(state: BaseChatStoreState): boolean {
  const scenario = useScenarioStore.getState().activeScenario;
  if (!scenario || state.chatState === 'inactive' || !state.transcript) {
    return false;
  }

  return state.transcript.hasAtLeastOneCharacterMessage();
}

function persistActiveChat() {
  const scenario = useScenarioStore.getState().activeScenario;
  if (!scenario) {
    return;
  }

  const key = activeChatPersistenceKey(scenario.id);

  void Database.doAsDataWrite(
    async () => {
      const state = useActiveChatStore.getState();
      if (useScenarioStore.getState().activeScenario?.id !== scenario.id || !activeChatShouldPersist(state)) {
        return;
      }

      await Database.storeKeyValue(key, buildPersistedActiveChat(state), persistedActiveChatSchema);
    },
    'active_chat',
    { debouncerKey: key }
  );
}

export function clearPersistedActiveChat(scenarioId: string) {
  const key = activeChatPersistenceKey(scenarioId);
  void Database.doAsDataWrite(
    async () => {
      await Database.deleteKeyValue(key);
    },
    'active_chat',
    { debouncerKey: key }
  );
}

function whenScenarioCharactersLoaded(): Promise<void> {
  if (useScenarioCharacterStore.getState().scenarioCharactersAreLoaded) {
    return Promise.resolve();
  }

  return new Promise<void>((resolve) => {
    const unsubscribe = useScenarioCharacterStore.subscribe((state) => {
      if (state.scenarioCharactersAreLoaded) {
        unsubscribe();
        resolve();
      }
    });
  });
}

async function restoreActiveChatIfPresent() {
  await whenScenarioCharactersLoaded();

  const scenario = useScenarioStore.getState().activeScenario;
  if (!scenario) {
    return;
  }

  const key = activeChatPersistenceKey(scenario.id);
  const restored = await Database.doAsDataRead(
    () => Database.loadKeyValue(key, persistedActiveChatSchema),
    'active_chat',
    { debouncerKey: key }
  );

  if (
    restored &&
    !useActiveChatStore.getState().isActive() &&
    useScenarioStore.getState().activeScenario?.id === scenario.id
  ) {
    useActiveChatStore.getState().restoreFromPersisted(restored);
  }
}

let activeChatRestoreSettled: Promise<void> = useScenarioStore.getState().activeScenario
  ? restoreActiveChatIfPresent()
  : Promise.resolve();

useScenarioStore.subscribe((newState, prevState) => {
  if (newState.activeScenario && newState.activeScenario.id !== prevState.activeScenario?.id) {
    activeChatRestoreSettled = restoreActiveChatIfPresent();
  }
});

export function whenActiveChatRestoreSettled(): Promise<void> {
  return activeChatRestoreSettled;
}

useActiveChatStore.subscribe((newState, prevState) => {
  if (newState.transcript !== prevState.transcript && activeChatShouldPersist(newState)) {
    persistActiveChat();
  }
});
