import type { PromptTemplateChain } from '../../../engine/prompt_templates/prompt_template_chain.js';
import type { PromptExecutionContext } from '../../../engine/prompt_templates/prompt_template_context_fields.js';

type PromptTemplateChainCardsProps = {
  chains: PromptTemplateChain<PromptExecutionContext, unknown>[];
  onOpenChain: (chainId: string) => void;
};

export default function PromptTemplateChainCards({ chains, onOpenChain }: PromptTemplateChainCardsProps) {
  return (
    <div className="space-y-3">
      {chains.map((chain) => (
        <button
          key={chain.templateChainId}
          type="button"
          className="card-button"
          onClick={() => onOpenChain(chain.templateChainId)}
        >
          <p className="text-base font-semibold">{chain.templateChainTitle}</p>
          <p className="text-xs text-muted">ID: {chain.templateChainId}</p>
          <p className="text-sm text-secondary">{chain.templateChainDescription}</p>
        </button>
      ))}
    </div>
  );
}
