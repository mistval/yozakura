import type { ChangeEvent } from 'react';
import LoadingSpinner from '../ui/LoadingSpinner';
import InfoTooltip from '../ui/InfoTooltip';
import { useCharacterEditorModal } from './CharacterEditorModalContext';

export default function DescriptionSection() {
  const {
    character,
    loadingField,
    loadingButton,
    isBusy,
    setCharacterField,
    generateInternalDescription,
    generateExternalDescription,
    extractFromDescription,
  } = useCharacterEditorModal();

  return (
    <div className="space-y-4">
      <div>
        <div className="flex items-center gap-1 mb-1">
          <h3 className="text-base font-medium">Internal Description</h3>
          <InfoTooltip
            label="Internal Description"
            html="This is the internal persona used by the system to understand how to role play as this character. Include relevant behavioral traits, backstory, etc."
          />
        </div>
        <textarea
          rows={4}
          disabled={loadingField === 'internalDescription'}
          value={character.internalDescription}
          onChange={(event: ChangeEvent<HTMLTextAreaElement>) =>
            setCharacterField('internalDescription', event.target.value)
          }
        />
        <div className="flex gap-2 items-center">
          {character.firstName.trim() && (
            <button
              type="button"
              disabled={isBusy}
              onClick={() => {
                void generateInternalDescription();
              }}
            >
              {loadingButton === 'generateInternalDescription' ? (
                <LoadingSpinner label="Generating..." />
              ) : (
                'Generate'
              )}
            </button>
          )}
          {character.firstName.trim() && character.internalDescription.trim() && (
            <>
              <button
                type="button"
                onClick={() => {
                  void extractFromDescription();
                }}
                disabled={isBusy}
              >
                {loadingButton === 'extractDescription' ? (
                  <LoadingSpinner label="Extracting..." />
                ) : (
                  'Extract'
                )}
              </button>
              <InfoTooltip
                label="Extract"
                html='Extract attempts to populate all fields from arbitrary text in the Internal Description. Try dumping a whole wiki article, chapter of a novel, etc into "Internal Description" and clicking Extract.'
              />
            </>
          )}
        </div>
      </div>

      <div>
        <div className="flex items-center gap-1 mb-1">
          <h3 className="text-base font-medium">
            External Description <span className="text-sm text-muted">(Optional)</span>
          </h3>
          <InfoTooltip
            label="External Description"
            html="Public description known or visible to other characters. Prioritize information about appearance, social status, and other externally observable details here. This is the description used by the system when describing the character to other characters. If omitted, other characters won't know anything about this character except what they learn through chat interactions."
          />
        </div>
        <textarea
          rows={3}
          disabled={loadingField === 'externalDescription'}
          value={character.externalDescription}
          onChange={(event: ChangeEvent<HTMLTextAreaElement>) =>
            setCharacterField('externalDescription', event.target.value)
          }
        />
        {character.internalDescription.trim() && (
          <button
            type="button"
            disabled={isBusy}
            onClick={() => {
              void generateExternalDescription();
            }}
          >
            {loadingButton === 'generateExternalDescription' ? (
              <LoadingSpinner label="Generating..." />
            ) : (
              'Generate'
            )}
          </button>
        )}
      </div>
    </div>
  );
}
