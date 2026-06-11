import Modal from '../ui/Modal';
import { useCharacterEditorModal } from './CharacterEditorModalContext';

export default function CharacterCardImportModal({ zIndex }: { zIndex?: number } = {}) {
  const {
    pendingCardImport,
    cardImportBusy,
    closePendingImport,
    useImageOnlyFromImport,
    importYozakuraFields,
    extractSillyTavern,
    rawImportSillyTavern,
  } = useCharacterEditorModal();

  const open = Boolean(pendingCardImport);
  const isSillyTavern = pendingCardImport?.kind === 'sillytavern';

  return (
    <Modal
      open={open}
      onClose={closePendingImport}
      closeOnBackdropClick={!cardImportBusy}
      className="flex items-center justify-center p-4"
      {...(zIndex !== undefined && { zIndex })}
    >
      <div className="bg-emphasized rounded-sm p-4 w-full max-w-xl space-y-3">
        <h3 className="font-semibold">
          {isSillyTavern ? 'SillyTavern Card Detected' : 'Yozakura Card Detected'}
        </h3>

        {isSillyTavern ? (
          <p className="text-sm text-secondary-strong">
            Detected SillyTavern metadata. We can attempt to use your LLM to rewrite it to work better in
            Yozakura, or we can just import the raw character fields as they are. Which would you prefer?
          </p>
        ) : (
          <p className="text-sm text-secondary-strong">
            This image contains Yozakura character metadata. Do you want to import the character from the
            card, or just use the image?
          </p>
        )}

        <div className="flex flex-col gap-2">
          {isSillyTavern ? (
            <>
              <button type="button" onClick={extractSillyTavern} disabled={cardImportBusy} className="w-full">
                {cardImportBusy ? 'Converting...' : 'Convert for Yozakura'}
              </button>
              <button
                type="button"
                onClick={rawImportSillyTavern}
                disabled={cardImportBusy}
                className="w-full"
              >
                Raw Import
              </button>
            </>
          ) : (
            <button type="button" onClick={importYozakuraFields} disabled={cardImportBusy} className="w-full">
              Import Character
            </button>
          )}
          <button type="button" onClick={useImageOnlyFromImport} disabled={cardImportBusy} className="w-full">
            Use Image Only
          </button>
          <button type="button" onClick={closePendingImport} disabled={cardImportBusy} className="w-full">
            Cancel
          </button>
        </div>
      </div>
    </Modal>
  );
}
