import { useState } from 'react';
import { useCharacterEditorModal } from './CharacterEditorModalContext.js';
import ConfirmDialog from '../ui/ConfirmDialog.js';

export default function FooterSection() {
  const { hasAllRequiredFields, isBusy, isGlobalMode, save, saveToGlobal } = useCharacterEditorModal();
  const [confirmOpen, setConfirmOpen] = useState(false);

  return (
    <>
      <div className="flex gap-2 items-center">
        {!isGlobalMode && (
          <button
            type="button"
            className="mt-5 w-full h-20 text-2xl font-bold disabled:bg-muted flex justify-center items-center"
            onClick={() => {
              setConfirmOpen(true);
            }}
            disabled={!hasAllRequiredFields || isBusy}
            title={
              !hasAllRequiredFields ? 'You must provide at least First Name and Internal Description' : ''
            }
          >
            Save to Global Library
          </button>
        )}
        <button
          type="button"
          className="mt-5 w-full h-20 text-4xl font-bold disabled:bg-muted flex justify-center items-center"
          onClick={() => {
            void save();
          }}
          disabled={!hasAllRequiredFields || isBusy}
          title={!hasAllRequiredFields ? 'You must provide at least First Name and Internal Description' : ''}
        >
          Save
        </button>
      </div>

      {!isGlobalMode && (
        <ConfirmDialog
          open={confirmOpen}
          title="Save to Global Library"
          message="Save this character to the Global Character library? If a corresponding global character exists, it will be overwritten."
          confirmLabel="Save to Global"
          confirmDisabled={isBusy}
          onConfirm={() => {
            setConfirmOpen(false);
            void saveToGlobal();
          }}
          onClose={() => setConfirmOpen(false)}
        />
      )}
    </>
  );
}
