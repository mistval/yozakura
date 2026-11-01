import type { TemplateGroupData } from '../../engine/prompt_templates/template_types.js';

export type ExecutableCodeItem = {
  chainId: string;
  title: string;
  groupId: string;
};

/**
 * Returns all selected prompt template chains that contain non-empty executable parser code.
 */
export function getSelectedExecutableCodeItems(
  templateGroupData: TemplateGroupData | undefined,
  selectedTemplateChainIds: string[]
): ExecutableCodeItem[] {
  if (!templateGroupData || selectedTemplateChainIds.length === 0) {
    return [];
  }

  const items: ExecutableCodeItem[] = [];
  const selectedSet = new Set(selectedTemplateChainIds);

  for (const [groupId, group] of Object.entries(templateGroupData)) {
    if (!group.templateChains) continue;
    for (const [chainId, chain] of Object.entries(group.templateChains)) {
      if (selectedSet.has(chainId) && chain.parserSource && chain.parserSource.trim().length > 0) {
        items.push({
          chainId,
          title: chain.title || chainId,
          groupId,
        });
      }
    }
  }

  return items;
}

