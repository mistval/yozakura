import { useCharacterEditorModal } from './CharacterEditorModalContext.js';
import ButtonOptions from '../ui/ButtonOptions.js';

export default function FooterSection() {
  const { hasAllRequiredFields, isBusy, isGlobalMode, save, saveAsScenarioAndGlobal } =
    useCharacterEditorModal();

  return (
    <div className="flex justify-end items-center mt-5">
      <ButtonOptions
        showDropdown={!isGlobalMode}
        disabled={!hasAllRequiredFields || isBusy}
        placement="top-end"
        className="w-full h-20"
        ariaLabel="Save options"
        button={
          <button
            type="button"
            className="w-full h-20 text-4xl font-bold disabled:bg-muted flex justify-center items-center"
            onClick={() => {
              void save();
            }}
            disabled={!hasAllRequiredFields || isBusy}
            title={
              !hasAllRequiredFields ? 'You must provide at least First Name and Internal Description' : ''
            }
          >
            Save
          </button>
        }
      >
        <div className="w-72 space-y-1 select-none">
          <button
            type="button"
            className="w-full text-left px-3 py-2 text-sm rounded hover:bg-surface-elevated cursor-pointer"
            onClick={() => {
              void save();
            }}
          >
            Save as scenario character
          </button>
          <button
            type="button"
            className="w-full text-left px-3 py-2 text-sm rounded hover:bg-surface-elevated cursor-pointer"
            onClick={() => {
              void saveAsScenarioAndGlobal();
            }}
          >
            Save as scenario character and global character
          </button>
        </div>
      </ButtonOptions>
    </div>
  );
}
