import type { PromptTemplateChain } from '../../../engine/prompt_templates/prompt_template_chain.js';
import type { PromptExecutionContext } from '../../../engine/prompt_templates/prompt_template_context_fields.js';
import DeleteButton from '../../ui/DeleteButton.js';

type PromptTemplateChainCardsProps = {
  chains: PromptTemplateChain<PromptExecutionContext, unknown>[];
  onOpenChain: (chainId: string) => void;
  canDeleteChains?: boolean | undefined;
  onDeleteChain?: ((chainId: string) => void) | undefined;
};

function PromptTemplateChainCard({
  chain,
  onOpenChain,
  canDelete,
  onDelete,
  deleteDisabled,
}: {
  chain: PromptTemplateChain<PromptExecutionContext, unknown>;
  onOpenChain: (chainId: string) => void;
  canDelete?: boolean | undefined;
  onDelete?: ((chainId: string) => void) | undefined;
  deleteDisabled?: boolean | undefined;
}) {
  const chainData = chain.settingsBridge.use();

  if (canDelete && onDelete) {
    return (
      <div className="flex items-stretch gap-2">
        <button
          type="button"
          className="card-button flex-1"
          onClick={() => onOpenChain(chain.templateChainId)}
        >
          <p className="text-base font-semibold">{chainData.title}</p>
          <p className="text-xs text-muted">ID: {chain.templateChainId}</p>
          <p className="text-sm text-secondary">{chainData.description}</p>
        </button>
        <DeleteButton
          className="border rounded-sm"
          label="Delete"
          disabled={Boolean(deleteDisabled)}
          confirmTitle="Delete Prompt Template Chain"
          confirmLabel="Delete"
          confirmMessage={`Are you sure you want to delete this prompt template chain? ("${chainData.title}")`}
          onConfirm={() => onDelete(chain.templateChainId)}
        />
      </div>
    );
  }

  return (
    <button type="button" className="card-button" onClick={() => onOpenChain(chain.templateChainId)}>
      <p className="text-base font-semibold">{chainData.title}</p>
      <p className="text-xs text-muted">ID: {chain.templateChainId}</p>
      <p className="text-sm text-secondary">{chainData.description}</p>
    </button>
  );
}

export default function PromptTemplateChainCards({
  chains,
  onOpenChain,
  canDeleteChains,
  onDeleteChain,
}: PromptTemplateChainCardsProps) {
  const deleteDisabled = chains.length <= 1;

  return (
    <div className="space-y-3">
      {chains.map((chain) => (
        <PromptTemplateChainCard
          key={chain.templateChainId}
          chain={chain}
          onOpenChain={onOpenChain}
          canDelete={canDeleteChains}
          onDelete={onDeleteChain}
          deleteDisabled={deleteDisabled}
        />
      ))}
    </div>
  );
}
