import { createContext, useContext, useEffect, useMemo, useRef, useState } from 'react';
import { useStateRef } from '../../hooks/useStateRef.js';
import {
  applySillyTavernRawImport,
  buildCharacterCardExportFilename,
  buildYozakuraCardExportBytes,
  buildSillyTavernExtractionCharacter,
  createBlankCharacter,
  extractCharacterCard,
  generateBaseAppearanceTags,
  generateCharacterInternalDescription,
  generateCharacterExternalDescription,
  generateExampleDialogue,
  generateWardrobe,
  mergeYozakuraCardIntoCharacter,
} from '../../engine/character_gen';
import { detectCharacterCardMetadata } from '../../engine/character_card_metadata';
import { createWardrobe } from '../../engine/wardrobes.js';
import type { Character } from '../../engine/types';
import { assertNonNullish } from '../../errors/application_error';
import { getErrorMessage } from '../../errors/error_util';
import { useScenarioCharacterStore } from '../../state/scenario_character_store.js';
import type { CharacterEditorModalProps, PendingCardImport } from './types';
import { generateCharacterCard } from '../../engine/image_gen';
import { useGlobalCharactersStore } from '../../state/global_character_store.js';

type CharacterEditorModalContextValue = {
  open: boolean;
  isBusy: boolean;
  canDelete: boolean;
  hasAllRequiredFields: boolean;
  isGlobalMode: boolean;
  isNew: boolean;
  deleteConfirmationMessage: string;
  loadingField: string;
  loadingButton: string;
  cardImportBusy: boolean;
  error: string;
  character: Character;
  currentImagePath?: string | undefined;
  currentImageSrc: string;
  fileInputRef: React.RefObject<HTMLInputElement | null>;
  selectedImageFile?: File | undefined;
  pendingCardImport?: PendingCardImport | undefined;
  closeEditor: () => void;
  setCharacterField: <K extends keyof Character>(key: K, value: Character[K]) => void;
  generateInternalDescription: () => Promise<void>;
  generateExternalDescription: () => Promise<void>;
  extractFromDescription: () => Promise<void>;
  generateExampleDialogue: () => Promise<void>;
  generateBaseAppearance: () => Promise<void>;
  generateWardrobeAt: (index: number) => Promise<void>;
  generateImage: () => Promise<void>;
  exportCard: () => Promise<void>;
  save: () => Promise<void>;
  remove: () => Promise<void>;
  handleUploadedCardFile: (file: File) => Promise<void>;
  closePendingImport: () => void;
  useImageOnlyFromImport: () => void;
  importYozakuraFields: () => void;
  extractSillyTavern: () => Promise<void>;
  rawImportSillyTavern: () => void;
};

const CharacterEditorModalContext = createContext<CharacterEditorModalContextValue | undefined>(undefined);

export function useCharacterEditorModal() {
  const context = useContext(CharacterEditorModalContext);
  if (!context) {
    throw new Error('useCharacterEditorModal must be used within CharacterEditorModalProvider');
  }
  return context;
}

