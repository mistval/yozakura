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

  const run = useCallback(async ({ files, mode, skipExisting }: BulkImportRunOptions) => {
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

    const detectedFiles = await Promise.all(
      files.map(async (file, index) => ({
        file,
        index,
        detected: await detectCharacterCardMetadata(file),
      }))
    );

    const importTasks = detectedFiles.map(async ({ file, index, detected }) => {
      const id = `${index}-${file.name}`;

      if (cancelledRef.current) {
        updateItem(id, { status: 'cancelled' });
        return;
      }

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

      usedNameKeys.add(key);

      if (detected.kind === 'yozakura' || mode === 'raw') {
        updateItem(id, { status: 'importing' });
      }

      try {
        const character = await buildImportedCardCharacter(detected, mode, {
          abortSignal: controller.signal,
          onStep: (step) => updateItem(id, { status: 'importing', step }),
        });

        if (!character) {
          usedNameKeys.delete(key);
          updateItem(id, { status: 'failed', detail: 'Could not build a character from this card.' });
          return;
        }

        await useGlobalCharactersStore.getState().saveGlobalCharacter(character, file);

        updateItem(id, { status: 'done', characterName: shownName, step: undefined });
      } catch (error) {
        usedNameKeys.delete(key);
        if (cancelledRef.current || isAbortError(error)) {
          updateItem(id, { status: 'cancelled', step: undefined });
        } else {
          updateItem(id, { status: 'failed', detail: getErrorMessage(error), step: undefined });
          cancel();
        }
      }
    });

    await Promise.all(importTasks);

    setItems((prev) =>
      prev.map((item) => (item.status === 'pending' ? { ...item, status: 'cancelled' } : item))
    );

    setPhase('done');
  }, []);

  return { items, phase, run, cancel, reset };
}
