import { useMemo } from 'react';
import { promptTemplatesRootGroup } from '../../engine/prompt_templates/group.js';
import type { TemplateGroup } from '../../engine/prompt_templates/template_group.js';
import type { PromptTemplateChain } from '../../engine/prompt_templates/prompt_template_chain.js';
import type { PromptExecutionContext } from '../../engine/prompt_templates/prompt_template_context_fields.js';
import PromptTemplateChainCards from './promptTemplates/PromptTemplateChainCards.js';
import PromptTemplateChainEditor from './promptTemplates/PromptTemplateChainEditor.js';
import TemplateGroupCards from './promptTemplates/TemplateGroupCards.js';
import { buildPromptTemplatesPath, parsePromptTemplatesPath } from './promptTemplates/group_path.js';
import { useSettingsModal } from './SettingsModalContext.js';

const PROMPT_TEMPLATES_BASE = 'prompt-templates';

function resolveTemplateGroup(groupPath: string[]): TemplateGroup | undefined {
  let currentGroup: TemplateGroup = promptTemplatesRootGroup;

  for (const groupId of groupPath) {
    const nextGroup = currentGroup.childGroups.find((child) => child.groupId === groupId);

    if (!nextGroup) {
      return undefined;
    }

    currentGroup = nextGroup;
  }

  return currentGroup;
}

function PromptTemplateChainView({
  chain,
}: {
  chain: PromptTemplateChain<PromptExecutionContext, unknown>;
}) {
  const chainData = chain.settingsBridge.use();

  return (
    <div className="space-y-4 mt-7">
      <div>
        <h2 className="text-2xl font-semibold">{chainData.title}</h2>
        <p className="text-sm text-secondary">{chainData.description}</p>
      </div>

      <div className="space-y-4">
        <PromptTemplateChainEditor chain={chain} />
      </div>
    </div>
  );
}

function TemplateGroupView({
  activeGroup,
  parsedGroupIds,
  chainId,
  onOpenGroup,
  onOpenChain,
  onReturnToGroup,
  onOpenRenderLog,
}: {
  activeGroup: TemplateGroup;
  parsedGroupIds: string[];
  chainId?: string | undefined;
  onOpenGroup: (groupId: string) => void;
  onOpenChain: (chainId: string) => void;
  onReturnToGroup: () => void;
  onOpenRenderLog: () => void;
}) {
  const childChains = activeGroup.useChains();
  const childGroups = activeGroup.childGroups;
  const isPromptTemplatesRoot = parsedGroupIds.length === 0 && chainId === undefined;

  if (chainId) {
    const activeChain = childChains.find((child) => child.templateChainId === chainId);

    if (!activeChain) {
      return (
        <div className="space-y-3">
          <h2 className="text-2xl font-semibold">Prompt Templates</h2>
          <p className="text-sm text-danger-text">That prompt template group was not found.</p>
          <button
            type="button"
            className="px-3 py-1 border rounded-sm"
            onClick={onReturnToGroup}
          >
            Return to Prompt Templates Group
          </button>
        </div>
      );
    }

    return <PromptTemplateChainView chain={activeChain} />;
  }

  return (
    <div className="space-y-4 mt-7">
      <div>
        <h2 className="text-2xl font-semibold">{activeGroup.title}</h2>
        <p className="text-sm text-secondary">{activeGroup.description}</p>
      </div>

      <TemplateGroupCards groups={childGroups} onOpenGroup={onOpenGroup} />
      <PromptTemplateChainCards chains={childChains} onOpenChain={onOpenChain} />

      {isPromptTemplatesRoot && (
        <button
          type="button"
          className="card-button"
          onClick={onOpenRenderLog}
        >
          <p className="text-base font-semibold">Template Render Log</p>
          <p className="text-sm text-secondary">Inspect rendered templates and responses.</p>
        </button>
      )}

      {childGroups.length === 0 && childChains.length === 0 && (
        <div className="rounded-lg border p-4 bg-surface-soft">
          <p className="text-sm text-secondary">This group has no chains or child groups.</p>
        </div>
      )}
    </div>
  );
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

  const openGroup = (groupId: string) => {
    setSettingsSection(buildPromptTemplatesPath(PROMPT_TEMPLATES_BASE, parsedPath.groupIds.concat(groupId)));
  };

  const openChain = (chainId: string) => {
    setSettingsSection(buildPromptTemplatesPath(PROMPT_TEMPLATES_BASE, parsedPath.groupIds, chainId));
  };

  const returnToRoot = () => setSettingsSection(PROMPT_TEMPLATES_BASE);
  const returnToGroup = () =>
    setSettingsSection(buildPromptTemplatesPath(PROMPT_TEMPLATES_BASE, parsedPath.groupIds));
  const openRenderLog = () => setSettingsSection('prompt-templates/template-render-log');

  if (!parsedPath.isValid) {
    return (
      <div className="space-y-3">
        <h2 className="text-2xl font-semibold">Prompt Templates</h2>
        <p className="text-sm text-danger-text">The prompt templates route is invalid.</p>
        <button
          type="button"
          className="px-3 py-1 border rounded-sm"
          onClick={returnToRoot}
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
          onClick={returnToRoot}
        >
          Return to Prompt Templates Root
        </button>
      </div>
    );
  }

  return (
    <TemplateGroupView
      activeGroup={activeGroup}
      parsedGroupIds={parsedPath.groupIds}
      chainId={parsedPath.chainId}
      onOpenGroup={openGroup}
      onOpenChain={openChain}
      onReturnToGroup={returnToGroup}
      onOpenRenderLog={openRenderLog}
    />
  );
}
