import { describe, expect, it } from 'vitest';
import { Lorebook, LorebookEntry } from './lorebook';
import type { SerializedLorebook, SerializedLorebookEntry } from './lorebook_schema';

function serializedEntry(overrides: Partial<SerializedLorebookEntry> = {}): SerializedLorebookEntry {
  return {
    id: 'entry-1',
    title: 'Entry title',
    primaryTriggers: ['trigger'],
    staticContent: 'Static content',
    dynamicContent: 'Dynamic content',
    stickyDuration: 0,
    canBeRecursivelyActivated: true,
    canActivateFurtherEntries: true,
    ...overrides,
  };
}

function serializedLorebook(overrides: Partial<SerializedLorebook> = {}): SerializedLorebook {
  return {
    id: 'lorebook-1',
    title: 'Lorebook title',
    entries: [serializedEntry()],
    insertionLimit: -1,
    exemptFromGlobalInsertionLimit: false,
    newEntryInstructions: '',
    ...overrides,
  };
}

describe('Lorebook', () => {
  it('constructs entry instances and serializes back to the same data', () => {
    const serialized = serializedLorebook();
    const lorebook = new Lorebook(serialized);

    expect(lorebook.entries[0]).toBeInstanceOf(LorebookEntry);
    expect(lorebook.serialize()).toEqual(serialized);
    expect(new Lorebook(lorebook.serialize()).serialize()).toEqual(serialized);
  });

  it('allows an entry with no triggers', () => {
    const lorebook = new Lorebook(
      serializedLorebook({ entries: [serializedEntry({ primaryTriggers: [] })] })
    );

    expect(lorebook.entries[0]!.matches('anything')).toBe(false);
  });

  it('rejects empty and invalid regex triggers', () => {
    expect(
      () => new Lorebook(serializedLorebook({ entries: [serializedEntry({ primaryTriggers: ['  '] })] }))
    ).toThrow();
    expect(
      () => new Lorebook(serializedLorebook({ entries: [serializedEntry({ primaryTriggers: ['/[a-/'] })] }))
    ).toThrow(/Invalid regular expression/);
    expect(
      () => new Lorebook(serializedLorebook({ entries: [serializedEntry({ primaryTriggers: ['/dog/z'] })] }))
    ).toThrow(/Invalid regular expression/);
  });

  it('rejects invalid sticky durations and insertion limits', () => {
    expect(
      () => new Lorebook(serializedLorebook({ entries: [serializedEntry({ stickyDuration: -1 })] }))
    ).toThrow();
    expect(() => new Lorebook(serializedLorebook({ insertionLimit: -2 }))).toThrow();
    expect(() => new Lorebook(serializedLorebook({ insertionLimit: 1.5 }))).toThrow();
  });
});

describe('LorebookEntry matching', () => {
  it('matches ordinary phrases case-insensitively at whole-word boundaries', () => {
    const [entry] = new Lorebook(
      serializedLorebook({
        entries: [serializedEntry({ primaryTriggers: ['dog', 'magic academy'] })],
      })
    ).entries;

    expect(entry!.matches('The DOG barked.')).toBe(true);
    expect(entry!.matches('She attends the Magic Academy.')).toBe(true);
    expect(entry!.matches('He dodged the question.')).toBe(false);
  });

  it('leaves case sensitivity and word boundaries up to regex triggers', () => {
    const caseInsensitive = new LorebookEntry(serializedEntry({ primaryTriggers: ['/dog/i'] }));
    const noImplicitWordBoundary = new LorebookEntry(serializedEntry({ primaryTriggers: ['/dog/'] }));

    expect(caseInsensitive.matches('DOG')).toBe(true);
    expect(noImplicitWordBoundary.matches('hotdog')).toBe(true);
    expect(noImplicitWordBoundary.matches('DOG')).toBe(false);
  });

  it('includes title, static content, and dynamic content in recursive scan text', () => {
    const entry = new LorebookEntry(
      serializedEntry({
        title: 'Title',
        staticContent: 'Static',
        dynamicContent: 'Dynamic',
      })
    );

    expect(entry.getRecursiveScanText()).toBe('Title\nStatic\nDynamic');
  });
});
