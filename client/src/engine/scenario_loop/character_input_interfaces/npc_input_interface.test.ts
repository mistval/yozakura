import { describe, expect, it } from 'vitest';
import {
  applyRemoteChatConstraint,
  NPCInputInterface,
  type ChatCandidate,
  type NpcCharacterRelationship,
  type NpcChatCharacter,
  type NpcChatSettings,
  type NpcInputResolvers,
} from './npc_input_interface';
import { relationshipKey } from '../../relationship';
import type { ScheduledMove } from '../../character_schedule/schedule_movement';

function char(id: string): NpcChatCharacter {
  return { id, nextConversationWithCharacterId: '' };
}

function cand(id: string, isColocated: boolean, hasMet: boolean, familiarity = 0): ChatCandidate {
  return { character: char(id), isColocated, hasMet, familiarity };
}

describe('applyRemoteChatConstraint', () => {
  it('keeps unmet co-located candidates when the selection is in person', () => {
    const ranked = [cand('strangerColocated', true, false), cand('metColocated', true, true)];

    const result = applyRemoteChatConstraint(ranked, 2);

    expect(result.map((c) => c.character.id)).toEqual(['strangerColocated', 'metColocated']);
  });

  it('drops unmet picks and pulls met candidates from further down once the selection is remote', () => {
    const ranked = [
      cand('metRemote', false, true),
      cand('strangerColocated', true, false),
      cand('metColocated', true, true),
    ];

    // Top 2 would be [metRemote, strangerColocated]; metRemote makes it remote, so the unmet
    // strangerColocated is dropped and metColocated is pulled up from index 2.
    const result = applyRemoteChatConstraint(ranked, 2);

    expect(result.map((c) => c.character.id)).toEqual(['metRemote', 'metColocated']);
  });

  it('returns fewer than the max when a remote selection lacks enough met candidates', () => {
    const ranked = [cand('metRemote', false, true), cand('strangerColocated', true, false)];

    const result = applyRemoteChatConstraint(ranked, 2);

    expect(result.map((c) => c.character.id)).toEqual(['metRemote']);
  });
});

const DEFAULT_SETTINGS: NpcChatSettings = {
  npcChatRate: 1, // random() === 0 < 1 → always attempt a chat
  npcTriggeredGroupChatRate: 1, // → always a group chat
  npcGroupChatAdditionalParticipants: 5, // large, so every candidate is selected
  npcRemoteChatRate: 1, // overridden per test via allowRemote
  familiarityWeightMultiplier: 1,
  richNpcInteractionRate: 1,
};

function makeResolvers(opts: {
  npc: NpcChatCharacter;
  characters: NpcChatCharacter[];
  locationById: Record<string, string>;
  metIds: string[];
  allowRemote: boolean;
  scheduledMove?: ScheduledMove;
}): NpcInputResolvers {
  const { characters, locationById, metIds, allowRemote } = opts;
  const byId = new Map(characters.map((c) => [c.id, c]));

  return {
    getRequiredCharacterById: (id) => {
      const character = byId.get(id);
      if (!character) {
        throw new Error(`No character ${id}`);
      }
      return character;
    },
    getCharacterById: (id) => byId.get(id),
    getAllCharacters: () => characters,
    getUserCharacterId: () => 'user',
    getCharacterLocationId: (id) => {
      const locationId = locationById[id];
      if (!locationId) {
        throw new Error(`No location for ${id}`);
      }
      return locationId;
    },
    hasChatted: () => false,
    recordChat: () => {},
    clearForcedConversationTarget: () => {},
    getCharacterRelationships: async (pairs) => {
      const relationships: Record<string, NpcCharacterRelationship> = {};
      for (const { fromId, toId } of pairs) {
        relationships[relationshipKey(fromId, toId)] = {
          familiarity: metIds.includes(toId) ? 5 : 0,
          rollingPairwiseSummaries: metIds.includes(toId) ? [{}] : [],
        };
      }
      return relationships;
    },
    getScheduledMove: () =>
      opts.scheduledMove ?? { forceMove: false, destinationLocationId: 'L1', consumesTurn: true },
    userIsDisabled: () => false,
    getSettings: () => ({ ...DEFAULT_SETTINGS, npcRemoteChatRate: allowRemote ? 1 : 0 }),
    random: () => 0,
  };
}

