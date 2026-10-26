import type { PromptTemplateChain } from '../../../engine/prompt_templates/prompt_template_chain.js';
import type { PromptExecutionContext } from '../../../engine/prompt_templates/prompt_template_context_fields.js';

type PromptTemplateChainCardsProps = {
  chains: PromptTemplateChain<PromptExecutionContext, unknown>[];
  onOpenChain: (chainId: string) => void;
};

function PromptTemplateChainCard({
  chain,
  onOpenChain,
}: {
  chain: PromptTemplateChain<PromptExecutionContext, unknown>;
  onOpenChain: (chainId: string) => void;
}) {
  const chainData = chain.settingsBridge.use();

  return (
    <button
      type="button"
      className="card-button"
      onClick={() => onOpenChain(chain.templateChainId)}
    >
      <p className="text-base font-semibold">{chainData.title}</p>
      <p className="text-xs text-muted">ID: {chain.templateChainId}</p>
      <p className="text-sm text-secondary">{chainData.description}</p>
    </button>
  );
}

export default function PromptTemplateChainCards({ chains, onOpenChain }: PromptTemplateChainCardsProps) {
  return (
    <div className="space-y-3">
      {chains.map((chain) => (
        <PromptTemplateChainCard
          key={chain.templateChainId}
          chain={chain}
          onOpenChain={onOpenChain}
        />
      ))}
    </div>
  );
}
