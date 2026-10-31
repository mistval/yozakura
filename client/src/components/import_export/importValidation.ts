import { z } from 'zod';
import {
  characterRelationshipSchema,
  characterSchema,
  scenarioCharacterGroupScheduleSchema,
  scenarioCharacterGroupSchema,
  scenarioSchema,
  storedConversationSchema,
  worldMapSchema,
  type CharacterRelationship,
  type StoredConversation,
  type WorldMap,
} from '../../engine/types.js';
import { templateGroupDataSchema } from '../../engine/prompt_templates/template_types.js';
import { DEFAULT_SETTINGS, settingsSchema } from '../../state/settings_store.js';
import { importStagingDatabase } from '../../backend_bridge/database.js';

export type ValidationResult =
  | {
      valid: true;
    }
  | {
      valid: false;
      errors: string[];
    };

const jsonRowSchema = z.object({
  id: z.string(),
  data: z.string(),
});

const VALIDATION_PAGE_SIZE = 250;

async function validateEntities<T extends { id: string }>(
  loader: (page: number) => Promise<T[]>,
  schema: z.ZodType<unknown>,
  entityTypeName: string,
  errors: string[]
): Promise<void> {
  let page = 0;
  while (true) {
    let items: T[];
    try {
      items = await loader(page);
    } catch (e) {
      errors.push(
        `Failed to load ${entityTypeName} (page ${page}): ${e instanceof Error ? e.message : String(e)}`
      );
      break;
    }

    if (items.length === 0) {
      break;
    }

    for (const item of items) {
      const parsed = schema.safeParse(item);
      if (!parsed.success) {
        errors.push(`Invalid ${entityTypeName} ${item.id}: ${parsed.error.message}`);
      }
    }

    page++;
  }
}

function once<T extends { id: string }>(loader: () => Promise<T[]>): (page: number) => Promise<T[]> {
  return (page: number) => (page === 0 ? loader() : Promise.resolve([]));
}

async function loadPagedRelationships(
  scenId: string,
  page: number
): Promise<Array<CharacterRelationship & { id: string }>> {
  const rows = await importStagingDatabase.dbAll(
    `
      SELECT cr.id, cr.data
      FROM import_staging.character_relationship cr
      JOIN import_staging.scenario_character sc ON cr.from_id = sc.id
      WHERE sc.scenario_id = ?
      ORDER BY cr.rowid ASC
      LIMIT ? OFFSET ?
    `.trim(),
    [[scenId, VALIDATION_PAGE_SIZE, page * VALIDATION_PAGE_SIZE]],
    jsonRowSchema
  );

  return rows.map((row) => {
    try {
      const data = JSON.parse(row.data);
      return {
        id: row.id,
        ...(typeof data === 'object' && data !== null ? data : {}),
      };
    } catch {
      return { id: row.id };
    }
  });
}

async function loadPagedConversations(
  scenId: string,
  page: number
): Promise<Array<StoredConversation & { id: string }>> {
  const rows = await importStagingDatabase.dbAll(
    `
      SELECT id, data
      FROM import_staging.conversation
      WHERE scenario_id = ?
      ORDER BY rowid ASC
      LIMIT ? OFFSET ?
    `.trim(),
    [[scenId, VALIDATION_PAGE_SIZE, page * VALIDATION_PAGE_SIZE]],
    jsonRowSchema
  );

  return rows.map((row) => {
    try {
      const data = JSON.parse(row.data);
      return {
        id: row.id,
        ...(typeof data === 'object' && data !== null ? data : {}),
      };
    } catch {
      return { id: row.id };
    }
  });
}

