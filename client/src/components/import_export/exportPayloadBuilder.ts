import _ from 'lodash';
import * as Files from '../../backend_bridge/files.js';
import type { Character, ScenarioSummary, WorldMap } from '../../engine/types.js';
import type { TemplateGroupData } from '../../engine/prompt_templates/template_types.js';
import { DEFAULT_TEMPLATE_GROUP_DATA } from '../../engine/prompt_templates/default_template_group_data.js';
import {
  TABLE_COLUMNS,
  STRIP_MEMORIES_PATCH,
  STRIP_GROUPS_PATCH,
  STRIP_BOTH_PATCH,
  TreeEntityIds,
  turnPersistenceKey,
  decomposeSelection,
} from './importExportCommon.js';

export { TreeEntityIds };

export function isTemplateChainModifiedOrCustom(
  groupId: string,
  chainId: string,
  chainData: unknown
): boolean {
  const defaultGroup = DEFAULT_TEMPLATE_GROUP_DATA[groupId];
  if (!defaultGroup) return true;
  const defaultChain = defaultGroup.templateChains[chainId];
  if (!defaultChain) return true;
  return !_.isEqual(chainData, defaultChain);
}

export type TableExportQuery = {
  table: string;
  statement: string;
  params: unknown[];
};

export type ImageCopyDescriptor =
  | {
      mode: 'file';
      sourceRelPath: string;
      kind?: string;
    }
  | {
      mode: 'directory';
      sourceRelDir: string;
      kind?: string;
      scenarioId?: string;
    };

export type PrebuiltRow = {
  table: string;
  row: Record<string, unknown>;
};

export type ExportPayload = {
  exportName: string;
  filename: string;
  overwrite: boolean;
  queries: TableExportQuery[];
  prebuiltRows: PrebuiltRow[];
  imageDescriptors: ImageCopyDescriptor[];
};

export type BuildExportPayloadOptions = {
  exportName: string;
  overwrite?: boolean;
  selectedIds: Set<string>;
  scenarios: ScenarioSummary[];
  maps: WorldMap[];
  globalCharacters: Character[];
  templateGroupData: TemplateGroupData;
};

