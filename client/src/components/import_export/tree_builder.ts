import type { TreeNode } from '../ui/TreeDataViewer.js';
import type { Character, ScenarioSummary, WorldMap } from '../../engine/types.js';
import { TreeEntityIds } from '../../backend_bridge/export_payload_builder.js';

export type BuildTreeOptions = {
  scenarios: ScenarioSummary[];
  maps: WorldMap[];
  globalCharacters: Character[];
};

export function buildImportExportTreeRoots(options: BuildTreeOptions): TreeNode[] {
  const { scenarios, maps, globalCharacters } = options;
  const treeRoots: TreeNode[] = [];
  const countSuffix = 'available';

  // 1. Scenarios Root
  if (scenarios.length > 0) {
    const scenariosRoot: TreeNode = {
      id: TreeEntityIds.rootScenarios(),
      label: 'Scenarios',
      subtitle: `(${scenarios.length} ${countSuffix})`,
      getChildren: async () => {
        return Array.from(scenarios)
          .sort((a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime())
          .map((summary) => {
            const scenId = summary.scenario.id;
            return {
              id: TreeEntityIds.scenario(scenId),
              label: `${summary.userCharacterName} on ${summary.mapName}`,
              subtitle: `Turn ${summary.scenario.turnNumber}`,
              getChildren: async () => {
                const children: TreeNode[] = [];

                if (summary.mapName && maps.some((m) => m.id === summary.scenario.mapId)) {
                  children.push({
                    id: TreeEntityIds.scenarioMap(scenId, summary.scenario.mapId),
                    label: `Map: ${summary.mapName}`,
                    subtitle: 'Map used by this scenario',
                  });
                }

                const charactersNodeId = TreeEntityIds.scenarioCharacters(scenId);
                const characterGroupsId = TreeEntityIds.scenarioGroups(scenId);

                if (summary.hasCharacters) {
                  children.push({
                    id: charactersNodeId,
                    label: 'Characters',
                    subtitle: 'Character definitions and card images',
                  });
                }

                if (summary.hasCharacterGroups) {
                  children.push({
                    id: characterGroupsId,
                    label: 'Character Groups',
                    subtitle: 'Zones and groups',
                  });
                }

                if (summary.hasCharacterGroups && summary.hasCharacterGroupSchedules) {
                  children.push({
                    id: TreeEntityIds.scenarioSchedules(scenId),
                    label: 'Group Schedules',
                    subtitle: '(Requires Character Groups)',
                    requiredSiblingNodeIds: [characterGroupsId],
                  });
                }

                if (summary.hasCharacters && summary.hasRelationships) {
                  children.push({
                    id: TreeEntityIds.scenarioMemories(scenId),
                    label: 'Character Memories & Relationships',
                    requiredSiblingNodeIds: [charactersNodeId],
                  });
                }

                if (summary.hasConversationLogs || summary.hasCurrentConversation) {
                  children.push({
                    id: TreeEntityIds.scenarioConversations(scenId),
                    label: 'Conversations',
                    subtitle: 'Conversations and chat images',
                  });
                }

                return children;
              },
            };
          });
      },
    };
    treeRoots.push(scenariosRoot);
  }

  // 2. Maps Root
  if (maps.length > 0) {
    const mapsRoot: TreeNode = {
      id: TreeEntityIds.rootMaps(),
      label: 'Maps',
      subtitle: `(${maps.length} ${countSuffix})`,
      getChildren: async () => {
        return maps.map((map) => ({
          id: TreeEntityIds.map(map.id),
          label: map.name,
          subtitle: `${map.locations.length} locations, ${map.zones.length} zones`,
        }));
      },
    };
    treeRoots.push(mapsRoot);
  }

  // 3. Global Characters Root
  if (globalCharacters.length > 0) {
    const charactersRoot: TreeNode = {
      id: TreeEntityIds.rootCharacters(),
      label: 'Global Characters',
      subtitle: `(${globalCharacters.length} ${countSuffix})`,
      getChildren: async () => {
        return Array.from(globalCharacters)
          .sort((a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime())
          .map((char) => ({
            id: TreeEntityIds.character(char.id),
            label: `${char.firstName} ${char.lastName}`,
          }));
      },
    };
    treeRoots.push(charactersRoot);
  }

  return treeRoots;
}
