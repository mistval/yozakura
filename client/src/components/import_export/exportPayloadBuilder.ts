import type { Character, ScenarioSummary, WorldMap } from '../../engine/types.js';
import type { TemplateGroupData } from '../../engine/prompt_templates/template_types.js';

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

function placeholders(count: number): string {
  return Array(count).fill('?').join(', ');
}

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
  const scenariosWithEventLogs: string[] = [];
  const turnKeys: string[] = [];

  // Group scenario characters by their json_patch requirements:
  // profile: 'full' | 'strip_memories' | 'strip_groups' | 'strip_both'
  const charScenariosFull: string[] = [];
  const charScenariosStripMemories: string[] = [];
  const charScenariosStripGroups: string[] = [];
  const charScenariosStripBoth: string[] = [];

  for (const summary of scenarios) {
    const scenId = summary.scenario.id;
    if (selectedIds.has(`scenario:${scenId}`)) {
      selectedScenarioIds.push(scenId);

      const hasChars = selectedIds.has(`scenario:${scenId}:characters`);
      const hasMemories = selectedIds.has(`scenario:${scenId}:memories`);
      const hasGroups = selectedIds.has(`scenario:${scenId}:groups`);
      const hasSchedules = selectedIds.has(`scenario:${scenId}:schedules`);
      const hasConversations = selectedIds.has(`scenario:${scenId}:conversations`);
      const hasTurn = selectedIds.has(`scenario:${scenId}:turn`);
      const hasEventLogs = selectedIds.has(`scenario:${scenId}:event_logs`);

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

      if (hasEventLogs) {
        scenariosWithEventLogs.push(scenId);
      }
    }
  }

  // Scenario query
  if (selectedScenarioIds.length > 0) {
    queries.push({
      table: 'scenario',
      statement: `SELECT id, data, created_at, updated_at FROM scenario WHERE id IN (${placeholders(selectedScenarioIds.length)})`,
      params: selectedScenarioIds,
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
      statement: `SELECT id, scenario_id, data, created_at, updated_at FROM scenario_character WHERE scenario_id IN (${placeholders(charScenariosFull.length)})`,
      params: charScenariosFull,
    });
  }

  if (charScenariosStripMemories.length > 0) {
    queries.push({
      table: 'scenario_character',
      statement: `SELECT id, scenario_id, json_patch(data, ?) AS data, created_at, updated_at FROM scenario_character WHERE scenario_id IN (${placeholders(charScenariosStripMemories.length)})`,
      params: [STRIP_MEMORIES_PATCH, ...charScenariosStripMemories],
    });
  }

  if (charScenariosStripGroups.length > 0) {
    queries.push({
      table: 'scenario_character',
      statement: `SELECT id, scenario_id, json_patch(data, ?) AS data, created_at, updated_at FROM scenario_character WHERE scenario_id IN (${placeholders(charScenariosStripGroups.length)})`,
      params: [STRIP_GROUPS_PATCH, ...charScenariosStripGroups],
    });
  }

  if (charScenariosStripBoth.length > 0) {
    queries.push({
      table: 'scenario_character',
      statement: `SELECT id, scenario_id, json_patch(data, ?) AS data, created_at, updated_at FROM scenario_character WHERE scenario_id IN (${placeholders(charScenariosStripBoth.length)})`,
      params: [STRIP_BOTH_PATCH, ...charScenariosStripBoth],
    });
  }

  // Character relationships (memories)
  if (scenariosWithMemories.length > 0) {
    queries.push({
      table: 'character_relationship',
      statement: `SELECT cr.id, cr.from_id, cr.to_id, cr.data, cr.created_at, cr.updated_at FROM character_relationship cr JOIN scenario_character sc ON cr.from_id = sc.id WHERE sc.scenario_id IN (${placeholders(scenariosWithMemories.length)})`,
      params: scenariosWithMemories,
    });
  }

  // Scenario character groups
  if (scenariosWithGroups.length > 0) {
    queries.push({
      table: 'scenario_character_group',
      statement: `SELECT id, scenario_id, data, created_at, updated_at FROM scenario_character_group WHERE scenario_id IN (${placeholders(scenariosWithGroups.length)})`,
      params: scenariosWithGroups,
    });
  }

  // Group schedules
  if (scenariosWithSchedules.length > 0) {
    queries.push({
      table: 'scenario_character_group_schedule',
      statement: `SELECT id, scenario_id, group_id, data, created_at, updated_at FROM scenario_character_group_schedule WHERE scenario_id IN (${placeholders(scenariosWithSchedules.length)})`,
      params: scenariosWithSchedules,
    });
  }

  // Conversations & participants
  if (scenariosWithConversations.length > 0) {
    queries.push({
      table: 'conversation',
      statement: `SELECT id, scenario_id, data, created_at, updated_at FROM conversation WHERE scenario_id IN (${placeholders(scenariosWithConversations.length)})`,
      params: scenariosWithConversations,
    });

    queries.push({
      table: 'conversation_participant',
      statement: `SELECT cp.id, cp.character_id, cp.conversation_id, cp.created_at, cp.updated_at FROM conversation_participant cp JOIN conversation c ON cp.conversation_id = c.id WHERE c.scenario_id IN (${placeholders(scenariosWithConversations.length)})`,
      params: scenariosWithConversations,
    });
  }

  // Turn key_values
  if (turnKeys.length > 0) {
    queries.push({
      table: 'key_value',
      statement: `SELECT key, data, created_at, updated_at FROM key_value WHERE key IN (${placeholders(turnKeys.length)})`,
      params: turnKeys,
    });
  }

  // Event logs (ORDER BY rowid ASC)
  if (scenariosWithEventLogs.length > 0) {
    queries.push({
      table: 'scenario_event_log',
      statement: `SELECT id, scenario_id, event_type, data, created_at, updated_at FROM scenario_event_log WHERE scenario_id IN (${placeholders(scenariosWithEventLogs.length)}) ORDER BY rowid ASC`,
      params: scenariosWithEventLogs,
    });
  }

  // 2. Maps
  const selectedMapIds: string[] = [];
  for (const map of maps) {
    if (selectedIds.has(`map:${map.id}`)) {
      selectedMapIds.push(map.id);
    }
  }

  if (selectedMapIds.length > 0) {
    queries.push({
      table: 'map',
      statement: `SELECT id, data, created_at, updated_at FROM map WHERE id IN (${placeholders(selectedMapIds.length)})`,
      params: selectedMapIds,
    });
  }

  // 3. Global Characters
  const selectedGlobalCharIds: string[] = [];
  for (const char of globalCharacters) {
    if (selectedIds.has(`character:${char.id}`)) {
      selectedGlobalCharIds.push(char.id);

      // Check if imagePath is a custom uploaded image under /api/files/
      if (char.imagePath && char.imagePath.startsWith('/api/files/')) {
        const cleanPath = char.imagePath.replace(/^\/api\/files\//, '').split('?')[0];
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
      statement: `SELECT id, data, created_at, updated_at FROM character WHERE id IN (${placeholders(selectedGlobalCharIds.length)})`,
      params: selectedGlobalCharIds,
    });
  }

  // 4. Prompt Templates (Template Chains)
  const exportedTemplateGroupData: TemplateGroupData = {};
  for (const [groupId, group] of Object.entries(templateGroupData)) {
    for (const [chainId, chainData] of Object.entries(group.templateChains)) {
      if (selectedIds.has(`prompt_chain:${chainId}`)) {
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
