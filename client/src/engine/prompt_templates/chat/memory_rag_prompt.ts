import { z } from 'zod';
import { PromptTemplateBase } from '../prompt_template';
import { PromptTemplateChain } from '../prompt_template_chain';
import { memoryRagExecutionContext } from '../prompt_template_context_fields';

class MemoryRagPromptTemplate extends PromptTemplateBase<z.infer<typeof memoryRagExecutionContext>> {
  public readonly defaultTemplateString = `<% const mentioner = it.mentionedByCharacter.id === it.focusedCharacter.id ? 'You' : it.mentionedByCharacter.firstName; %>
<%= mentioner %> may have just mentioned a character named <%= it.targetCharacter.firstName %> <%= it.targetCharacter.lastName %> who is not part of this chat. Here are your memories of <%= it.targetCharacter.firstName %> (if any):
<memories_of_<%= it.targetCharacter.id %>>
<%= it.targetCharacterRelationship.memory || 'You do not have any memories of ' + it.targetCharacter.firstName + ' yet' %>
</memories_of_<%= it.targetCharacter.id %>>`;
  public readonly contextSchema = memoryRagExecutionContext;

  public readonly templateName = 'Memory RAG Prompt';
  public readonly templateDescription =
    'Inline reminder prompt used when offscreen characters are mentioned in chat.';
  public readonly templateId = 'memory_rag_prompt';
  public readonly templateSettings = [];
  public readonly role = 'system';
}

const memoryRagPromptTemplate = new MemoryRagPromptTemplate();
export const memoryRagPromptTemplatesGroup = new PromptTemplateChain({
  templateChainId: 'gen_memory_rag_insert_template',
  templateChainTitle: 'Memory RAG Prompt Templates',
  templateChainDescription: 'Templates used for dynamic insertion of offscreen character memories.',
  contextSchema: memoryRagExecutionContext,
  templates: [{ template: memoryRagPromptTemplate }],
});
