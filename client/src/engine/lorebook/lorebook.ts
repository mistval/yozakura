import {
  parseLorebookTrigger,
  serializedLorebookSchema,
  type ParsedLorebookTrigger,
  type SerializedLorebook,
  type SerializedLorebookEntry,
} from './lorebook_schema';

function escapeRegularExpression(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function matchesWholePhrase(text: string, phrase: string): boolean {
  const escapedPhrase = escapeRegularExpression(phrase);
  const wordCharacter = '[\\p{L}\\p{N}_]';
  return new RegExp(`(?<!${wordCharacter})${escapedPhrase}(?!${wordCharacter})`, 'iu').test(text);
}

function triggerMatches(text: string, trigger: ParsedLorebookTrigger): boolean {
  if (trigger.type === 'phrase') {
    return matchesWholePhrase(text, trigger.phrase);
  }

  return new RegExp(trigger.source, trigger.flags).test(text);
}

export class LorebookEntry {
  public readonly id: string;
  public readonly title: string;
  public readonly primaryTriggers: readonly string[];
  public readonly staticContent: string;
  public readonly dynamicContent: string;
  public readonly stickyDuration: number;
  public readonly canBeRecursivelyActivated: boolean;
  public readonly canActivateFurtherEntries: boolean;

  private readonly parsedPrimaryTriggers: readonly ParsedLorebookTrigger[];

  public constructor(serialized: SerializedLorebookEntry) {
    this.id = serialized.id;
    this.title = serialized.title;
    this.primaryTriggers = serialized.primaryTriggers;
    this.staticContent = serialized.staticContent;
    this.dynamicContent = serialized.dynamicContent;
    this.stickyDuration = serialized.stickyDuration;
    this.canBeRecursivelyActivated = serialized.canBeRecursivelyActivated;
    this.canActivateFurtherEntries = serialized.canActivateFurtherEntries;
    this.parsedPrimaryTriggers = serialized.primaryTriggers.map(parseLorebookTrigger);
  }

  public matches(text: string): boolean {
    return this.parsedPrimaryTriggers.some((trigger) => triggerMatches(text, trigger));
  }

  public getRecursiveScanText(): string {
    return [this.title, this.staticContent, this.dynamicContent].join('\n');
  }

  public serialize(): SerializedLorebookEntry {
    return {
      id: this.id,
      title: this.title,
      primaryTriggers: [...this.primaryTriggers],
      staticContent: this.staticContent,
      dynamicContent: this.dynamicContent,
      stickyDuration: this.stickyDuration,
      canBeRecursivelyActivated: this.canBeRecursivelyActivated,
      canActivateFurtherEntries: this.canActivateFurtherEntries,
    };
  }
}

export class Lorebook {
  public readonly id: string;
  public readonly title: string;
  public readonly entries: readonly LorebookEntry[];
  public readonly insertionLimit: number;
  public readonly exemptFromGlobalInsertionLimit: boolean;
  public readonly newEntryInstructions: string;

  public constructor(serialized: unknown) {
    const validated = serializedLorebookSchema.parse(serialized);

    this.id = validated.id;
    this.title = validated.title;
    this.entries = validated.entries.map((entry) => new LorebookEntry(entry));
    this.insertionLimit = validated.insertionLimit;
    this.exemptFromGlobalInsertionLimit = validated.exemptFromGlobalInsertionLimit;
    this.newEntryInstructions = validated.newEntryInstructions;
  }

  public serialize(): SerializedLorebook {
    return {
      id: this.id,
      title: this.title,
      entries: this.entries.map((entry) => entry.serialize()),
      insertionLimit: this.insertionLimit,
      exemptFromGlobalInsertionLimit: this.exemptFromGlobalInsertionLimit,
      newEntryInstructions: this.newEntryInstructions,
    };
  }
}
