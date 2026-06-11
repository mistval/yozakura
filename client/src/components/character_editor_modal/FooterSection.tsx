import { useCharacterEditorModal } from './CharacterEditorModalContext';

export default function FooterSection() {
  const { hasAllRequiredFields, isBusy, save } = useCharacterEditorModal();

  return (
    <div className="flex gap-2 items-center">
      <button
        type="button"
        className=" mt-5 w-full h-20 text-4xl font-bold disabled:bg-muted flex justify-center items-center"
        onClick={() => {
          void save();
        }}
        disabled={!hasAllRequiredFields || isBusy}
        title={!hasAllRequiredFields ? 'You must provide at least First Name and Internal Description' : ''}
      >
        Save
      </button>
    </div>
  );
}
