import * as Files from '../../backend_bridge/files.js';
import type { Character, ScenarioSummary, WorldMap } from '../../engine/types.js';
import type { TemplateGroupData } from '../../engine/prompt_templates/template_types.js';
import { DEFAULT_TEMPLATE_GROUP_DATA } from '../../engine/prompt_templates/default_template_group_data.js';

export const TreeEntityIds = {
  rootScenarios: () => 'root:scenarios',
  rootMaps: () => 'root:maps',
  rootCharacters: () => 'root:characters',
  rootSettings: () => 'root:settings',
  rootPromptTemplates: () => 'root:prompt_templates',

  scenario: (scenId: string) => `scenario:${scenId}`,
  scenarioCharacters: (scenId: string) => `scenario:${scenId}:characters`,
  scenarioGroups: (scenId: string) => `scenario:${scenId}:groups`,
  scenarioSchedules: (scenId: string) => `scenario:${scenId}:schedules`,
  scenarioMemories: (scenId: string) => `scenario:${scenId}:memories`,
  scenarioConversations: (scenId: string) => `scenario:${scenId}:conversations`,
  scenarioTurn: (scenId: string) => `scenario:${scenId}:turn`,
  scenarioMap: (scenId: string, mapId: string) => `scenario_map:${scenId}:${mapId}`,

  map: (mapId: string) => `map:${mapId}`,
  character: (charId: string) => `character:${charId}`,

  promptGroup: (groupId: string) => `prompt_group:${groupId}`,
  promptChain: (chainId: string) => `prompt_chain:${chainId}`,
} as const;