export function CharacterEditorModalProvider({
  open,
  characterId,
  onClose,
  children,
}: CharacterEditorModalProps & { children: React.ReactNode }) {
  const saveScenarioCharacter = useScenarioCharacterStore((state) => state.saveScenarioCharacter);
  const removeScenarioCharacter = useScenarioCharacterStore((state) => state.removeScenarioCharacter);
  const getScenarioCharacterById = useScenarioCharacterStore((state) => state.getCharacterById);

  const isGlobalMode = !characterId || !getScenarioCharacterById(characterId);
  const isNew = !characterId;

  if (isNew && !isGlobalMode) {
    throw new Error('Creating new characters directly into a scenario is not supported.');
  }

  const { globalCharactersAreLoaded, globalCharactersById } = useGlobalCharactersStore();
  const { scenarioCharactersAreLoaded, scenarioCharactersById } = useScenarioCharacterStore();
  const [character, setCharacter] = useState<Character>(createBlankCharacter());
  const [loadingField, setLoadingField] = useState<string>('');
  const [loadingButton, setLoadingButton] = useState<string>('');
  const [error, setError] = useState<string>('');
  const [imageRefreshKey, setImageRefreshKey] = useState<number>(Date.now());
  const [selectedImageFile, setSelectedImageFile] = useState<File | undefined>(undefined);
  const [previewUrl, setPreviewUrl] = useState<string | undefined>(undefined);
  const [pendingCardImport, setPendingCardImport] = useState<PendingCardImport | undefined>(undefined);
  const [cardImportBusy, setCardImportBusy, cardImportBusyRef] = useStateRef(false);
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  const isBusy = Boolean(loadingField) || cardImportBusy;
  const currentImagePath = character.imagePath?.trim();
  const currentImageSrc = previewUrl
    ? previewUrl
    : currentImagePath
      ? `${currentImagePath}?v=${imageRefreshKey}`
      : '/images/character/default_character.png';

  useEffect(() => {
    return () => {
      if (previewUrl) {
        try {
          URL.revokeObjectURL(previewUrl);
        } catch {
          // ignore
        }
      }
    };
  }, [previewUrl]);

  useEffect(() => {
    setError('');
    setSelectedImageFile(undefined);
    setPreviewUrl(undefined);
    setPendingCardImport(undefined);
    setCardImportBusy(false);
    setImageRefreshKey(Date.now());

    if (isNew) {
      return;
    }

    if (isGlobalMode) {
      if (!globalCharactersAreLoaded) {
        return;
      }

      const character = globalCharactersById[characterId];
      if (character) {
        setCharacter(character);
      }
    }
  }, [characterId, isGlobalMode, isNew, globalCharactersAreLoaded]);

  useEffect(() => {
    setError('');
    setSelectedImageFile(undefined);
    setPreviewUrl(undefined);
    setPendingCardImport(undefined);
    setCardImportBusy(false);
    setImageRefreshKey(Date.now());

    if (isNew) {
      return;
    }

    if (!isGlobalMode) {
      if (!scenarioCharactersAreLoaded) {
        return;
      }

      const character = scenarioCharactersById[characterId];
      if (character) {
        setCharacter(character);
      }
    }
  }, [characterId, isGlobalMode, isNew, scenarioCharactersAreLoaded]);

  const setCharacterField = <K extends keyof Character>(key: K, value: Character[K]) => {
    setCharacter(
      (prev) =>
        ({
          ...prev,
          [key]: value,
        }) satisfies typeof prev
    );
  };

  const runWithField = async (field: string, fn: () => Promise<void>, button: string = '') => {
    setLoadingField(field);
    setLoadingButton(button);
    setError('');
    try {
      await fn();
    } catch (err) {
      setError(getErrorMessage(err));
    } finally {
      setLoadingField('');
      setLoadingButton('');
    }
  };

  const applySelectedImageFile = (file: File) => {
    setSelectedImageFile(file);
    setPreviewUrl((previous) => {
      if (previous) {
        try {
          URL.revokeObjectURL(previous);
        } catch {
          // ignore
        }
      }
      return URL.createObjectURL(file);
    });
    setImageRefreshKey(Date.now());
  };

  const closeEditor = () => onClose();

  const generateInternalDescriptionField = async () => {
    await runWithField(
      'internalDescription',
      async () => {
        setCharacterField('internalDescription', await generateCharacterInternalDescription(character));
      },
      'generateInternalDescription'
    );
  };

  const generateExternalDescriptionField = async () => {
    await runWithField(
      'externalDescription',
      async () => {
        setCharacterField('externalDescription', await generateCharacterExternalDescription(character));
      },
      'generateExternalDescription'
    );
  };

  const extractFromDescription = async () => {
    await runWithField(
      'internalDescription',
      async () => {
        await extractCharacterCard(character, setCharacterField);
      },
      'extractDescription'
    );
  };

  const generateExampleDialogueField = async () => {
    await runWithField(
      'exampleDialogue',
      async () => {
        setCharacterField('exampleDialogue', await generateExampleDialogue(character));
      },
      'generatingExampleDialog'
    );
  };

  const generateBaseAppearanceField = async () => {
    await runWithField(
      'baseAppearanceTags',
      async () => setCharacterField('baseAppearanceTags', await generateBaseAppearanceTags(character)),
      'generateBaseAppearance'
    );
  };

  const generateWardrobeFieldAt = async (index: number) => {
    await runWithField(
      `wardrobeTags-${index}`,
      async () => {
        const generated = await generateWardrobe(character);
        const newWardrobes = character.wardrobes.concat();

        if (index < newWardrobes.length) {
          assertNonNullish(newWardrobes[index], `Expected wardrobe at index ${index} to exist`);

          newWardrobes[index] = {
            ...newWardrobes[index],
            text: generated,
          };
        } else {
          newWardrobes.push(createWardrobe(generated, index === 0 ? 'default' : ''));
        }

        setCharacterField('wardrobes', newWardrobes);
      },
      `generatingWardrobeTags-${index}`
    );
  };

  const generateImageField = async () => {
    await runWithField(
      'image',
      async () => {
        const generatedImageDataUrl = await generateCharacterCard(character);
        const generatedImageBlob = await fetch(generatedImageDataUrl).then((response) => response.blob());
        const generatedImageFile = new File([generatedImageBlob], 'generated_character.png', {
          type: generatedImageBlob.type || 'image/png',
        });

        applySelectedImageFile(generatedImageFile);
      },
      'generateImage'
    );
  };

  const exportCard = async () => {
    const sourceBytes = selectedImageFile
      ? new Uint8Array(await selectedImageFile.arrayBuffer())
      : currentImagePath
        ? await (async () => {
            const response = await fetch(`${currentImagePath}?v=${Date.now()}`);
            if (!response.ok) {
              throw new Error('No existing character card image was found to export.');
            }
            return new Uint8Array(await response.arrayBuffer());
          })()
        : undefined;

    assertNonNullish(sourceBytes, 'Null image export');

    const outputBytes = buildYozakuraCardExportBytes(character, sourceBytes);
    const blob = new Blob([outputBytes], { type: 'image/png' });
    const downloadUrl = URL.createObjectURL(blob);

    const link = document.createElement('a');
    link.href = downloadUrl;
    link.download = buildCharacterCardExportFilename(character);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);

    setTimeout(() => {
      try {
        URL.revokeObjectURL(downloadUrl);
      } catch {
        // ignore
      }
    }, 0);
  };

  const save = async () => {
    const sanitizedCharacter = {
      ...character,
      firstName: character.firstName.trim(),
      lastName: character.lastName.trim(),
    };

    await runWithField('save', async () => {
      if (isGlobalMode) {
        await useGlobalCharactersStore.getState().saveGlobalCharacter(sanitizedCharacter, selectedImageFile);
      } else {
        await saveScenarioCharacter(sanitizedCharacter, selectedImageFile);
      }

      onClose();
    });
  };

  const remove = async () => {
    await runWithField('delete', async () => {
      if (isGlobalMode) {
        await useGlobalCharactersStore.getState().deleteGlobalCharacter(character);
      } else {
        await removeScenarioCharacter(character.id);
        // We leave the image since chat logs still reference it. Will be deleted when/if the scenario gets deleted.
      }

      onClose();
    });
  };

  const handleUploadedCardFile = async (file: File) => {
    if (cardImportBusyRef.current) return;
    setError('');
    setCardImportBusy(true);

    try {
      const detected = await detectCharacterCardMetadata(file);
      if (detected.kind === 'none') {
        applySelectedImageFile(file);
        return;
      }

      if (detected.kind === 'yozakura') {
        setPendingCardImport({
          kind: 'yozakura',
          file,
          payload: detected.payload,
        });
        return;
      }

      setPendingCardImport({
        kind: 'sillytavern',
        file,
        payload: detected.payload,
      });
    } catch (err) {
      applySelectedImageFile(file);
      setError(`Could not inspect card metadata. Using image only. (${getErrorMessage(err)})`);
    } finally {
      setCardImportBusy(false);
    }
  };

  const closePendingImport = () => {
    if (cardImportBusy) {
      return;
    }

    setPendingCardImport(undefined);
  };

  const useImageOnlyFromImport = () => {
    if (!pendingCardImport) {
      return;
    }

    applySelectedImageFile(pendingCardImport.file);
    setPendingCardImport(undefined);
  };

  const importYozakuraFields = () => {
    if (!pendingCardImport || pendingCardImport.kind !== 'yozakura') {
      return;
    }

    applySelectedImageFile(pendingCardImport.file);
    setCharacter((previous) => mergeYozakuraCardIntoCharacter(previous, pendingCardImport.payload));
    setPendingCardImport(undefined);
  };

  const extractSillyTavern = async () => {
    if (!pendingCardImport || pendingCardImport.kind !== 'sillytavern') {
      return;
    }

    if (cardImportBusyRef.current) return;

    setError('');
    setCardImportBusy(true);

    try {
      applySelectedImageFile(pendingCardImport.file);
      const extractionCharacter = buildSillyTavernExtractionCharacter(character, pendingCardImport.payload);
      setCharacter(extractionCharacter);
      await extractCharacterCard(extractionCharacter, setCharacterField);

      setPendingCardImport(undefined);
    } catch (err) {
      setError(getErrorMessage(err));
    } finally {
      setCardImportBusy(false);
    }
  };

  const rawImportSillyTavern = () => {
    if (!pendingCardImport || pendingCardImport.kind !== 'sillytavern') {
      return;
    }

    if (cardImportBusyRef.current) return;

    setError('');
    applySelectedImageFile(pendingCardImport.file);
    setCharacter((previous) => applySillyTavernRawImport(previous, pendingCardImport.payload));
    setPendingCardImport(undefined);
  };

  const canDelete = !isGlobalMode || !isNew;
  const deleteConfirmationMessage = isGlobalMode
    ? 'Delete this character from the character list? This action cannot be undone.'
    : 'Remove this character from the current scenario? Global character data will not be affected outside of this scenario.';

  const hasAllRequiredFields = useMemo(() => {
    const requiredStrings = ['firstName', 'internalDescription'] as const satisfies Array<keyof Character>;

    for (const k of requiredStrings) {
      if (!character[k]?.trim()) {
        return false;
      }
    }

    return true;
  }, [character, isBusy]);

  const value: CharacterEditorModalContextValue = {
    open,
    isGlobalMode,
    isNew,
    isBusy,
    canDelete,
    hasAllRequiredFields,
    deleteConfirmationMessage,
    loadingField,
    loadingButton,
    cardImportBusy,
    error,
    character,
    selectedImageFile,
    currentImagePath,
    currentImageSrc,
    fileInputRef,
    pendingCardImport,
    closeEditor,
    setCharacterField,
    generateInternalDescription: generateInternalDescriptionField,
    generateExternalDescription: generateExternalDescriptionField,
    extractFromDescription,
    generateExampleDialogue: generateExampleDialogueField,
    generateBaseAppearance: generateBaseAppearanceField,
    generateWardrobeAt: generateWardrobeFieldAt,
    generateImage: generateImageField,
    exportCard,
    save,
    remove,
    handleUploadedCardFile,
    closePendingImport,
    useImageOnlyFromImport,
    importYozakuraFields: importYozakuraFields,
    extractSillyTavern,
    rawImportSillyTavern,
  };

  return (
    <CharacterEditorModalContext.Provider value={value}>{children}</CharacterEditorModalContext.Provider>
  );
}
