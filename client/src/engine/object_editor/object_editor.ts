import { applyPatch } from 'fast-json-patch';
import z from 'zod';
import type { OpenAIChatCompletionRequestMessage } from '../types';
import { createStore, useStore } from 'zustand';
import { assert, assertNonNullish } from '../../errors/application_error';
import { newId } from '../../util/id';

// The prompt template's parser will be responsible for parsing the patch out and returning it
const objectEditorPromptOutputSchema = z.object({
  message: z.string(), // May be empty
  patch: z.array(z.object({})), // Please type this correctly for me.
});

export type ObjectEditorPromptOutput = z.infer<typeof objectEditorPromptOutputSchema>;

export interface ObjectEditorHumanReadableChange {
  name: string;
  beforeValue: Record<string, unknown>;
  afterValue: Record<string, unknown>;
}

// Something outside of here should convert an array of these into a new ChatMessage subtype so they can be displayed in the dumb chat pane
export interface ObjectEditorHistoryEntry<TObjectType> {
  objectBeforeState: TObjectType;
  objectAfterState: TObjectType;
  canRevertIfLatest: boolean;
  userMessage: string;
  agentMessage: string;
  objectPatch: any[]; // Please type for me
  humanReadableChanges: ObjectEditorHumanReadableChange[];
  validationError: string;
}

export interface ObjectEditorDelegate<TObjectType, TPromptExecutionContext> {
  getObjectCurrentState: () => Promise<TObjectType>;
  writeObjectState: (object: TObjectType) => unknown;
  createObjectEditorPromptContext: () => Promise<TPromptExecutionContext>;
  executePrompt: (messages: OpenAIChatCompletionRequestMessage[]) => Promise<ObjectEditorPromptOutput>;
  zodSchema: any; // please type this for me
}

export class ObjectEditor<TObjectType, TPromptExecutionContext> {
  // Doing a per-instance reactive store
  private readonly store = createStore<{
    history: ObjectEditorHistoryEntry<TObjectType>[];
  }>(() => ({
    history: [],
  }));

  constructor(private readonly delegate: ObjectEditorDelegate<TObjectType, TPromptExecutionContext>) {}

  async initialize() {
    this.store.setState({
      history: [],
    });
  }

  public async notifyPossibleManualChange() {
    const newObjectState = this.delegate.getObjectCurrentState();
    const lastKnown = this.getLatestKnownObject();

    if (!Object.is(newObjectState, lastKnown)) {
      // Mark entire history as un-revertable
      // Can we automatically generate a patch from this diff and add it into the history so it can be reverted?
    }
  }

  // Does this actually work? WOndering if React rules require us to farm out the useStore call to the React component. That's fine if so.
  public useState(selector: <TReturnType>(store: ReturnType<typeof this.store.getState>) => TReturnType) {
    return useStore(this.store, selector);
  }

  public async runUserMessage(message: string) {
    const oldObjectState = await this.delegate.getObjectCurrentState();
    const messages = await this.buildPromptMessages(message);
    const result = await this.delegate.executePrompt(messages);
    const hasChanges = result.patch?.length > 0;

    // We'll need to change this to safeParse and handle the invalid case
    const newObjectState = hasChanges
      ? this.delegate.zodSchema.parse(
          this.generateNewIds(applyPatch(oldObjectState, result.patch as any).newDocument)
        )
      : oldObjectState;
    await this.delegate.writeObjectState(newObjectState);

    const newHistory = this.state.history.concat({
      objectBeforeState: oldObjectState,
      objectAfterState: newObjectState,
      canRevertIfLatest: hasChanges,
      userMessage: message,
      agentMessage: result.message,
      objectPatch: result.patch,
      humanReadableChanges: this.computeHumanReadableChanges(oldObjectState, newObjectState, result.patch),
      validationError: '',
    });

    this.store.setState({ history: newHistory });
  }

  public async buildPromptMessages(newUserMessage: string): Promise<OpenAIChatCompletionRequestMessage[]> {
    const currentObjectState = await this.delegate.getObjectCurrentState();
    const messages = this.history
      .flatMap((h) =>
        [
          {
            role: 'user' as const,
            content: h.userMessage,
          } satisfies OpenAIChatCompletionRequestMessage,
          {
            role: 'assistant' as const,
            content: `${h.agentMessage}\n\n<json_patch>\n${JSON.stringify(h.objectPatch)}\n</json_patch>`,
          } satisfies OpenAIChatCompletionRequestMessage,
          h.validationError
            ? {
                role: 'system' as const,
                content: `The attempted patch resulted in an invalid result: <error>${h.validationError}</error>. No changes were made.`,
              }
            : [],
        ].flat()
      )
      .concat({
        role: 'user',
        content: `Here is the current state of the object:\n\n<object_current_state>\n${JSON.stringify(currentObjectState)}\n</object_current_state>\n\n${newUserMessage}`,
      });

    return messages;
  }

  public async revertLatest() {
    const latestIndex = this.history.findLastIndex((h) => h.canRevertIfLatest);
    const toRevert = this.history[latestIndex];
    assert(toRevert);
    await this.delegate.writeObjectState(toRevert.objectBeforeState);

    this.store.setState({
      history: this.history.slice(0, latestIndex),
    });

    return toRevert.userMessage;
  }

  private computeHumanReadableChanges(
    oldObject: TObjectType,
    newObject: TObjectType,
    patch: any[]
  ): ObjectEditorHumanReadableChange[] {
    // Iterate through each command in the patch
    // Look up the metadata from the Zod schema registry
    // Metadata tells us how to get the human readable "name" of the field changes
    // This would turn into something like "Paradise Island (Map) -> Beach (Map Location) -> Description"
    // If the before and after values are not symbol types, we just stringify them with idententation, no need to try to decompose them. But we'll tell the model to prefer emitting separate replace ops for each object field, rather than replacing objects wholesale. Also for new objects, we'll tell the model to prefer emitting an op to create an empty obj, then running separate add ops for each field. If the model doesn't respect this rule, that's fine but the user will just see JSON blobs.

    return [];
  }

  private get state() {
    return this.store.getState();
  }

  private get history() {
    return this.state.history;
  }

  private getLatestKnownObject() {
    const mostRecentMessage = this.history.at(-1);
    assertNonNullish(mostRecentMessage, 'unexpected empty history');

    return mostRecentMessage.objectAfterState;
  }

  private generateNewIds(object: TObjectType) {
    // We'll tell model how to use the `newId()` function. Hopefully this makes it work better.
    const newIdForNum = new Map<number, string>();
    const generateReplacement = (numString: string) => {
      const num = Number(numString);
      if (Number.isNaN(num)) {
        throw new Error(); // Should make a specific error class for this
      }

      const id = newIdForNum.getOrInsert(num, newId());
      return id;
    };

    const stringObject = JSON.stringify(object);
    const replaced = stringObject.replaceAll(/newId\([0-9]+\)/, (m, g1) => generateReplacement(g1));
    return replaced;
  }
}
