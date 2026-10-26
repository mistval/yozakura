import { memoryRagExecutionContext, type MemoryRagExecutionContext } from '../prompt_template_context_fields.js';
import type { PromptTemplateChainSpec } from '../template_types.js';

export const memoryRagPromptChainSpec: PromptTemplateChainSpec<
  MemoryRagExecutionContext,
  undefined
> = {
  templateChainId: 'gen_memory_rag_insert_template',
  defaultTitle: 'Memory RAG Prompt Templates',
  defaultDescription: 'Templates used for dynamic insertion of offscreen character memories.',
  contextSchema: memoryRagExecutionContext,
  templates: [
    {
      templateId: 'memory_rag_prompt',
      name: 'Memory RAG Prompt',
      description: 'Inline reminder prompt used when offscreen characters are mentioned in chat.',
      role: 'system',
      defaultTemplateString: `<% const mentioner = it.mentionedByCharacter.id === it.focusedCharacter.id ? 'You' : it.mentionedByCharacter.firstName; %>
<%= mentioner %> may have just mentioned a character named <%= it.targetCharacter.firstName %> <%= it.targetCharacter.lastName %> who is not part of this chat. Here are your memories of <%= it.targetCharacter.firstName %> (if any):
<memories_of_<%= it.targetCharacter.xmlTagSafeName %>>
<%= it.targetCharacterRelationship.memory || 'You do not have any memories of ' + it.targetCharacter.firstName + ' yet' %>
</memories_of_<%= it.targetCharacter.xmlTagSafeName %>>`,
    },
  ],
};