export function isTemplateChainModifiedOrCustom(
  groupId: string,
  chainId: string,
  chainData: unknown
): boolean {
  const defaultGroup = DEFAULT_TEMPLATE_GROUP_DATA[groupId];
  if (!defaultGroup) return true;
  const defaultChain = defaultGroup.templateChains[chainId];
  if (!defaultChain) return true;
  return JSON.stringify(chainData) !== JSON.stringify(defaultChain);
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
      kind: 'global_character_card';
    }
  | {
      mode: 'directory';
      sourceRelDir: string;
      kind: 'scenario_character_card' | 'chat_image';
      scenarioId: string;
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

  // 1. Process Scenarios and their subcategories
  const selectedScenarioIds: string[] = [];
  const scenariosWithMemories: string[] = [];
  const scenariosWithConversations: string[] = [];
  const scenariosWithGroups: string[] = [];
  const scenariosWithSchedules: string[] = [];
  const turnKeys: string[] = [];

  // Group scenario characters by their json_patch requirements:
  // profile: 'full' | 'strip_memories' | 'strip_groups' | 'strip_both'
  const charScenariosFull: string[] = [];
  const charScenariosStripMemories: string[] = [];
  const charScenariosStripGroups: string[] = [];
  const charScenariosStripBoth: string[] = [];

  for (const summary of scenarios) {
    const scenId = summary.scenario.id;
    if (selectedIds.has(TreeEntityIds.scenario(scenId))) {
      selectedScenarioIds.push(scenId);

      const hasChars = selectedIds.has(TreeEntityIds.scenarioCharacters(scenId));
      const hasMemories = selectedIds.has(TreeEntityIds.scenarioMemories(scenId));
      const hasGroups = selectedIds.has(TreeEntityIds.scenarioGroups(scenId));
      const hasSchedules = selectedIds.has(TreeEntityIds.scenarioSchedules(scenId));
      const hasConversations = selectedIds.has(TreeEntityIds.scenarioConversations(scenId));
      const hasTurn = selectedIds.has(TreeEntityIds.scenarioTurn(scenId));

      if (hasChars) {
        if (hasMemories && hasGroups) {
          charScenariosFull.push(scenId);
        } else if (!hasMemories && hasGroups) {
          charScenariosStripMemories.push(scenId);
        } else if (hasMemories && !hasGroups) {
          charScenariosStripGroups.push(scenId);
        } else {
          charScenariosStripBoth.push(scenId);
        }

        imageDescriptors.push({
          mode: 'directory',
          sourceRelDir: `scenario/${scenId}/character_cards`,
          kind: 'scenario_character_card',
          scenarioId: scenId,
        });
      }

      if (hasMemories) {
        scenariosWithMemories.push(scenId);
      }

      if (hasGroups) {
        scenariosWithGroups.push(scenId);
      }

      if (hasSchedules && hasGroups) {
        scenariosWithSchedules.push(scenId);
      }

      if (hasConversations) {
        scenariosWithConversations.push(scenId);
        imageDescriptors.push({
          mode: 'directory',
          sourceRelDir: `scenario/${scenId}/chat_images`,
          kind: 'chat_image',
          scenarioId: scenId,
        });
      }

      if (hasTurn) {
        turnKeys.push(`scenario_${scenId}_turn`);
      }
    }
  }

  // Scenario query
  if (selectedScenarioIds.length > 0) {
    queries.push({
      table: 'scenario',
      statement: `
        SELECT id, data, created_at, updated_at
        FROM scenario
        WHERE id IN (SELECT value FROM json_each(?))
      `.trim(),
      params: [JSON.stringify(selectedScenarioIds)],
    });
  }

  // Scenario characters queries
  const STRIP_MEMORIES_PATCH = JSON.stringify({
    globalMemories: '',
    rollingConversationSummaries: [],
    nextConversationWithCharacterId: '',
  });

  const STRIP_GROUPS_PATCH = JSON.stringify({
    groupIds: [],
  });

  const STRIP_BOTH_PATCH = JSON.stringify({
    globalMemories: '',
    rollingConversationSummaries: [],
    nextConversationWithCharacterId: '',
    groupIds: [],
  });

  if (charScenariosFull.length > 0) {
    queries.push({
      table: 'scenario_character',
      statement: `
        SELECT id, scenario_id, data, created_at, updated_at
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
        SELECT id, scenario_id, json_patch(data, ?) AS data, created_at, updated_at
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
        SELECT id, scenario_id, json_patch(data, ?) AS data, created_at, updated_at
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
        SELECT id, scenario_id, json_patch(data, ?) AS data, created_at, updated_at
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
        SELECT cr.id, cr.from_id, cr.to_id, cr.data, cr.created_at, cr.updated_at
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
        SELECT id, scenario_id, data, created_at, updated_at
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
        SELECT id, scenario_id, group_id, data, created_at, updated_at
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
        SELECT id, scenario_id, data, created_at, updated_at
        FROM conversation
        WHERE scenario_id IN (SELECT value FROM json_each(?))
      `.trim(),
      params: [JSON.stringify(scenariosWithConversations)],
    });

    queries.push({
      table: 'conversation_participant',
      statement: `
        SELECT cp.id, cp.character_id, cp.conversation_id, cp.created_at, cp.updated_at
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
        SELECT key, data, created_at, updated_at
        FROM key_value
        WHERE key IN (SELECT value FROM json_each(?))
      `.trim(),
      params: [JSON.stringify(turnKeys)],
    });
  }

  // 2. Maps
  const selectedMapIds: string[] = [];
  for (const map of maps) {
    const isDirectlySelected = selectedIds.has(TreeEntityIds.map(map.id));
    const isScenarioMapSelected = scenarios.some(
      (s) => s.scenario.mapId === map.id && selectedIds.has(TreeEntityIds.scenarioMap(s.scenario.id, map.id))
    );
    if (isDirectlySelected || isScenarioMapSelected) {
      selectedMapIds.push(map.id);
    }
  }

  if (selectedMapIds.length > 0) {
    queries.push({
      table: 'map',
      statement: `
        SELECT id, data, created_at, updated_at
        FROM map
        WHERE id IN (SELECT value FROM json_each(?))
      `.trim(),
      params: [JSON.stringify(selectedMapIds)],
    });
  }

  // 3. Global Characters
  const selectedGlobalCharIds: string[] = [];
  for (const char of globalCharacters) {
    if (selectedIds.has(TreeEntityIds.character(char.id))) {
      selectedGlobalCharIds.push(char.id);

      // Check if imagePath is a custom uploaded image under /api/files/
      if (Files.isApiFilePath(char.imagePath)) {
        const cleanPath = Files.extractApiFileRelativePath(char.imagePath);
        if (cleanPath) {
          imageDescriptors.push({
            mode: 'file',
            sourceRelPath: cleanPath,
            kind: 'global_character_card',
          });
        }
      }
    }
  }

  if (selectedGlobalCharIds.length > 0) {
    queries.push({
      table: 'character',
      statement: `
        SELECT id, data, created_at, updated_at
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
        selectedIds.has(TreeEntityIds.promptChain(chainId)) &&
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
