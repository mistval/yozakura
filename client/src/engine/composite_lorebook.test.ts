import { describe, expect, it } from 'vitest';
import { CompositeLorebook } from './composite_lorebook';
import { Lorebook } from './lorebook';
import type { SerializedLorebook, SerializedLorebookEntry } from './lorebook_schema';

function serializedEntry(
  id: string,
  primaryTrigger: string,
  overrides: Partial<SerializedLorebookEntry> = {}
): SerializedLorebookEntry {
  return {
    id,
    title: id,
    primaryTriggers: [primaryTrigger],
    staticContent: '',
    dynamicContent: '',
    stickyDuration: 0,
    canBeRecursivelyActivated: true,
    canActivateFurtherEntries: true,
    ...overrides,
  };
}

function lorebook(
  id: string,
  entries: SerializedLorebookEntry[],
  overrides: Partial<SerializedLorebook> = {}
): Lorebook {
  return new Lorebook({
    id,
    title: id,
    entries,
    insertionLimit: -1,
    exemptFromGlobalInsertionLimit: false,
    newEntryInstructions: '',
    ...overrides,
  });
}

function composite(lorebooks: Lorebook[]): CompositeLorebook {
  return new CompositeLorebook(lorebooks, { globalInsertionLimit: -1 });
}

function matchIds(compositeLorebook: CompositeLorebook, text: string): string[] {
  return compositeLorebook.match(text).map((match) => match.entry.id);
}

describe('CompositeLorebook', () => {
  it('returns all direct matches in lorebook and entry order', () => {
    const first = lorebook('first-book', [
      serializedEntry('first-entry', 'start'),
      serializedEntry('second-entry', '/sta.t/i'),
    ]);
    const second = lorebook('second-book', [serializedEntry('third-entry', 'start')]);

    expect(matchIds(composite([first, second]), 'Start here')).toEqual([
      'first-entry',
      'second-entry',
      'third-entry',
    ]);
  });

  it('follows a recursive activation chain', () => {
    const book = lorebook('book', [
      serializedEntry('first', 'start', { staticContent: 'second' }),
      serializedEntry('second', 'second', { dynamicContent: 'third' }),
      serializedEntry('third', 'third'),
    ]);

    expect(matchIds(composite([book]), 'start')).toEqual(['first', 'second', 'third']);
  });

  it('does not recursively activate an entry that excludes recursive activation', () => {
    const book = lorebook('book', [
      serializedEntry('first', 'start', { staticContent: 'second' }),
      serializedEntry('second', 'second', { canBeRecursivelyActivated: false }),
    ]);
    const compositeLorebook = composite([book]);

    expect(matchIds(compositeLorebook, 'start')).toEqual(['first']);
    expect(matchIds(compositeLorebook, 'second')).toEqual(['second']);
  });

  it('stops recursion after an entry that prevents further activation', () => {
    const book = lorebook('book', [
      serializedEntry('first', 'start', { staticContent: 'second' }),
      serializedEntry('second', 'second', {
        staticContent: 'third',
        canActivateFurtherEntries: false,
      }),
      serializedEntry('third', 'third'),
    ]);

    expect(matchIds(composite([book]), 'start')).toEqual(['first', 'second']);
  });

  it('terminates cycles and returns each entry once', () => {
    const book = lorebook('book', [
      serializedEntry('alpha', 'alpha', { staticContent: 'beta' }),
      serializedEntry('beta', 'beta', { staticContent: 'alpha' }),
    ]);

    expect(matchIds(composite([book, book]), 'alpha')).toEqual(['alpha', 'beta']);
  });

  it('puts direct matches before recursive matches and preserves discovery order', () => {
    const book = lorebook('book', [
      serializedEntry('direct-1', 'start', { staticContent: 'recursive' }),
      serializedEntry('direct-2', 'start', { staticContent: 'recursive' }),
      serializedEntry('recursive-1', 'recursive'),
      serializedEntry('recursive-2', 'recursive'),
    ]);

    expect(matchIds(composite([book]), 'start')).toEqual([
      'direct-1',
      'direct-2',
      'recursive-1',
      'recursive-2',
    ]);
  });

  it('validates global settings', () => {
    expect(() => new CompositeLorebook([], { globalInsertionLimit: -2 })).toThrow();
    expect(() => new CompositeLorebook([], { globalInsertionLimit: 1.5 })).toThrow();
  });
});
