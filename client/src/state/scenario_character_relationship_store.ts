import { LRUCache } from 'lru-cache';
import { create } from 'zustand';
import * as Database from '../backend_bridge/database.js';
import {
  type CharacterPair,
  type CharacterRelationship,
  type CharacterRelationships,
} from '../engine/types.js';
import { applyLazyFamiliarityDecay, createRelationship, relationshipKey } from '../engine/relationship.js';
import { assert } from '../errors/application_error.js';
import { ephemeralStateSlice, IMMEDIATE_SYNC, type SyncOptions } from './ephemeral_state_helper.js';
import { getRequiredActiveScenario } from './scenario_store.js';

type RelationshipSaveKey = Pick<CharacterRelationship, 'fromId' | 'toId'>;

type ScenarioCharacterRelationshipStoreState = {
  getCharacterRelationships: (pairs: CharacterPair[]) => Promise<CharacterRelationships>;
  getCharacterRelationship: (fromId: string, toId: string) => Promise<CharacterRelationship>;
  saveRelationshipFields: (
    saveKey: RelationshipSaveKey,
    fields: Partial<CharacterRelationship>,
    syncOptions?: SyncOptions
  ) => Promise<CharacterRelationship>;
} & ReturnType<typeof ephemeralStateSlice<CharacterRelationship>>;

const RELATIONSHIP_CACHE_MAX = 10_000;
const relationshipCache = new LRUCache<string, CharacterRelationship>({
  max: RELATIONSHIP_CACHE_MAX,
});

function getUniquePairs(pairs: CharacterPair[]): CharacterPair[] {
  const uniquePairByKey = new Map<string, CharacterPair>();

  for (const pair of pairs) {
    const fromId = pair.fromId?.trim();
    const toId = pair.toId?.trim();
    if (!fromId || !toId) {
      continue;
    }

    uniquePairByKey.set(relationshipKey(fromId, toId), {
      fromId,
      toId,
    });
  }

  return [...uniquePairByKey.values()];
}

function createDefaultRelationship(fromId: string, toId: string, currentTurn: number): CharacterRelationship {
  return createRelationship(fromId, toId, { lastProcessedTurn: currentTurn });
}

export const useScenarioCharacterRelationshipStore = create<ScenarioCharacterRelationshipStoreState>(
  (_set, get) => ({
    ...ephemeralStateSlice(
      {
        setStoreState(entities: CharacterRelationship[]) {
          for (const entity of entities) {
            relationshipCache.set(relationshipKey(entity.fromId, entity.toId), entity);
          }
        },

        deleteStoreState(_entities: CharacterRelationship[]) {
          assert(false, 'Character relationship deletion is not implemented.');
        },

        async setDatabaseState(entities: CharacterRelationship[]) {
          const debouncerKey =
            entities.length === 1
              ? relationshipKey(entities[0]!.fromId, entities[0]!.toId)
              : 'scenario_character_relationship.all';

          await Database.doAsDataWrite(
            async () => {
              const latestEntities = entities.map((entity) => {
                const key = relationshipKey(entity.fromId, entity.toId);
                const latest = relationshipCache.get(key);
                if (!latest) {
                  throw new Error('Character relationship was lost from cache before it could be saved.');
                }
                return latest;
              });

              await Database.storeCharacterRelationships(latestEntities);
            },
            'scenario_character_relationship',
            { debouncerKey }
          );
        },

        async deleteDatabaseState(_entities: CharacterRelationship[]) {
          assert(false, 'Character relationship deletion is not implemented.');
        },

        async refreshStoreStateFromDatabase(entities: CharacterRelationship[]) {
          const refreshed = await Database.doAsDataRead(
            () =>
              Database.loadCharacterRelationshipsByPairs(
                entities.map((entity) => ({
                  fromId: entity.fromId,
                  toId: entity.toId,
                }))
              ),
            'character_relationship'
          );

          for (const entity of refreshed) {
            relationshipCache.set(relationshipKey(entity.fromId, entity.toId), entity);
          }
        },
      },
      { discardPendingChangesOnScenarioChange: true }
    ),

    getCharacterRelationships: async (pairs) => {
      const uniquePairs = getUniquePairs(pairs);
      if (uniquePairs.length === 0) {
        return {};
      }

      const scenario = getRequiredActiveScenario();
      const resolved: CharacterRelationships = {};
      const misses: CharacterPair[] = [];

      for (const pair of uniquePairs) {
        const key = relationshipKey(pair.fromId, pair.toId);
        const cached = relationshipCache.get(key);
        if (cached) {
          const decayed = applyLazyFamiliarityDecay(cached, scenario.turnNumber);
          relationshipCache.set(key, decayed);
          resolved[key] = decayed;
          continue;
        }

        misses.push(pair);
      }

      if (misses.length > 0) {
        const fetchedPairs = await Database.doAsDataRead(async () => {
          return Database.loadCharacterRelationshipsByPairs(misses);
        }, 'character_relationship');

        const fetchedByKey = Object.fromEntries(
          fetchedPairs.map((relationship) => [
            relationshipKey(relationship.fromId, relationship.toId),
            relationship,
          ])
        );

        for (const pair of misses) {
          const key = relationshipKey(pair.fromId, pair.toId);
          const loaded =
            fetchedByKey[key] || createDefaultRelationship(pair.fromId, pair.toId, scenario.turnNumber);
          const decayed = applyLazyFamiliarityDecay(loaded, scenario.turnNumber);
          relationshipCache.set(key, decayed);
          resolved[key] = decayed;
        }
      }

      return resolved;
    },

    getCharacterRelationship: async (fromId, toId) => {
      const scenario = getRequiredActiveScenario();
      const relationships = await get().getCharacterRelationships([{ fromId, toId }]);
      const resolved = relationships[relationshipKey(fromId, toId)];

      if (resolved) {
        return resolved;
      }

      return createDefaultRelationship(fromId, toId, scenario.turnNumber);
    },

    saveRelationshipFields: async (saveKey, fields, syncOptions = IMMEDIATE_SYNC) => {
      const existing = await get().getCharacterRelationship(saveKey.fromId, saveKey.toId);
      const updated = {
        ...existing,
        ...fields,
      };

      await get().ephemeralStateHelper.stageUpdatedEntity(updated, syncOptions);

      return updated;
    },
  })
);