export function sanitizeExportFilename(name: string): string {
  const base = name.trim().replace(/[/\\?%*:|"<>]/g, '_');
  const withoutZip = base.replace(/\.yozakura_export\.zip$/i, '');
  return `${withoutZip || 'export'}.yozakura_export.zip`;
}

export function buildExportPayload(options: BuildExportPayloadOptions): ExportPayload {
  const {
    exportName,
    overwrite = false,
    selectedIds,
    scenarios,
    maps,
    globalCharacters,
    templateGroupData,
  } = options;

  const queries: TableExportQuery[] = [];
  const prebuiltRows: PrebuiltRow[] = [];
  const imageDescriptors: ImageCopyDescriptor[] = [];

  const decomposed = decomposeSelection({
    selectedIds,
    scenarios,
    maps,
    globalCharacters,
    templateGroupData,
  });

  // 1. Process Scenarios and their subcategories
  const selectedScenarioIds = decomposed.selectedScenarioIds;
  const scenariosWithMemories: string[] = [];
  const scenariosWithConversations: string[] = [];
  const scenariosWithGroups: string[] = [];
  const scenariosWithSchedules: string[] = [];
  const turnKeys: string[] = [];

  const charScenariosFull: string[] = [];
  const charScenariosStripMemories: string[] = [];
  const charScenariosStripGroups: string[] = [];
  const charScenariosStripBoth: string[] = [];

  for (const scenId of selectedScenarioIds) {
    const details = decomposed.scenarioDetails.get(scenId)!;
    if (details.hasCharacters) {
      if (details.hasMemories && details.hasGroups) {
        charScenariosFull.push(scenId);
      } else if (!details.hasMemories && details.hasGroups) {
        charScenariosStripMemories.push(scenId);
      } else if (details.hasMemories && !details.hasGroups) {
        charScenariosStripGroups.push(scenId);
      } else {
        charScenariosStripBoth.push(scenId);
      }

      imageDescriptors.push({
        mode: 'directory',
        sourceRelDir: `scenario/${scenId}/character_cards`,
      });
    }

    if (details.hasMemories) {
      scenariosWithMemories.push(scenId);
    }

    if (details.hasGroups) {
      scenariosWithGroups.push(scenId);
    }

    if (details.hasSchedules) {
      scenariosWithSchedules.push(scenId);
    }

    if (details.hasConversations) {
      scenariosWithConversations.push(scenId);
      imageDescriptors.push({
        mode: 'directory',
        sourceRelDir: `scenario/${scenId}/chat_images`,
      });
    }

    if (details.hasTurn) {
      turnKeys.push(turnPersistenceKey(scenId));
    }
  }

  // Scenario query
  if (selectedScenarioIds.length > 0) {
    queries.push({
      table: 'scenario',
      statement: `
        SELECT ${TABLE_COLUMNS.scenario.join(', ')}
        FROM scenario
        WHERE id IN (SELECT value FROM json_each(?))
      `.trim(),
      params: [JSON.stringify(selectedScenarioIds)],
    });
  }

  // Scenario characters queries
  const scenCharCols = TABLE_COLUMNS.scenario_character.join(', ');
  const scenCharPatchedCols = TABLE_COLUMNS.scenario_character
    .map((c) => (c === 'data' ? 'json_patch(data, ?) AS data' : c))
    .join(', ');

  if (charScenariosFull.length > 0) {
    queries.push({
      table: 'scenario_character',
      statement: `
        SELECT ${scenCharCols}
        FROM scenario_character
        WHERE scenario_id IN (SELECT value FROM json_each(?))
      `.trim(),
      params: [JSON.stringify(charScenariosFull)],
    });
  }

  if (charScenariosStripMemories.length > 0) {
    queries.push({
      table: 'scenario_character',
      statement: `
        SELECT ${scenCharPatchedCols}
        FROM scenario_character
        WHERE scenario_id IN (SELECT value FROM json_each(?))
      `.trim(),
      params: [STRIP_MEMORIES_PATCH, JSON.stringify(charScenariosStripMemories)],
    });
  }

  if (charScenariosStripGroups.length > 0) {
    queries.push({
      table: 'scenario_character',
      statement: `
        SELECT ${scenCharPatchedCols}
        FROM scenario_character
        WHERE scenario_id IN (SELECT value FROM json_each(?))
      `.trim(),
      params: [STRIP_GROUPS_PATCH, JSON.stringify(charScenariosStripGroups)],
    });
  }

  if (charScenariosStripBoth.length > 0) {
    queries.push({
      table: 'scenario_character',
      statement: `
        SELECT ${scenCharPatchedCols}
        FROM scenario_character
        WHERE scenario_id IN (SELECT value FROM json_each(?))
      `.trim(),
      params: [STRIP_BOTH_PATCH, JSON.stringify(charScenariosStripBoth)],
    });
  }

  // Character relationships (memories)
  if (scenariosWithMemories.length > 0) {
    queries.push({
      table: 'character_relationship',
      statement: `
        SELECT ${TABLE_COLUMNS.character_relationship.map((c) => `cr.${c}`).join(', ')}
        FROM character_relationship cr
        JOIN scenario_character sc ON cr.from_id = sc.id
        WHERE sc.scenario_id IN (SELECT value FROM json_each(?))
      `.trim(),
      params: [JSON.stringify(scenariosWithMemories)],
    });
  }

  // Scenario character groups
  if (scenariosWithGroups.length > 0) {
    queries.push({
      table: 'scenario_character_group',
      statement: `
        SELECT ${TABLE_COLUMNS.scenario_character_group.join(', ')}
        FROM scenario_character_group
        WHERE scenario_id IN (SELECT value FROM json_each(?))
      `.trim(),
      params: [JSON.stringify(scenariosWithGroups)],
    });
  }

  // Group schedules
  if (scenariosWithSchedules.length > 0) {
    queries.push({
      table: 'scenario_character_group_schedule',
      statement: `
        SELECT ${TABLE_COLUMNS.scenario_character_group_schedule.join(', ')}
        FROM scenario_character_group_schedule
        WHERE scenario_id IN (SELECT value FROM json_each(?))
      `.trim(),
      params: [JSON.stringify(scenariosWithSchedules)],
    });
  }

  // Conversations & participants
  if (scenariosWithConversations.length > 0) {
    queries.push({
      table: 'conversation',
      statement: `
        SELECT ${TABLE_COLUMNS.conversation.join(', ')}
        FROM conversation
        WHERE scenario_id IN (SELECT value FROM json_each(?))
      `.trim(),
      params: [JSON.stringify(scenariosWithConversations)],
    });

    queries.push({
      table: 'conversation_participant',
      statement: `
        SELECT ${TABLE_COLUMNS.conversation_participant.map((c) => `cp.${c}`).join(', ')}
        FROM conversation_participant cp
        JOIN conversation c ON cp.conversation_id = c.id
        WHERE c.scenario_id IN (SELECT value FROM json_each(?))
      `.trim(),
      params: [JSON.stringify(scenariosWithConversations)],
    });
  }

  // Turn key_values
  if (turnKeys.length > 0) {
    queries.push({
      table: 'key_value',
      statement: `
        SELECT ${TABLE_COLUMNS.key_value.join(', ')}
        FROM key_value
        WHERE key IN (SELECT value FROM json_each(?))
      `.trim(),
      params: [JSON.stringify(turnKeys)],
    });
  }

  // 2. Maps
  const selectedMapIds = decomposed.selectedMapIds;
  if (selectedMapIds.length > 0) {
    queries.push({
      table: 'map',
      statement: `
        SELECT ${TABLE_COLUMNS.map.join(', ')}
        FROM map
        WHERE id IN (SELECT value FROM json_each(?))
      `.trim(),
      params: [JSON.stringify(selectedMapIds)],
    });
  }

  // 3. Global Characters
  const selectedGlobalCharIds = decomposed.selectedGlobalCharacterIds;
  for (const charId of selectedGlobalCharIds) {
    const char = globalCharacters.find((c) => c.id === charId);
    if (char && Files.isApiFilePath(char.imagePath)) {
      const cleanPath = Files.extractApiFileRelativePath(char.imagePath);
      if (cleanPath) {
        imageDescriptors.push({
          mode: 'file',
          sourceRelPath: cleanPath,
        });
      }
    }
  }

  if (selectedGlobalCharIds.length > 0) {
    queries.push({
      table: 'character',
      statement: `
        SELECT ${TABLE_COLUMNS.character.join(', ')}
        FROM character
        WHERE id IN (SELECT value FROM json_each(?))
      `.trim(),
      params: [JSON.stringify(selectedGlobalCharIds)],
    });
  }

  // 4. Prompt Templates (Template Chains) - Only export customized or modified chains
  const exportedTemplateGroupData: TemplateGroupData = {};
  for (const [groupId, group] of Object.entries(templateGroupData)) {
    for (const [chainId, chainData] of Object.entries(group.templateChains)) {
      if (
        decomposed.selectedTemplateChainIds.includes(chainId) &&
        isTemplateChainModifiedOrCustom(groupId, chainId, chainData)
      ) {
        if (!exportedTemplateGroupData[groupId]) {
          exportedTemplateGroupData[groupId] = { templateChains: {} };
        }
        exportedTemplateGroupData[groupId].templateChains[chainId] = chainData;
      }
    }
  }

  if (Object.keys(exportedTemplateGroupData).length > 0) {
    const now = new Date().toISOString();
    prebuiltRows.push({
      table: 'key_value',
      row: {
        key: 'settings',
        data: JSON.stringify({ templateGroupData: exportedTemplateGroupData }),
        created_at: now,
        updated_at: now,
      },
    });
  }

  return {
    exportName: exportName.trim(),
    filename: sanitizeExportFilename(exportName),
    overwrite,
    queries,
    prebuiltRows,
    imageDescriptors,
  };
}
