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
    }
  | {
      mode: 'directory';
      sourceRelDir: string;
    };

export type ExportPayload = {
  exportName: string;
  filename: string;
  overwrite: boolean;
  queries: TableExportQuery[];
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

  const imageDescriptors: ImageCopyDescriptor[] = [];

  const decomposed = decomposeSelection({
    selectedIds,
    scenarios,
    maps,
    globalCharacters,
  });

  const memoriesSet = new Set(decomposed.selectedScenarioMemoriesIds);
  const groupsSet = new Set(decomposed.selectedScenarioGroupsIds);

  const charScenariosFull: string[] = [];
  const charScenariosStripMemories: string[] = [];
  const charScenariosStripGroups: string[] = [];
  const charScenariosStripBoth: string[] = [];

  for (const scenId of decomposed.selectedScenarioCharactersIds) {
    const hasMemories = memoriesSet.has(scenId);
    const hasGroups = groupsSet.has(scenId);

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
    });
  }

  for (const scenId of decomposed.selectedScenarioConversationsIds) {
    imageDescriptors.push({
      mode: 'directory',
      sourceRelDir: `scenario/${scenId}/chat_images`,
    });
  }

  // Global Characters image descriptors
  for (const charId of decomposed.selectedGlobalCharacterIds) {
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
    selectedScenarioIds: decomposed.selectedScenarioIds,
    characterPartition: {
      fullScenarioIds: charScenariosFull,
      stripMemoriesScenarioIds: charScenariosStripMemories,
      stripGroupsScenarioIds: charScenariosStripGroups,
      stripBothScenarioIds: charScenariosStripBoth,
    },
    scenariosWithMemories: decomposed.selectedScenarioMemoriesIds,
    scenariosWithGroups: decomposed.selectedScenarioGroupsIds,
    scenariosWithSchedules: decomposed.selectedScenarioSchedulesIds,
    scenariosWithConversations: decomposed.selectedScenarioConversationsIds,
    turnKeys: decomposed.selectedScenarioTurnIds.map(turnPersistenceKey),
    selectedMapIds: decomposed.selectedMapIds,
    selectedGlobalCharacterIds: decomposed.selectedGlobalCharacterIds,
  });

  return {
    exportName: exportName.trim(),
    filename: sanitizeExportFilename(exportName),
    overwrite,
    queries,
    imageDescriptors,
  };
}
