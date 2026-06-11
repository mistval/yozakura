import LoadingSpinner from '../ui/LoadingSpinner';
import { useCharacterEditorModal } from './CharacterEditorModalContext';

export default function CharacterCardSection() {
  const {
    character,
    loadingButton,
    isBusy,
    selectedImageFile,
    currentImagePath,
    currentImageSrc,
    fileInputRef,
    handleUploadedCardFile,
    generateImage,
    exportCard,
  } = useCharacterEditorModal();

  return (
    <div className="space-y-2">
      <div className="flex gap-3 items-center">
        <h3 className="text-base font-medium mb-1">Character Card</h3>
        {character.baseAppearanceTags && (
          <button
            type="button"
            disabled={isBusy}
            onClick={() => {
              void generateImage();
            }}
          >
            {loadingButton === 'generateImage' ? <LoadingSpinner label="Generating..." /> : 'Generate'}
          </button>
        )}
        {!(!selectedImageFile && !currentImagePath) && (
          <button
            type="button"
            onClick={() => {
              void exportCard();
            }}
            disabled={isBusy}
          >
            {loadingButton === 'exportCard' ? <LoadingSpinner label="Exporting..." /> : 'Export'}
          </button>
        )}
      </div>
      <img
        src={currentImageSrc}
        alt="Character card"
        className="w-52 min-h-52 border rounded-sm cursor-pointer"
        onClick={() => {
          if (isBusy) return;
          fileInputRef.current?.click();
        }}
      />
      <input
        type="file"
        accept="image/*"
        ref={fileInputRef}
        style={{ display: 'none' }}
        onChange={(event) => {
          const file = event.target.files && event.target.files[0];
          event.currentTarget.value = '';
          if (!file) return;
          void handleUploadedCardFile(file);
        }}
      />
    </div>
  );
}
