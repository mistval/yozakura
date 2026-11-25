import { applyPatch } from 'fast-json-patch';
import _ from 'lodash';
import z from 'zod';
import { createStore, useStore } from 'zustand';
import { assert, assertNonNullish } from '../../errors/application_error.js';
import { getErrorMessage } from '../../errors/error_util.js';
import { newId } from '../../util/id.js';
import type { OpenAIChatCompletionRequestMessage } from '../types.js';
import {
  assertNoReadOnlyViolations,
  autoPopulatePersistedSubObjectFields,
  compareToJsonPatch,
  computeHumanReadableChanges,
  jsonPatchOperationSchema,
  replaceNewIdPlaceholdersInPatch,
  type JsonPatchOperation,
  type ObjectEditorHumanReadableChange,
} from './object_editor_util.js';

export { jsonPatchOperationSchema, type JsonPatchOperation, type ObjectEditorHumanReadableChange };

// The prompt template's parser is responsible for extracting the message and JSON Patch array.
export const objectEditorPromptOutputSchema = z.object({
  message: z.string(),
  patch: z.array(jsonPatchOperationSchema),
});

export type ObjectEditorPromptOutput = z.infer<typeof objectEditorPromptOutputSchema>;

export type ObjectEditorHistoryEntrySource = 'ai' | 'manual';

// Consumers outside this module adapt these entries into Transcript / DumbChatPane items.
export interface ObjectEditorHistoryEntry<TObjectType> {
  id: string;
  source: ObjectEditorHistoryEntrySource;
  objectBeforeState: TObjectType;
  objectAfterState: TObjectType;
  canRevert: boolean;
  userMessage: string;
  agentMessage: string;
  objectPatch: JsonPatchOperation[];
  humanReadableChanges: ObjectEditorHumanReadableChange[];
  invalidRawJson: string | undefined;
  validationError: string | undefined;
}

export interface ObjectEditorPendingTurn {
  userMessage: string;
  streamingMessage: string;
}

export interface ObjectEditorInvalidManualEdit {
  rawJson: string;
  error: string;
}

export interface ObjectEditorState<TObjectType> {
  initialized: boolean;
  initialObject: TObjectType | undefined;
  currentObject: TObjectType | undefined;
  history: ObjectEditorHistoryEntry<TObjectType>[];
  pendingTurn: ObjectEditorPendingTurn | undefined;
  invalidManualEdit: ObjectEditorInvalidManualEdit | undefined;
  isDirty: boolean;
}

export interface ObjectEditorExecutePromptOptions {
  onTokens: (fullText: string) => void;
  abortSignal: AbortSignal;
}

export interface ObjectEditorDelegate<TObjectType> {
  getObjectCurrentState: () => Promise<TObjectType>;
  writeObjectState: (object: TObjectType) => Promise<void> | void;
  executePrompt: (
    messages: OpenAIChatCompletionRequestMessage[],
    options: ObjectEditorExecutePromptOptions
  ) => Promise<ObjectEditorPromptOutput>;
  zodSchema: z.ZodType<TObjectType>;
}

export class ObjectEditor<TObjectType> {
  // Per-instance reactive store
  public readonly store = createStore<ObjectEditorState<TObjectType>>(() => ({
    initialized: false,
    initialObject: undefined,
    currentObject: undefined,
    history: [],
    pendingTurn: undefined,
    invalidManualEdit: undefined,
    isDirty: false,
  }));

  private activeAbortController: AbortController | undefined = undefined;

  constructor(private readonly delegate: ObjectEditorDelegate<TObjectType>) {}

  public getState(): ObjectEditorState<TObjectType> {
    return this.store.getState();
  }

  public useState<TReturnType>(
    selector: (state: ObjectEditorState<TObjectType>) => TReturnType
  ): TReturnType {
    return useStore(this.store, selector);
  }

  public async initialize(): Promise<void> {
    this.cancelPendingTurn();
    const initial = await this.delegate.getObjectCurrentState();
    this.store.setState({
      initialized: true,
      initialObject: initial,
      currentObject: initial,
      history: [],
      pendingTurn: undefined,
      invalidManualEdit: undefined,
      isDirty: false,
    });
  }

  public cancelPendingTurn(): void {
    this.activeAbortController?.abort();
  }

  public resetConversation(): void {
    this.cancelPendingTurn();
    this.store.setState({
      history: [],
      pendingTurn: undefined,
      invalidManualEdit: undefined,
    });
  }

