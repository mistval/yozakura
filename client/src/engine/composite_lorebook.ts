import { Lorebook, type LorebookEntry } from './lorebook';
import { lorebookGlobalSettingsSchema, type LorebookGlobalSettings } from './lorebook_schema';

export type LorebookEntryMatch = {
  lorebook: Lorebook;
  entry: LorebookEntry;
};

export class CompositeLorebook {
  private readonly lorebooks: readonly Lorebook[];
  private readonly globalSettings: LorebookGlobalSettings;

  public constructor(lorebooks: readonly Lorebook[], globalSettings: LorebookGlobalSettings) {
    this.lorebooks = [...lorebooks];
    this.globalSettings = lorebookGlobalSettingsSchema.parse(globalSettings);
  }

  public match(text: string): LorebookEntryMatch[] {
    const allEntries = this.lorebooks.flatMap((lorebook) =>
      lorebook.entries.map((entry) => ({ lorebook, entry }))
    );
    const matchedEntryIds = new Set<string>();
    const matches: LorebookEntryMatch[] = [];

    for (const candidate of allEntries) {
      if (!matchedEntryIds.has(candidate.entry.id) && candidate.entry.matches(text)) {
        matchedEntryIds.add(candidate.entry.id);
        matches.push(candidate);
      }
    }

    for (let sourceIndex = 0; sourceIndex < matches.length; sourceIndex++) {
      const source = matches[sourceIndex]!;
      if (!source.entry.canActivateFurtherEntries) {
        continue;
      }

      const recursiveScanText = source.entry.getRecursiveScanText();
      for (const candidate of allEntries) {
        if (
          matchedEntryIds.has(candidate.entry.id) ||
          !candidate.entry.canBeRecursivelyActivated ||
          !candidate.entry.matches(recursiveScanText)
        ) {
          continue;
        }

        matchedEntryIds.add(candidate.entry.id);
        matches.push(candidate);
      }
    }

    return matches;
  }

  public selectActiveEntries(
    messageMatches: readonly (readonly LorebookEntryMatch[])[]
  ): LorebookEntryMatch[] {
    const candidates: LorebookEntryMatch[] = [];
    const seenEntryIds = new Set<string>();

    for (let messageIndex = messageMatches.length - 1; messageIndex >= 0; messageIndex--) {
      const stickySteps = messageMatches.length - 1 - messageIndex;
      for (const match of messageMatches[messageIndex]!) {
        if (seenEntryIds.has(match.entry.id)) {
          continue;
        }

        seenEntryIds.add(match.entry.id);
        if (stickySteps <= match.entry.stickyDuration) {
          candidates.push(match);
        }
      }
    }

    const withinLorebookLimits = this.applyLorebookInsertionLimits(candidates);
    return this.applyGlobalInsertionLimit(withinLorebookLimits);
  }

  private applyLorebookInsertionLimits(candidates: readonly LorebookEntryMatch[]): LorebookEntryMatch[] {
    const selected: LorebookEntryMatch[] = [];
    const selectedCountByLorebookId = new Map<string, number>();

    for (const candidate of candidates) {
      const selectedCount = selectedCountByLorebookId.get(candidate.lorebook.id) ?? 0;
      if (candidate.lorebook.insertionLimit !== -1 && selectedCount >= candidate.lorebook.insertionLimit) {
        continue;
      }

      selected.push(candidate);
      selectedCountByLorebookId.set(candidate.lorebook.id, selectedCount + 1);
    }

    return selected;
  }

  private applyGlobalInsertionLimit(candidates: readonly LorebookEntryMatch[]): LorebookEntryMatch[] {
    if (this.globalSettings.globalInsertionLimit === -1) {
      return [...candidates];
    }

    const selected: LorebookEntryMatch[] = [];
    let globalCount = 0;

    for (const candidate of candidates) {
      if (candidate.lorebook.exemptFromGlobalInsertionLimit) {
        selected.push(candidate);
      } else if (globalCount < this.globalSettings.globalInsertionLimit) {
        selected.push(candidate);
        globalCount++;
      }
    }

    return selected;
  }
}
