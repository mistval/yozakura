import { z } from 'zod';
import {
  characterRelationshipSchema,
  characterSchema,
  scenarioCharacterGroupScheduleSchema,
  scenarioCharacterGroupSchema,
  scenarioEventSchema,
  scenarioSchema,
  storedConversationSchema,
  worldMapSchema,
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

export async function validateStagedData(options: {
  selectedScenarioIds: string[];
  selectedMapIds: string[];
  selectedGlobalCharacterIds: string[];
  selectedTemplateChainIds: string[];
}): Promise<ValidationResult> {
  const errors: string[] = [];

  // 1. Validate selected Maps
  for (const mapId of options.selectedMapIds) {
    try {
      const map = await importStagingDatabase.loadMap(mapId);
      if (!map) {
        errors.push(`Map not found in staging database: ${mapId}`);
        continue;
      }
      const parsed = worldMapSchema.safeParse(map);
      if (!parsed.success) {
        errors.push(`Invalid map format for '${map.name}' (${mapId}): ${parsed.error.message}`);
      }
    } catch (e) {
      errors.push(`Failed to read map ${mapId}: ${e instanceof Error ? e.message : String(e)}`);
    }
  }

  // 2. Validate selected Global Characters
  if (options.selectedGlobalCharacterIds.length > 0) {
    try {
      const allGlobalChars = await importStagingDatabase.loadGlobalCharacters();
      const selectedChars = allGlobalChars.filter((c) => options.selectedGlobalCharacterIds.includes(c.id));
      for (const char of selectedChars) {
        const parsed = characterSchema.safeParse(char);
        if (!parsed.success) {
          errors.push(
            `Invalid global character format for '${char.firstName} ${char.lastName}' (${char.id}): ${parsed.error.message}`
          );
        }
      }
    } catch (e) {
      errors.push(`Failed to read global characters: ${e instanceof Error ? e.message : String(e)}`);
    }
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
      const chars = await importStagingDatabase.loadScenarioCharacters(scenId);
      for (const char of chars) {
        const parsedChar = characterSchema.safeParse(char);
        if (!parsedChar.success) {
          errors.push(
            `Invalid scenario character '${char.firstName} ${char.lastName}' in scenario ${scenId}: ${parsedChar.error.message}`
          );
        }
      }

      // Groups and schedules
      const groups = await importStagingDatabase.loadScenarioCharacterGroups(scenId);
      for (const group of groups) {
        const parsedGroup = scenarioCharacterGroupSchema.safeParse(group);
        if (!parsedGroup.success) {
          errors.push(`Invalid character group in scenario ${scenId}: ${parsedGroup.error.message}`);
        }
      }

      const schedules = await importStagingDatabase.loadGroupSchedules(scenId);
      for (const schedule of schedules) {
        const parsedSchedule = scenarioCharacterGroupScheduleSchema.safeParse(schedule);
        if (!parsedSchedule.success) {
          errors.push(`Invalid schedule in scenario ${scenId}: ${parsedSchedule.error.message}`);
        }
      }

      // Relationships
      const relRows = await importStagingDatabase.dbAll(
        'SELECT id, data FROM import_staging.character_relationship WHERE scenario_id = ?',
        [[scenId]],
        jsonRowSchema
      );
      for (const row of relRows) {
        try {
          const parsed = characterRelationshipSchema.safeParse(JSON.parse(row.data));
          if (!parsed.success) {
            errors.push(`Invalid character relationship ${row.id}: ${parsed.error.message}`);
          }
        } catch {
          errors.push(`Malformed JSON in relationship ${row.id}`);
        }
      }

      // Conversations
      const convRows = await importStagingDatabase.dbAll(
        'SELECT id, data FROM import_staging.conversation WHERE scenario_id = ?',
        [[scenId]],
        jsonRowSchema
      );
      for (const row of convRows) {
        try {
          const parsed = storedConversationSchema.safeParse(JSON.parse(row.data));
          if (!parsed.success) {
            errors.push(`Invalid stored conversation ${row.id}: ${parsed.error.message}`);
          }
        } catch {
          errors.push(`Malformed JSON in conversation ${row.id}`);
        }
      }

      // Event log
      const eventRows = await importStagingDatabase.dbAll(
        'SELECT id, data FROM import_staging.scenario_event_log WHERE scenario_id = ?',
        [[scenId]],
        jsonRowSchema
      );
      for (const row of eventRows) {
        try {
          const parsed = scenarioEventSchema.safeParse(JSON.parse(row.data));
          if (!parsed.success) {
            errors.push(`Invalid event log entry ${row.id}: ${parsed.error.message}`);
          }
        } catch {
          errors.push(`Malformed JSON in event log ${row.id}`);
        }
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

