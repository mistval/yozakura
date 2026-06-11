import type { ChangeEvent } from 'react';
import LoadingSpinner from '../ui/LoadingSpinner';
import InfoTooltip from '../ui/InfoTooltip';
import { useCharacterEditorModal } from './CharacterEditorModalContext';

export default function BaseAppearanceSection() {
  const { character, loadingButton, isBusy, loadingField, setCharacterField, generateBaseAppearance } =
    useCharacterEditorModal();

  return (
    <div>
      <div className="flex items-center gap-1">
        <h3 className="text-base font-medium mb-1">
          Base Appearance <span className="text-sm text-muted">(Optional)</span>
        </h3>
        <InfoTooltip
          label="Base Appearance"
          html="A description of the character's base physical appearance for consumption by image generation models. Only include details that never change between scenes (like eye color, height, etc). You can include LoRAs here. You can skip this if you do not plan to use image generation."
        />
      </div>
      <textarea
        rows={3}
        value={character.baseAppearanceTags}
        disabled={loadingField === 'baseAppearanceTags'}
        onChange={(event: ChangeEvent<HTMLTextAreaElement>) =>
          setCharacterField('baseAppearanceTags', event.target.value)
        }
      />
      {character.internalDescription.trim() && (
        <button
          type="button"
          disabled={isBusy}
          onClick={() => {
            void generateBaseAppearance();
          }}
        >
          {loadingButton === 'generateBaseAppearance' ? <LoadingSpinner label="Generating..." /> : 'Generate'}
        </button>
      )}
    </div>
  );
}