  public async discardChanges(): Promise<void> {
    this.cancelPendingTurn();
    const initialObject = this.requireInitialObject();
    await this.delegate.writeObjectState(initialObject);
    this.store.setState({
      currentObject: initialObject,
      history: [],
      pendingTurn: undefined,
      invalidManualEdit: undefined,
      isDirty: false,
    });
  }

  public async notifyPossibleManualChange(): Promise<boolean> {
    const newObjectState = await this.delegate.getObjectCurrentState();
    const lastKnown = this.getLatestKnownObject();
    const patch = compareToJsonPatch(lastKnown, newObjectState);
    if (patch.length === 0) {
      return false;
    }

    const humanReadableChanges = computeHumanReadableChanges(this.delegate.zodSchema, lastKnown, patch);
    const entry: ObjectEditorHistoryEntry<TObjectType> = {
      id: newId(),
      source: 'manual',
      objectBeforeState: lastKnown,
      objectAfterState: newObjectState,
      canRevert: true,
      userMessage: '',
      agentMessage: 'Manual changes applied by user.',
      objectPatch: patch,
      humanReadableChanges,
      invalidRawJson: undefined,
      validationError: undefined,
    };

    this.commitNewHistoryState(entry, newObjectState, undefined);
    return true;
  }

  public async applyManualJsonEdit(rawJson: string): Promise<boolean> {
    this.assertInitialized();
    assert(!this.state.pendingTurn, 'Cannot apply manual edit while an AI turn is running');

    const lastKnown = this.getLatestKnownObject();
    if (this.state.invalidManualEdit) {
      if (rawJson === this.state.invalidManualEdit.rawJson) {
        return false;
      }
    } else if (rawJson === JSON.stringify(lastKnown, null, 2)) {
      return false;
    }

    let parsedJson: unknown;
    try {
      parsedJson = JSON.parse(rawJson);
    } catch (error) {
      return this.recordInvalidManualEdit(rawJson, `Invalid JSON: ${getErrorMessage(error)}`, lastKnown);
    }

    const validation = this.delegate.zodSchema.safeParse(parsedJson);
    if (!validation.success) {
      return this.recordInvalidManualEdit(rawJson, validation.error.message, lastKnown);
    }

    const validatedNext = validation.data;
    const patch = compareToJsonPatch(lastKnown, validatedNext);
    if (patch.length === 0) {
      if (this.state.invalidManualEdit) {
        let firstInvalidIndex = this.history.length;
        while (firstInvalidIndex > 0 && this.history[firstInvalidIndex - 1]?.invalidRawJson !== undefined) {
          firstInvalidIndex -= 1;
        }
        assert(
          firstInvalidIndex < this.history.length,
          'Expected trailing invalid manual edit entry in history'
        );
        await this.revertFromIndex(firstInvalidIndex);
        return true;
      }
      return false;
    }

    const humanReadableChanges = computeHumanReadableChanges(this.delegate.zodSchema, lastKnown, patch);
    await this.delegate.writeObjectState(validatedNext);

    const entry: ObjectEditorHistoryEntry<TObjectType> = {
      id: newId(),
      source: 'manual',
      objectBeforeState: lastKnown,
      objectAfterState: validatedNext,
      canRevert: true,
      userMessage: '',
      agentMessage: 'Updated object manually via raw JSON.',
      objectPatch: patch,
      humanReadableChanges,
      invalidRawJson: undefined,
      validationError: undefined,
    };

    this.commitNewHistoryState(entry, validatedNext, undefined);
    return true;
  }