async function chatParticipants(resolvers: NpcInputResolvers, npcId: string): Promise<Set<string>> {
  const { move } = await new NPCInputInterface(npcId, resolvers).getNextTurnMove();
  if (move.actionType !== 'chat') {
    throw new Error(`Expected a chat move, got ${move.actionType}`);
  }
  return new Set(move.participantIds);
}

describe('NPCInputInterface chat candidate selection', () => {
  it('excludes the unmet co-located character once a remote character is in the chat', async () => {
    const npc = char('npc');
    const metColocated = char('metColocated');
    const metRemote = char('metRemote');
    const strangerColocated = char('strangerColocated');
    const strangerRemote = char('strangerRemote');

    const participants = await chatParticipants(
      makeResolvers({
        npc,
        characters: [npc, metColocated, metRemote, strangerColocated, strangerRemote],
        locationById: {
          npc: 'L1',
          metColocated: 'L1',
          strangerColocated: 'L1',
          metRemote: 'L2',
          strangerRemote: 'L2',
        },
        metIds: [metColocated.id, metRemote.id],
        allowRemote: true,
      }),
      npc.id
    );

    expect(participants.has(metColocated.id)).toBe(true);
    expect(participants.has(metRemote.id)).toBe(true);
    expect(participants.has(strangerColocated.id)).toBe(false);
    expect(participants.has(strangerRemote.id)).toBe(false);
  });

  it('an in-person chat may include a co-located stranger but never a remote character', async () => {
    const npc = char('npc');
    const metColocated = char('metColocated');
    const strangerColocated = char('strangerColocated');
    const metRemote = char('metRemote');

    const participants = await chatParticipants(
      makeResolvers({
        npc,
        characters: [npc, metColocated, strangerColocated, metRemote],
        locationById: { npc: 'L1', metColocated: 'L1', strangerColocated: 'L1', metRemote: 'L2' },
        metIds: [metColocated.id, metRemote.id],
        allowRemote: false,
      }),
      npc.id
    );

    expect(participants.has(metColocated.id)).toBe(true);
    expect(participants.has(strangerColocated.id)).toBe(true);
    expect(participants.has(metRemote.id)).toBe(false);
  });

  it('keeps a co-located stranger on a remote-allowed turn when no remote character is selected', async () => {
    const npc = char('npc');
    const metColocated = char('metColocated');
    const strangerColocated = char('strangerColocated');

    const participants = await chatParticipants(
      makeResolvers({
        npc,
        characters: [npc, metColocated, strangerColocated],
        locationById: { npc: 'L1', metColocated: 'L1', strangerColocated: 'L1' },
        metIds: [metColocated.id],
        allowRemote: true,
      }),
      npc.id
    );

    // No remote character is reachable, so the chat is in person and the stranger is allowed.
    expect(participants.has(strangerColocated.id)).toBe(true);
    expect(participants.has(metColocated.id)).toBe(true);
  });

  it('does not start a chat with an out-of-room stranger', async () => {
    const npc = char('npc');
    const strangerRemote = char('strangerRemote');

    const resolvers = makeResolvers({
      npc,
      characters: [npc, strangerRemote],
      locationById: { npc: 'L1', strangerRemote: 'L2' },
      metIds: [],
      allowRemote: true,
      scheduledMove: { forceMove: false, destinationLocationId: 'L9', consumesTurn: true },
    });

    const { move } = await new NPCInputInterface(npc.id, resolvers).getNextTurnMove();

    expect(move.actionType).toBe('move');
  });
});
