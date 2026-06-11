import type { ChangeEvent } from 'react';
import LoadingSpinner from '../ui/LoadingSpinner';
import { useCharacterEditorModal } from './CharacterEditorModalContext';
import InfoTooltip from '../ui/InfoTooltip';

export default function ExampleDialogueSection() {
  const { character, loadingField, loadingButton, isBusy, setCharacterField, generateExampleDialogue } =
    useCharacterEditorModal();

  return (
    <div>
      <div className="flex items-center gap-1 mb-1">
        <h3 className="text-base font-medium mb-1">
          Example Dialog <span className="text-sm text-muted">(Optional)</span>
        </h3>
        <InfoTooltip
          label="Example Dialogue"
          html="This is an example of how the character might speak or interact in various situations. It helps to illustrate the character's personality and communication style."
        />
      </div>
      <textarea
        disabled={loadingField === 'exampleDialogue'}
        rows={6}
        value={character.exampleDialogue || ''}
        onChange={(event: ChangeEvent<HTMLTextAreaElement>) =>
          setCharacterField('exampleDialogue', event.target.value)
        }
      />
      {character.internalDescription.trim() && character.firstName.trim() && (
        <button
          type="button"
          onClick={() => {
            void generateExampleDialogue();
          }}
          disabled={isBusy}
        >
          {loadingButton === 'generatingExampleDialog' ? (
            <LoadingSpinner label="Generating..." />
          ) : (
            'Generate'
          )}
        </button>
      )}
    </div>
  );
}