  public async runUserMessage(message: string): Promise<void> {
    this.assertInitialized();
    assert(!this.state.pendingTurn, 'An AI turn is already in progress');
    assert(!this.state.invalidManualEdit, 'Resolve invalid manual JSON before sending a message');

    const abortController = new AbortController();
    this.activeAbortController = abortController;
    this.store.setState({
      pendingTurn: {
        userMessage: message,
        streamingMessage: '',
      },
    });

    try {
      const oldObjectState = await this.delegate.getObjectCurrentState();
      const messages = await this.buildPromptMessages(message);
      abortController.signal.throwIfAborted();

      const rawResult = await this.delegate.executePrompt(messages, {
        abortSignal: abortController.signal,
        onTokens: (fullText) => {
          const currentPending = this.store.getState().pendingTurn;
          if (!currentPending) {
            return;
          }
          this.store.setState({
            pendingTurn: {
              ...currentPending,
              streamingMessage: fullText,
            },
          });
        },
      });

      const result = objectEditorPromptOutputSchema.parse(rawResult);
      if (result.patch.length === 0) {
        const entry: ObjectEditorHistoryEntry<TObjectType> = {
          id: newId(),
          source: 'ai',
          objectBeforeState: oldObjectState,
          objectAfterState: oldObjectState,
          canRevert: false,
          userMessage: message,
          agentMessage: result.message,
          objectPatch: [],
          humanReadableChanges: [],
          invalidRawJson: undefined,
          validationError: undefined,
        };
        this.commitNewHistoryState(entry, oldObjectState, undefined);
        return;
      }

      const applied = this.validateAndApplyPatch(oldObjectState, result.patch);
      if (!applied.ok) {
        const entry: ObjectEditorHistoryEntry<TObjectType> = {
          id: newId(),
          source: 'ai',
          objectBeforeState: oldObjectState,
          objectAfterState: oldObjectState,
          canRevert: false,
          userMessage: message,
          agentMessage: result.message,
          objectPatch: result.patch,
          humanReadableChanges: [],
          invalidRawJson: undefined,
          validationError: applied.error,
        };
        this.commitNewHistoryState(entry, oldObjectState, undefined);
        return;
      }

      const hasNetChanges = applied.resolvedPatch.length > 0;
      if (hasNetChanges) {
        await this.delegate.writeObjectState(applied.newObjectState);
      }
      const entry: ObjectEditorHistoryEntry<TObjectType> = {
        id: newId(),
        source: 'ai',
        objectBeforeState: oldObjectState,
        objectAfterState: applied.newObjectState,
        canRevert: hasNetChanges,
        userMessage: message,
        agentMessage: result.message,
        objectPatch: applied.resolvedPatch,
        humanReadableChanges: applied.humanReadableChanges,
        invalidRawJson: undefined,
        validationError: undefined,
      };
      this.commitNewHistoryState(entry, applied.newObjectState, undefined);
    } finally {
      if (this.activeAbortController === abortController) {
        this.activeAbortController = undefined;
      }
      if (this.store.getState().pendingTurn !== undefined) {
        this.store.setState({ pendingTurn: undefined });
      }
    }
  }

  public async buildPromptMessages(newUserMessage: string): Promise<OpenAIChatCompletionRequestMessage[]> {
    const currentObjectState = this.state.initialized
      ? this.getLatestKnownObject()
      : await this.delegate.getObjectCurrentState();

    const historyMessages: OpenAIChatCompletionRequestMessage[] = [];

    for (const h of this.history) {
      if (h.source === 'manual') {
        if (!h.validationError && h.objectPatch.length > 0) {
          historyMessages.push({
            role: 'system',
            content: `The user manually modified the object with the following JSON patch:\n\n<json_patch>\n${JSON.stringify(h.objectPatch)}\n</json_patch>`,
          });
        }
        continue;
      }

      historyMessages.push({
        role: 'user',
        content: h.userMessage,
      });

      const assistantContent =
        `${h.agentMessage}\n\n<json_patch>\n${JSON.stringify(h.objectPatch)}\n</json_patch>`.trim();

      historyMessages.push({
        role: 'assistant',
        content: assistantContent,
      });

      if (h.validationError) {
        historyMessages.push({
          role: 'system',
          content: `The attempted patch resulted in an invalid result: <error>${h.validationError}</error>. No changes were made.`,
        });
      }
    }

    historyMessages.push({
      role: 'user',
      content: `Here is the current state of the object:\n\n<object_current_state>\n${JSON.stringify(currentObjectState)}\n</object_current_state>\n\n${newUserMessage}`,
    });

    return historyMessages;
  }

  public async revertFromIndex(index: number): Promise<string | undefined> {
    this.assertInitialized();
    assert(!this.state.pendingTurn, 'Cannot revert while an AI turn is in progress');

    const toRevert = this.history[index];
    assertNonNullish(toRevert, `No history entry at index ${index}`);
    assert(toRevert.canRevert, `History entry at index ${index} cannot be reverted`);

    const restored = toRevert.objectBeforeState;
    if (!toRevert.invalidRawJson) {
      await this.delegate.writeObjectState(restored);
    }

    const initialObject = this.requireInitialObject();
    const nextHistory = this.history.slice(0, index);
    const newTop = nextHistory.at(-1);
    const nextInvalidManualEdit =
      newTop?.invalidRawJson !== undefined && newTop.validationError !== undefined
        ? { rawJson: newTop.invalidRawJson, error: newTop.validationError }
        : undefined;

    this.store.setState({
      history: nextHistory,
      currentObject: restored,
      invalidManualEdit: nextInvalidManualEdit,
      isDirty: !_.isEqual(restored, initialObject) || Boolean(nextInvalidManualEdit),
    });

    return toRevert.source === 'ai' ? toRevert.userMessage : undefined;
  }

