import { useMemo } from 'react';
import { promptTemplatesRootGroup } from '../../engine/prompt_templates/group.js';
import type { PromptTemplateChain } from '../../engine/prompt_templates/prompt_template_chain.js';
import {
  isTemplateChain,
  isTemplateGroup,
  type TemplateGroup,
} from '../../engine/prompt_templates/template_group.js';
import PromptTemplateChainCards from './promptTemplates/PromptTemplateChainCards.js';
import PromptTemplateChainEditor from './promptTemplates/PromptTemplateChainEditor.js';
import TemplateGroupCards from './promptTemplates/TemplateGroupCards.js';
import { buildPromptTemplatesPath, parsePromptTemplatesPath } from './promptTemplates/group_path.js';
import { useSettingsModal } from './SettingsModalContext.js';
import type { PromptExecutionContext } from '../../engine/prompt_templates/prompt_template_context_fields.js';

const PROMPT_TEMPLATES_BASE = 'prompt-templates';

function resolveTemplateGroup(groupPath: string[]): TemplateGroup | undefined {
  let currentGroup: TemplateGroup = promptTemplatesRootGroup;

  for (const groupId of groupPath) {
    const nextGroup = currentGroup.children.find(
      (child): child is TemplateGroup => isTemplateGroup(child) && child.groupId === groupId
    );

    if (!nextGroup) {
      return undefined;
    }

    currentGroup = nextGroup;
  }

  return currentGroup;
}

function resolveTemplateChain(
  group: TemplateGroup,
  chainId: string
): PromptTemplateChain<PromptExecutionContext, unknown> | undefined {
  const chain = group.children.find(
    (child): child is PromptTemplateChain<PromptExecutionContext, unknown> =>
      isTemplateChain(child) && child.templateChainId === chainId
  );

  return chain;
}

export default function PromptTemplatesSettingsSection() {
  const { settingsPath, setSettingsSection } = useSettingsModal();

  const parsedPath = useMemo(() => {
    return parsePromptTemplatesPath(settingsPath, PROMPT_TEMPLATES_BASE);
  }, [settingsPath]);

  const activeGroup = useMemo(() => {
    if (!parsedPath.isValid) return undefined;
    return resolveTemplateGroup(parsedPath.groupIds);
  }, [parsedPath]);

  const activeChain = useMemo(() => {
    if (!activeGroup || !parsedPath.chainId) return undefined;
    return resolveTemplateChain(activeGroup, parsedPath.chainId);
  }, [activeGroup, parsedPath.chainId]);

  const openGroup = (groupId: string) => {
    setSettingsSection(buildPromptTemplatesPath(PROMPT_TEMPLATES_BASE, parsedPath.groupIds.concat(groupId)));
  };

  const openChain = (chainId: string) => {
    setSettingsSection(buildPromptTemplatesPath(PROMPT_TEMPLATES_BASE, parsedPath.groupIds, chainId));
  };

  if (!parsedPath.isValid) {
    return (
      <div className="space-y-3">
        <h2 className="text-2xl font-semibold">Prompt Templates</h2>
        <p className="text-sm text-danger-text">The prompt templates route is invalid.</p>
        <button
          type="button"
          className="px-3 py-1 border rounded-sm"
          onClick={() => setSettingsSection(PROMPT_TEMPLATES_BASE)}
        >
          Return to Prompt Templates Root
        </button>
      </div>
    );
  }

  if (!activeGroup) {
    return (
      <div className="space-y-3">
        <h2 className="text-2xl font-semibold">Prompt Templates</h2>
        <p className="text-sm text-danger-text">That template group was not found.</p>
        <button
          type="button"
          className="px-3 py-1 border rounded-sm"
          onClick={() => setSettingsSection(PROMPT_TEMPLATES_BASE)}
        >
          Return to Prompt Templates Root
        </button>
      </div>
    );
  }

  const childGroups = activeGroup.children.filter(isTemplateGroup);
  const childChains = activeGroup.children.filter(isTemplateChain);
  const isPromptTemplatesRoot = parsedPath.groupIds.length === 0 && parsedPath.chainId === undefined;

  if (parsedPath.chainId && !activeChain) {
    return (
      <div className="space-y-3">
        <h2 className="text-2xl font-semibold">Prompt Templates</h2>
        <p className="text-sm text-danger-text">That prompt template group was not found.</p>
        <button
          type="button"
          className="px-3 py-1 border rounded-sm"
          onClick={() =>
            setSettingsSection(buildPromptTemplatesPath(PROMPT_TEMPLATES_BASE, parsedPath.groupIds))
          }
        >
          Return to Prompt Templates Group
        </button>
      </div>
    );
  }

  return (
    <div className="space-y-4 mt-7">
      <div>
        <h2 className="text-2xl font-semibold">
          {activeChain ? activeChain.templateChainTitle : activeGroup.title}
        </h2>
        <p className="text-sm text-secondary">
          {activeChain ? activeChain.templateChainDescription : activeGroup.description}
        </p>
      </div>

      {!activeChain && <TemplateGroupCards groups={childGroups} onOpenGroup={openGroup} />}
      {!activeChain && <PromptTemplateChainCards chains={childChains} onOpenChain={openChain} />}

      {!activeChain && isPromptTemplatesRoot && (
        <button
          type="button"
          className="card-button"
          onClick={() => setSettingsSection('prompt-templates/template-render-log')}
        >
          <p className="text-base font-semibold">Template Render Log</p>
          <p className="text-sm text-secondary">Inspect rendered templates and responses.</p>
        </button>
      )}

      <div className="space-y-4">
        {activeChain && <PromptTemplateChainEditor chain={activeChain} />}

        {childGroups.length === 0 && childChains.length === 0 && !activeChain && (
          <div className="rounded-lg border p-4 bg-surface-soft">
            <p className="text-sm text-secondary">This group has no chains or child groups.</p>
          </div>
        )}
      </div>
    </div>
  );
}
