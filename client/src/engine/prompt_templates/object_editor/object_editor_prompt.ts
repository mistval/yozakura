import {
  objectEditorPromptOutputSchema,
  type ObjectEditorPromptOutput,
} from '../../object_editor/object_editor.js';
import {
  objectEditorExecutionContextSchema,
  type ObjectEditorExecutionContext,
} from '../prompt_template_context_fields.js';
import type { PromptTemplateChainSpec } from '../template_types.js';

export const OBJECT_EDITOR_TEMPLATE_CHAIN_ID = 'object_editor';

export const objectEditorPromptChainSpec: PromptTemplateChainSpec<
  ObjectEditorExecutionContext,
  ObjectEditorPromptOutput
> = {
  templateChainId: OBJECT_EDITOR_TEMPLATE_CHAIN_ID,
  defaultTitle: 'Object Editor',
  defaultDescription:
    'System prompts and patch parser used when editing structured Yozakura objects via RFC 6902 JSON Patch.',
  contextSchema: objectEditorExecutionContextSchema,
  templates: [
    {
      templateId: 'object_editor_system_prompt',
      name: 'Object Editor System Prompt',
      description:
        'Leading system prompt containing the role, JSON Schema, and RFC 6902 JSON Patch instructions.',
      role: 'system',
      defaultTemplateString: `You are an expert assistant helping the user inspect, discuss, and edit a Yozakura "<%= it.objectEditorTargetTitle %>" JSON object.

Here is the JSON Schema for the "<%= it.objectEditorTargetTitle %>" object:
<object_json_schema>
<%= it.objectEditorJsonSchema %>
</object_json_schema>

How to edit the object:
- Express all changes as an RFC 6902 JSON Patch array inside <json_patch>...</json_patch> tags at the end of your response.
- Always include a <json_patch>...</json_patch> block at the end of every response. If the user is only asking a question or no changes are needed, explain clearly and finish with <json_patch>[]</json_patch>.
- Write a concise, helpful plain-text explanation before the <json_patch> block describing what you changed (or answering the user's question).
- Never modify or remove any field marked with "readOnly": true, except when creating a new element.
- When adding a brand-new sub-object or array item that has an "id" field:
  - Always set its "id" field to a placeholder string like "newId(1)", "newId(2)", etc., and reuse that same placeholder anywhere else in the patch that references that new item (such as adjacency or zone locationIds). Every occurrence of the same placeholder in the patch will resolve to the same generated ID.
  - Omit "createdAt" and "updatedAt" (or set them to "") and they will be populated automatically.
- Ensure the resulting object strictly conforms to the JSON Schema above.
- The latest user message includes <object_current_state> containing the exact current JSON state of the object. Earlier conversation turns may omit old snapshots, include manual user patches as system messages, or report patch validation errors as system messages.`,
    },
    {
      templateId: 'object_editor_final_instructions_prompt',
      name: 'Object Editor Final Instructions Prompt',
      description:
        'Trailing system prompt inserted after conversation history and immediately before the latest user message.',
      role: 'system',
      defaultTemplateString: `Reminder for editing "<%= it.objectEditorTargetTitle %>":
- Base your response strictly on the <object_current_state> in the upcoming user message.
- Do not modify or delete any "readOnly": true fields on existing objects; for newly added objects that have an "id" field, always set "id" to a placeholder like "newId(1)", "newId(2)", etc.
- Always end your response with a valid RFC 6902 JSON Patch array wrapped in <json_patch>...</json_patch> tags (use <json_patch>[]</json_patch> if no changes should be made).`,
    },
  ],
  parser: {
    defaultParserSource: `async (response, _it) => {
  const matches = [...response.matchAll(/<json_patch>\\s*([\\s\\S]*?)\\s*<\\/json_patch>/gi)];
  if (matches.length === 0) {
    return { message: response.trim(), patch: [] };
  }
  if (matches.length > 1) {
    throw new Error(\`Expected at most one <json_patch>...</json_patch> block, found \${matches.length}.\`);
  }

  const match = matches[0];
  const messageBefore = response.slice(0, match.index).trim();
  const messageAfter = response.slice(match.index + match[0].length).trim();
  const message = [messageBefore, messageAfter].filter(Boolean).join('\\n\\n').trim();

  let rawJson = match[1].trim();
  rawJson = rawJson.replace(/^\`\`\`(?:json)?\\s*/i, '').replace(/\\s*\`\`\`$/i, '').trim();
  const patch = rawJson === '' ? [] : JSON.parse(rawJson);

  return { message, patch };
}`,
    parserOutputSchema: objectEditorPromptOutputSchema,
  },
};
