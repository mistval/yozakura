import { useCallback, useRef, useState } from 'react';
import { detectCharacterCardMetadata } from '../engine/character_card_metadata.js';
import {
  buildImportedCardCharacter,
  getImportedCardName,
  type CardImportMode,
} from '../engine/character_gen.js';
import { useGlobalCharactersStore } from '../state/global_character_store.js';
import { getErrorMessage } from '../errors/error_util.js';

export type BulkImportItemStatus = 'pending' | 'importing' | 'done' | 'skipped' | 'failed' | 'cancelled';

export type BulkImportItem = {
  id: string;
  fileName: string;
  characterName: string | undefined;
  status: BulkImportItemStatus;
  step: string | undefined;
  detail: string | undefined;
};

export type BulkImportPhase = 'idle' | 'running' | 'cancelling' | 'done';

export type BulkImportRunOptions = {
  files: File[];
  mode: CardImportMode;
  batchSize: number;
  skipExisting: boolean;
};

function nameKey(firstName: string, lastName: string): string {
  return [firstName, lastName].filter(Boolean).join(' ').trim().toLowerCase();
}

function displayName(firstName: string, lastName: string): string {
  return [firstName, lastName].filter(Boolean).join(' ').trim();
}

function isAbortError(error: unknown): boolean {
  return error instanceof DOMException && error.name === 'AbortError';
}

export function useBulkCharacterImport() {
  const [items, setItems] = useState<BulkImportItem[]>([]);
  const [phase, setPhase] = useState<BulkImportPhase>('idle');
  const cancelledRef = useRef(false);
  const controllerRef = useRef<AbortController | null>(null);

  const reset = useCallback(() => {
    cancelledRef.current = false;
    setItems([]);
    setPhase('idle');
  }, []);

  const cancel = useCallback(() => {
    cancelledRef.current = true;
    controllerRef.current?.abort();
    setPhase((prev) => (prev === 'running' ? 'cancelling' : prev));
    setItems((prev) =>
      prev.map((item) => (item.status === 'pending' ? { ...item, status: 'cancelled' } : item))
    );
  }, []);

  const run = useCallback(async ({ files, mode, batchSize, skipExisting }: BulkImportRunOptions) => {
    cancelledRef.current = false;
    const controller = new AbortController();
    controllerRef.current = controller;
    setPhase('running');

    const updateItem = (id: string, patch: Partial<BulkImportItem>) => {
      setItems((prev) => prev.map((item) => (item.id === id ? { ...item, ...patch } : item)));
    };

    const initialItems: BulkImportItem[] = files.map((file, index) => ({
      id: `${index}-${file.name}`,
      fileName: file.name,
      status: 'pending',
      characterName: undefined,
      step: undefined,
      detail: undefined,
    }));

    setItems(initialItems);

    const usedNameKeys = new Set(
      useGlobalCharactersStore
        .getState()
        .globalCharacters.map((character) => nameKey(character.firstName, character.lastName))
    );

    const importFile = async (file: File, index: number) => {
      const id = `${index}-${file.name}`;

      if (cancelledRef.current) {
        updateItem(id, { status: 'cancelled' });
        return;
      }

      updateItem(id, { status: 'importing' });

      try {
        const detected = await detectCharacterCardMetadata(file);
        const name = getImportedCardName(detected);

        if (!name) {
          updateItem(id, { status: 'failed', detail: 'No character data found in this image.' });
          return;
        }

        const key = nameKey(name.firstName, name.lastName);
        const shownName = displayName(name.firstName, name.lastName);
        updateItem(id, { characterName: shownName });

        if (skipExisting && usedNameKeys.has(key)) {
          updateItem(id, { status: 'skipped', detail: 'A character with this name already exists.' });
          return;
        }

        const character = await buildImportedCardCharacter(detected, mode, {
          abortSignal: controller.signal,
          onStep: (step) => updateItem(id, { step }),
        });

        if (!character) {
          updateItem(id, { status: 'failed', detail: 'Could not build a character from this card.' });
          return;
        }

        await useGlobalCharactersStore.getState().saveGlobalCharacter(character, file);
        usedNameKeys.add(key);

        updateItem(id, { status: 'done', characterName: shownName, step: undefined });
      } catch (error) {
        if (cancelledRef.current || isAbortError(error)) {
          updateItem(id, { status: 'cancelled', step: undefined });
        } else {
          updateItem(id, { status: 'failed', detail: getErrorMessage(error), step: undefined });
          cancel();
        }
      }
    };

    await runConcurrent(files, mode === 'convert' ? batchSize : 1, importFile, () => cancelledRef.current);

    setItems((prev) =>
      prev.map((item) => (item.status === 'pending' ? { ...item, status: 'cancelled' } : item))
    );

    setPhase('done');
  }, []);

  return { items, phase, run, cancel, reset };
}

async function runConcurrent<T>(
  items: T[],
  concurrency: number,
  worker: (item: T, index: number) => Promise<void>,
  shouldStop: () => boolean
): Promise<void> {
  let cursor = 0;
  const effectiveConcurrency = Math.max(1, Math.min(concurrency, items.length));

  const runWorker = async (): Promise<void> => {
    while (true) {
      if (shouldStop()) {
        return;
      }

      const index = cursor;
      cursor += 1;
      if (index >= items.length) {
        return;
      }

      await worker(items[index]!, index);
    }
  };

  await Promise.all(Array.from({ length: effectiveConcurrency }, () => runWorker()));
}