  public async revertLatest(): Promise<string | undefined> {
    const latestIndex = this.history.findLastIndex((h) => h.canRevert);
    assert(latestIndex >= 0, 'No revertible history entry found');
    return this.revertFromIndex(latestIndex);
  }

  private validateAndApplyPatch(
    oldObjectState: TObjectType,
    rawPatch: readonly JsonPatchOperation[]
  ):
    | {
        ok: true;
        resolvedPatch: JsonPatchOperation[];
        newObjectState: TObjectType;
        humanReadableChanges: ObjectEditorHumanReadableChange[];
      }
    | { ok: false; error: string } {
    try {
      const resolvedPatch = replaceNewIdPlaceholdersInPatch(rawPatch);
      assertNoReadOnlyViolations(this.delegate.zodSchema, oldObjectState, resolvedPatch);

      const patchedDocument = applyPatch(oldObjectState, resolvedPatch, true, false).newDocument;
      const populatedDocument = autoPopulatePersistedSubObjectFields(
        this.delegate.zodSchema,
        patchedDocument,
        new Date().toISOString()
      );
      const parsed = this.delegate.zodSchema.safeParse(populatedDocument);

      if (!parsed.success) {
        return { ok: false, error: parsed.error.message };
      }

      const finalPatch = compareToJsonPatch(oldObjectState, parsed.data);
      const humanReadableChanges = computeHumanReadableChanges(
        this.delegate.zodSchema,
        oldObjectState,
        finalPatch
      );

      return {
        ok: true,
        resolvedPatch: finalPatch,
        newObjectState: parsed.data,
        humanReadableChanges,
      };
    } catch (error) {
      return { ok: false, error: getErrorMessage(error) };
    }
  }

  private recordInvalidManualEdit(rawJson: string, error: string, lastKnown: TObjectType): boolean {
    const entry: ObjectEditorHistoryEntry<TObjectType> = {
      id: newId(),
      source: 'manual',
      objectBeforeState: lastKnown,
      objectAfterState: lastKnown,
      canRevert: true,
      userMessage: '',
      agentMessage: 'Manual JSON edit failed validation.',
      objectPatch: [],
      humanReadableChanges: [],
      invalidRawJson: rawJson,
      validationError: error,
    };

    this.commitNewHistoryState(entry, lastKnown, { rawJson, error });
    return false;
  }

  private commitNewHistoryState(
    entry: ObjectEditorHistoryEntry<TObjectType>,
    nextObject: TObjectType,
    invalidManualEdit: ObjectEditorInvalidManualEdit | undefined
  ): void {
    const initialObject = this.requireInitialObject();
    this.store.setState({
      history: this.history.concat(entry),
      currentObject: nextObject,
      pendingTurn: undefined,
      invalidManualEdit,
      isDirty: !_.isEqual(nextObject, initialObject) || Boolean(invalidManualEdit),
    });
  }

  private assertInitialized(): void {
    assert(this.state.initialized, 'ObjectEditor must be initialized before use');
  }

  private requireInitialObject(): TObjectType {
    this.assertInitialized();
    const initial = this.state.initialObject;
    assertNonNullish(initial, 'ObjectEditor initialObject is not set');
    return initial;
  }

  private getLatestKnownObject(): TObjectType {
    const mostRecentEntry = this.history.at(-1);
    if (mostRecentEntry) {
      return mostRecentEntry.objectAfterState;
    }
    const current = this.state.currentObject;
    assertNonNullish(current, 'ObjectEditor has no current object state');
    return current;
  }

  private get state() {
    return this.store.getState();
  }

  private get history() {
    return this.state.history;
  }
}

export function useObjectEditorState<TObjectType, TReturnType>(
  editor: ObjectEditor<TObjectType>,
  selector: (state: ObjectEditorState<TObjectType>) => TReturnType
): TReturnType {
  return useStore(editor.store, selector);
}