export async function validateStagedData(options: {
  selectedScenarioIds: string[];
  selectedScenarioCharactersIds?: string[];
  selectedScenarioGroupsIds?: string[];
  selectedScenarioSchedulesIds?: string[];
  selectedScenarioMemoriesIds?: string[];
  selectedScenarioConversationsIds?: string[];
  selectedMapIds: string[];
  selectedGlobalCharacterIds: string[];
  selectedTemplateChainIds: string[];
}): Promise<ValidationResult> {
  const errors: string[] = [];

  // 1. Validate selected Maps
  if (options.selectedMapIds.length > 0) {
    await validateEntities(
      once(async () => {
        const maps: WorldMap[] = [];
        for (const mapId of options.selectedMapIds) {
          const map = await importStagingDatabase.loadMap(mapId);
          if (!map) {
            errors.push(`Map not found in staging database: ${mapId}`);
          } else {
            maps.push(map);
          }
        }
        return maps;
      }),
      worldMapSchema,
      'map',
      errors
    );
  }

  // 2. Validate selected Global Characters
  if (options.selectedGlobalCharacterIds.length > 0) {
    const idSet = new Set(options.selectedGlobalCharacterIds);
    await validateEntities(
      once(async () => {
        const allGlobalChars = await importStagingDatabase.loadGlobalCharacters();
        return allGlobalChars.filter((c) => idSet.has(c.id));
      }),
      characterSchema,
      'global character',
      errors
    );
  }

  // 3. Validate selected Scenarios and child rows
  for (const scenId of options.selectedScenarioIds) {
    try {
      const scenario = await importStagingDatabase.loadScenario(scenId);
      if (!scenario) {
        errors.push(`Scenario not found in staging database: ${scenId}`);
        continue;
      }
      const parsedScen = scenarioSchema.safeParse(scenario);
      if (!parsedScen.success) {
        errors.push(`Invalid scenario data for ${scenId}: ${parsedScen.error.message}`);
      }

      // Scenario characters
      if (!options.selectedScenarioCharactersIds || options.selectedScenarioCharactersIds.includes(scenId)) {
        await validateEntities(
          once(() => importStagingDatabase.loadScenarioCharacters(scenId)),
          characterSchema,
          `scenario character in scenario ${scenId}`,
          errors
        );
      }

      // Groups
      if (!options.selectedScenarioGroupsIds || options.selectedScenarioGroupsIds.includes(scenId)) {
        await validateEntities(
          once(() => importStagingDatabase.loadScenarioCharacterGroups(scenId)),
          scenarioCharacterGroupSchema,
          `character group in scenario ${scenId}`,
          errors
        );
      }

      // Schedules
      if (!options.selectedScenarioSchedulesIds || options.selectedScenarioSchedulesIds.includes(scenId)) {
        await validateEntities(
          once(() => importStagingDatabase.loadGroupSchedules(scenId)),
          scenarioCharacterGroupScheduleSchema,
          `schedule in scenario ${scenId}`,
          errors
        );
      }

      // Relationships (paged)
      const shouldValidateMemories =
        (!options.selectedScenarioMemoriesIds || options.selectedScenarioMemoriesIds.includes(scenId)) &&
        (!options.selectedScenarioCharactersIds || options.selectedScenarioCharactersIds.includes(scenId));
      if (shouldValidateMemories) {
        await validateEntities(
          (page) => loadPagedRelationships(scenId, page),
          characterRelationshipSchema,
          `character relationship in scenario ${scenId}`,
          errors
        );
      }

      // Conversations (paged)
      if (
        !options.selectedScenarioConversationsIds ||
        options.selectedScenarioConversationsIds.includes(scenId)
      ) {
        await validateEntities(
          (page) => loadPagedConversations(scenId, page),
          storedConversationSchema,
          `conversation in scenario ${scenId}`,
          errors
        );
      }
    } catch (e) {
      errors.push(`Failed to validate scenario ${scenId}: ${e instanceof Error ? e.message : String(e)}`);
    }
  }

  // 4. Validate selected Template Chains
  if (options.selectedTemplateChainIds.length > 0) {
    try {
      const stagedSettings = await importStagingDatabase.loadKeyValue(
        'settings',
        z.record(z.string(), z.unknown())
      );
      if (stagedSettings?.templateGroupData) {
        const parsedTpl = templateGroupDataSchema.safeParse(stagedSettings.templateGroupData);
        if (!parsedTpl.success) {
          errors.push(`Invalid prompt template chains format: ${parsedTpl.error.message}`);
        } else {
          // Verify merging onto DEFAULT_SETTINGS satisfies settingsSchema
          const merged = {
            ...DEFAULT_SETTINGS,
            templateGroupData: parsedTpl.data,
          };
          const parsedSettings = settingsSchema.safeParse(merged);
          if (!parsedSettings.success) {
            errors.push(`Merged settings validation failed: ${parsedSettings.error.message}`);
          }
        }
      }
    } catch (e) {
      errors.push(`Failed to read staged template settings: ${e instanceof Error ? e.message : String(e)}`);
    }
  }

  if (errors.length > 0) {
    return { valid: false, errors };
  }

  return { valid: true };
}
