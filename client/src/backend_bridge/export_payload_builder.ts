import * as Files from './files.js';
import { buildTableExportQueries, type TableExportQuery } from './export_queries.js';
import type { Character, ScenarioSummary, WorldMap } from '../engine/types.js';
import { TreeEntityIds, turnPersistenceKey, decomposeSelection } from './import_export_common.js';

export { TreeEntityIds };
export type { TableExportQuery };

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
};

export function sanitizeExportFilename(name: string): string {
  const base = name.trim().replace(/[/\\?%*:|"<>]/g, '_');
  const withoutZip = base.replace(/\.yozakura_export\.zip$/i, '');
  return `${withoutZip || 'export'}.yozakura_export.zip`;
}

export function buildExportPayload(options: BuildExportPayloadOptions): ExportPayload {
  const { exportName, overwrite = false, selectedIds, scenarios, maps, globalCharacters } = options;

  const prebuiltRows: PrebuiltRow[] = [];
  const imageDescriptors: ImageCopyDescriptor[] = [];

  const decomposed = decomposeSelection({
    selectedIds,
    scenarios,
    maps,
    globalCharacters,
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

  // 2. Global Characters image descriptors
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

  const queries = buildTableExportQueries({
    selectedScenarioIds,
    characterPartition: {
      fullScenarioIds: charScenariosFull,
      stripMemoriesScenarioIds: charScenariosStripMemories,
      stripGroupsScenarioIds: charScenariosStripGroups,
      stripBothScenarioIds: charScenariosStripBoth,
    },
    scenariosWithMemories,
    scenariosWithGroups,
    scenariosWithSchedules,
    scenariosWithConversations,
    turnKeys,
    selectedMapIds: decomposed.selectedMapIds,
    selectedGlobalCharacterIds: decomposed.selectedGlobalCharacterIds,
  });

  return {
    exportName: exportName.trim(),
    filename: sanitizeExportFilename(exportName),
    overwrite,
    queries,
    prebuiltRows,
    imageDescriptors,
  };
}
