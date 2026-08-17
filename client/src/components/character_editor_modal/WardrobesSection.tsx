import ImplicitWardrobeEditor from '../wardrobe/ImplicitWardrobeEditor.js';
import LoadingSpinner from '../ui/LoadingSpinner.js';
import InfoTooltip from '../ui/InfoTooltip';
import { useCharacterEditorModal } from './CharacterEditorModalContext';

export default function WardrobesSection() {
  const { character, loadingButton, isBusy, setCharacterField, generateWardrobeAt, isGlobalMode } =
    useCharacterEditorModal();

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-1">
          <h3 className="text-base font-medium mb-1">
            Wardrobes <span className="text-sm text-muted">(Optional)</span>
          </h3>
          <InfoTooltip
            label="Wardrobes"
            html="Wardrobes are additional appearance descriptions that can be enabled or disabled during conversation. Wardrobes can include clothing, accessories, facial expressions, poses, etc. All enabled wardrobes are concatenated together with the Base Appearance in image generation prompts. You can skip this if you do not plan to use image generation."
          />
        </div>
      </div>
      <ImplicitWardrobeEditor
        character={character}
        onChange={(wardrobes) => setCharacterField('wardrobes', wardrobes)}
        actionRowElements={({ index, disabled }) =>
          character.internalDescription.trim() && (
            <button
              type="button"
              disabled={disabled || isBusy}
              onClick={() => {
                void generateWardrobeAt(index);
              }}
            >
              {loadingButton === `generatingWardrobeTags-${index}` ? (
                <LoadingSpinner label="Generating..." />
              ) : (
                'Generate'
              )}
            </button>
          )
        }
        showEnabledToggle={!isGlobalMode}
      />
    </div>
  );
}
