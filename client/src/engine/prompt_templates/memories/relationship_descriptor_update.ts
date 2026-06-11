import { z } from 'zod';
import { PromptTemplateBase } from '../prompt_template';
import { PromptOutputParser } from '../prompt_output_parser';
import { PromptTemplateChain } from '../prompt_template_chain';
import { targetedConversationExecutionContextSchema } from '../prompt_template_context_fields';

class RelationshipDescriptorUpdateSystemTemplate extends PromptTemplateBase<
  z.infer<typeof targetedConversationExecutionContextSchema>
> {
  public readonly defaultTemplateString = `You will be given the following types of information:
1. A list of summaries of recent conversations that have taken place between <%= it.focusedCharacter.firstName %> and <%= it.targetCharacter.firstName %> (if any).
2. A list of secondhand information that <%= it.focusedCharacter.firstName %> has heard about <%= it.targetCharacter.firstName %> (if any).
3. A consolidated summary of <%= it.focusedCharacter.firstName %>'s memories towards <%= it.targetCharacter.firstName %> (if any).
4. What <%= it.targetCharacter.firstName %> currently sees <%= it.focusedCharacter.firstName %> as being, in a broad descriptive sense (e.g. "friend", "rival", "jerk", "helper", "romantic interest", etc).

Your job is to use the available information to determine what <%= it.targetCharacter.firstName %> now sees <%= it.focusedCharacter.firstName %> as being, in a broad sense.

Rules:
- Output just 1-3 words that represent what <%= it.focusedCharacter.firstName %> sees <%= it.targetCharacter.firstName %> as being now.
- Examples: "Friend", "Rival", "Hated Enemy", "Boyfriend", "Mentor".
- If the existing descriptor is already adequate, you may output that as-is.`;
  public readonly contextSchema = targetedConversationExecutionContextSchema;

  public readonly templateName = 'Relationship Descriptor Update (System)';
  public readonly templateDescription =
    'System prompt for updating relationship labels from transcript context.';
  public readonly templateId = 'relationship_descriptor_update_system';
  public readonly templateSettings = [];
  public readonly role = 'system';
}

class RelationshipDescriptorUpdateUserTemplate extends PromptTemplateBase<
  z.infer<typeof targetedConversationExecutionContextSchema>
> {
  public readonly defaultTemplateString = `Here is <%= it.focusedCharacter.firstName %>'s consolidated memory about <%= it.targetCharacter.firstName %>:
<existing_memory>
<%= it.targetCharacterRelationship.memory || (it.focusedCharacter.firstName + ' has no memories about ' + it.targetCharacter.firstName + ' yet.') %>

</existing_memory>

Recent specific interactions with and information about <%= it.targetCharacter.firstName %> that <%= it.focusedCharacter.firstName %> remembers (oldest first):
<%= it.targetCharacterFormattedRollingMemoriesText %>


<%= it.focusedCharacter.firstName %> currently sees <%= it.targetCharacter.firstName %> as being:
<relationship>
<%= it.targetCharacterRelationship?.descriptor || 'Stranger' %>

</relationship>

Output an updated relationship descriptor. Limit yourself to 1-3 words. Examples: "Friend", "Rival", "Hated Enemy", "Boyfriend", "Mentor". If the provided information does not warrant any changes to the existing descriptor, you may output the existing descriptor as is. Output only the new descriptor and nothing else.`;
  public readonly contextSchema = targetedConversationExecutionContextSchema;

  public readonly templateName = 'Relationship Descriptor Update (User)';
  public readonly templateDescription =
    'User prompt carrying transcript and current relationship descriptor baseline.';
  public readonly templateId = 'relationship_descriptor_update_user';
  public readonly templateSettings = [];
  public readonly role = 'user';
}

const relationshipDescriptorUpdateSystemTemplate = new RelationshipDescriptorUpdateSystemTemplate();
const relationshipDescriptorUpdateUserTemplate = new RelationshipDescriptorUpdateUserTemplate();

export const relationshipDescriptorUpdateChainGroup = new PromptTemplateChain({
  templateChainId: 'gen_relationship_descriptor',
  templateChainTitle: 'Relationship Descriptor Update',
  templateChainDescription:
    'Prompts for determining the updated relationship label between characters based on conversation transcripts.',
  contextSchema: targetedConversationExecutionContextSchema,
  templates: [
    { template: relationshipDescriptorUpdateSystemTemplate },
    { template: relationshipDescriptorUpdateUserTemplate },
  ],
  parser: new PromptOutputParser<z.infer<typeof targetedConversationExecutionContextSchema>, string>(
    'async (response, it) => response',
    'relationship_descriptor_update_parser',
    z.string()
  ),
});
