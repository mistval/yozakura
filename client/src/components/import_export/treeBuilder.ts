import type { TreeNode } from '../ui/TreeDataViewer.js';
import type { Character, ScenarioSummary, WorldMap } from '../../engine/types.js';
import type { TemplateGroupData } from '../../engine/prompt_templates/template_types.js';
import { TreeEntityIds, isTemplateChainModifiedOrCustom } from './exportPayloadBuilder.js';

export type BuildTreeOptions = {
  mode: 'export' | 'import';
  scenarios: ScenarioSummary[];
  maps: WorldMap[];
  globalCharacters: Character[];
  templateGroupData: TemplateGroupData;
};

export function buildImportExportTreeRoots(options: BuildTreeOptions): TreeNode[] {
  const { mode, scenarios, maps, globalCharacters, templateGroupData } = options;
  const treeRoots: TreeNode[] = [];
  const countSuffix = mode === 'export' ? 'available' : 'in archive';

  // 1. Scenarios Root
  if (mode === 'export' || scenarios.length > 0) {
    const scenariosRoot: TreeNode = {
      id: TreeEntityIds.rootScenarios(),
      label: 'Scenarios',
      subtitle: `(${scenarios.length} ${countSuffix})`,
      getChildren: async () => {
        return scenarios.map((summary) => {
          const scenId = summary.scenario.id;
          return {
            id: TreeEntityIds.scenario(scenId),
            label: `${summary.userCharacterName} on ${summary.mapName}`,
            subtitle: `Turn ${summary.scenario.turnNumber}`,
            getChildren: async () => {
              const children: TreeNode[] = [];

              if (summary.scenario.mapId) {
                children.push({
                  id: TreeEntityIds.scenarioMap(scenId, summary.scenario.mapId),
                  label: `Map: ${summary.mapName}`,
                  subtitle: 'Map used by this scenario',
                });
              }

              children.push(
                {
                  id: TreeEntityIds.scenarioCharacters(scenId),
                  label: 'Characters',
                  subtitle:
                    mode === 'export'
                      ? 'Scenario character definitions and cards'
                      : 'Scenario characters and portraits',
                },
                {
                  id: TreeEntityIds.scenarioGroups(scenId),
                  label: 'Character Groups',
                  subtitle: 'Zones and groups',
                },
                {
                  id: TreeEntityIds.scenarioSchedules(scenId),
                  label: 'Group Schedules',
                  subtitle: 'Requires Character Groups',
                },
                {
                  id: TreeEntityIds.scenarioMemories(scenId),
                  label: 'Memories & Relationships',
                  subtitle:
                    mode === 'export'
                      ? 'Global memories, relationship graphs and summaries'
                      : 'Pairwise memories and relationships',
                },
                {
                  id: TreeEntityIds.scenarioConversations(scenId),
                  label: 'Conversation Logs',
                  subtitle:
                    mode === 'export' ? 'Chat logs, participants and images' : 'Chat logs and participants',
                },
                {
                  id: TreeEntityIds.scenarioTurn(scenId),
                  label: 'Active Conversation State',
                  subtitle: mode === 'export' ? 'Current turn runtime state' : 'Saved turn runtime state',
                }
              );

              return children;
            },
          };
        });
      },
    };
    treeRoots.push(scenariosRoot);
  }

  // 2. Maps Root
  if (mode === 'export' || maps.length > 0) {
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
  if (mode === 'export' || globalCharacters.length > 0) {
    const charactersRoot: TreeNode = {
      id: TreeEntityIds.rootCharacters(),
      label: 'Global Characters',
      subtitle: `(${globalCharacters.length} ${countSuffix})`,
      getChildren: async () => {
        return globalCharacters.map((char) => ({
          id: TreeEntityIds.character(char.id),
          label: `${char.firstName} ${char.lastName}`,
        }));
      },
    };
    treeRoots.push(charactersRoot);
  }

  // 4. Settings & Prompt Templates Root
  const isChainApplicable = (groupId: string, chainId: string, chain: unknown) => {
    if (mode === 'export') {
      return isTemplateChainModifiedOrCustom(groupId, chainId, chain);
    }
    return true;
  };

  const hasPromptChains = Object.entries(templateGroupData).some(([groupId, g]) =>
    Object.entries(g.templateChains).some(([chainId, chain]) => isChainApplicable(groupId, chainId, chain))
  );

  if (hasPromptChains) {
    const settingsRoot: TreeNode = {
      id: TreeEntityIds.rootSettings(),
      label: 'Settings & Prompts',
      getChildren: async () => [
        {
          id: TreeEntityIds.rootPromptTemplates(),
          label: 'Prompt Templates',
          getChildren: async () => {
            const groupNodes: TreeNode[] = [];
            for (const [groupId, group] of Object.entries(templateGroupData)) {
              const chainEntries = Object.entries(group.templateChains).filter(([chainId, chain]) =>
                isChainApplicable(groupId, chainId, chain)
              );
              if (chainEntries.length === 0) continue;

              groupNodes.push({
                id: TreeEntityIds.promptGroup(groupId),
                label: groupId,
                getChildren: async () => {
                  return chainEntries.map(([chainId, chain]) => ({
                    id: TreeEntityIds.promptChain(chainId),
                    label: chain.title || chainId,
                    subtitle: chain.description,
                    ...(chain.parserSource
                      ? { badge: { text: 'Executable Code', variant: 'warning' as const } }
                      : {}),
                  }));
                },
              });
            }
            return groupNodes;
          },
        },
      ],
    };
    treeRoots.push(settingsRoot);
  }

  return treeRoots;
}
