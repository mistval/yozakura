import { z } from 'zod';

export type ParsedLorebookTrigger =
  | { type: 'phrase'; phrase: string }
  | { type: 'regex'; source: string; flags: string };

export function parseLorebookTrigger(value: string): ParsedLorebookTrigger {
  if (!value.startsWith('/')) {
    return { type: 'phrase', phrase: value };
  }

  const closingSlashIndex = value.lastIndexOf('/');
  if (closingSlashIndex === 0) {
    return { type: 'phrase', phrase: value };
  }

  const flags = value.slice(closingSlashIndex + 1);
  if (!/^[a-z]*$/i.test(flags)) {
    return { type: 'phrase', phrase: value };
  }

  return {
    type: 'regex',
    source: value.slice(1, closingSlashIndex),
    flags,
  };
}

function validateLorebookTrigger(value: string, context: z.RefinementCtx): void {
  const trigger = parseLorebookTrigger(value);
  if (trigger.type !== 'regex') {
    return;
  }

  try {
    new RegExp(trigger.source, trigger.flags);
  } catch (error) {
    if (!(error instanceof SyntaxError)) {
      throw error;
    }

    context.addIssue({
      code: 'custom',
      message: `Invalid regular expression: ${error.message}`,
    });
  }
}

export const lorebookTriggerSchema = z.string().trim().min(1).superRefine(validateLorebookTrigger);

export const serializedLorebookEntrySchema = z.object({
  id: z.string().min(1),
  title: z.string(),
  primaryTriggers: z.array(lorebookTriggerSchema),
  staticContent: z.string(),
  dynamicContent: z.string(),
  stickyDuration: z.number().int().min(0),
  canBeRecursivelyActivated: z.boolean(),
  canActivateFurtherEntries: z.boolean(),
});

export const serializedLorebookSchema = z.object({
  id: z.string().min(1),
  title: z.string(),
  entries: z.array(serializedLorebookEntrySchema),
  insertionLimit: z.number().int().min(-1),
  exemptFromGlobalInsertionLimit: z.boolean(),
  newEntryInstructions: z.string(),
});

export const lorebookGlobalSettingsSchema = z.object({
  globalInsertionLimit: z.number().int().min(-1),
});

export type SerializedLorebookEntry = z.infer<typeof serializedLorebookEntrySchema>;
export type SerializedLorebook = z.infer<typeof serializedLorebookSchema>;
export type LorebookGlobalSettings = z.infer<typeof lorebookGlobalSettingsSchema>;
