import * as Database from '../backend_bridge/database.js';
import { assertNonNullish } from '../errors/application_error.js';
import { useScenarioCharacterRelationshipStore } from '../state/scenario_character_relationship_store.js';
import { useScenarioStore } from '../state/scenario_store.js';
import { useSettingsStore } from '../state/settings_store.js';
import type { Character, CharacterRelationship, CharacterRelationships } from './types.js';

export function relationshipKey(fromId: string, toId: string) {
  return `${fromId}__${toId}`;
}

export function createRelationship(
  fromId: string,
  toId: string,
  opts: Partial<CharacterRelationship> = {}
): CharacterRelationship {
  return Database.createPersistedObject({
    fromId,
    toId,
    familiarity: 0,
    descriptor: 'Stranger',
    memory: '',
    nextConversationGoal: '',
    rollingPairwiseSummaries: [],
    rollingOffscreenLearnedInformation: [],
    lastProcessedTurn: -1,
    ...opts,
  });
}

export function applyLazyFamiliarityDecay(
  relationship: CharacterRelationship,
  currentTurnNumber: number
): CharacterRelationship {
  const lastProcessedTurn =
    relationship.lastProcessedTurn === -1 ? currentTurnNumber : relationship.lastProcessedTurn;

  const turnDelta = Math.max(0, currentTurnNumber - lastProcessedTurn);

  if (turnDelta === 0) {
    return {
      ...relationship,
      lastProcessedTurn: currentTurnNumber,
    };
  }

  return {
    ...relationship,
    familiarity: relationship.familiarity - Number(useSettingsStore.getState().familiarityDecay) * turnDelta,
    lastProcessedTurn: currentTurnNumber,
  };
}

export function calculateInteractionUpdatedFamiliarity(
  relationship: CharacterRelationship,
  includeUser: boolean,
  userFamiliarityInteractionMultiplier: number
) {
  return {
    old: relationship.familiarity,
    new:
      relationship.familiarity +
      Number(useSettingsStore.getState().familiarityGain) *
        (includeUser ? userFamiliarityInteractionMultiplier : 1),
  };
}

type FamiliarityUpdateOutput = Pick<CharacterRelationship, 'fromId' | 'toId' | 'familiarity'>;

function applyInteractionFamiliarityOutcome(
  relationshipAB: CharacterRelationship,
  relationshipBA: CharacterRelationship,
  includeUser: boolean,
  userFamiliarityInteractionMultiplier: number
): [FamiliarityUpdateOutput, FamiliarityUpdateOutput] {
  return [
    {
      fromId: relationshipAB.fromId,
      toId: relationshipAB.toId,
      familiarity: calculateInteractionUpdatedFamiliarity(
        relationshipAB,
        includeUser,
        userFamiliarityInteractionMultiplier
      ).new,
    },
    {
      fromId: relationshipBA.fromId,
      toId: relationshipBA.toId,
      familiarity: calculateInteractionUpdatedFamiliarity(
        relationshipBA,
        includeUser,
        userFamiliarityInteractionMultiplier
      ).new,
    },
  ];
}

export function getDirectedRelationship(relationships: CharacterRelationships, from: string, to: string) {
  if (from === to) {
    return createRelationship(from, to, { descriptor: 'Self' });
  }

  const relationship = relationships[relationshipKey(from, to)];
  if (!relationship) {
    return createRelationship(from, to);
  }

  return relationship;
}

export function familiarityRelativeWeight(familiarity: number, familiarityWeightMultiplier = 1) {
  return 1 + familiarityWeightMultiplier * Math.log(1 + familiarity);
}

export async function buildSimpleInteractionRelationshipUpdates(params: { participants: Character[] }) {
  const userCharacterId = useScenarioStore.getState().activeScenario?.userCharacterId;
  assertNonNullish(userCharacterId, 'No user character');

  const { participants } = params;
  const initiator = participants[0];
  assertNonNullish(initiator, 'Simple interaction missing initiator participant');

  const updatedRelationshipLogs: Record<
    string,
    Pick<CharacterRelationship, 'fromId' | 'toId' | 'familiarity'>
  > = {};
  const userFamiliarityInteractionMultiplier =
    useSettingsStore.getState().userFamiliarityInteractionMultiplier;

  await Promise.all(
    participants.flatMap((p1, i) => {
      const others = participants.slice(i + 1);
      return others.map(async (p2) => {
        const updatedRelationships = applyInteractionFamiliarityOutcome(
          await useScenarioCharacterRelationshipStore.getState().getCharacterRelationship(p1.id, p2.id),
          await useScenarioCharacterRelationshipStore.getState().getCharacterRelationship(p2.id, p1.id),
          p1.id === userCharacterId || p2.id === userCharacterId,
          userFamiliarityInteractionMultiplier
        );

        updatedRelationships.forEach((updatedRelationship) => {
          updatedRelationshipLogs[relationshipKey(updatedRelationship.fromId, updatedRelationship.toId)] =
            updatedRelationship;
        });
      });
    })
  );

  return Object.values(updatedRelationshipLogs);
}
