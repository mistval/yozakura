import type { ChangeEvent } from 'react';
import LoadingSpinner from '../ui/LoadingSpinner';
import InfoTooltip from '../ui/InfoTooltip';
import ButtonOptions from '../ui/ButtonOptions';
import { useCharacterEditorModal } from './CharacterEditorModalContext';
import {
  ALL_EXTRACT_CHARACTER_CARD_FIELDS,
  type ExtractCharacterCardField,
} from '../../engine/character_gen';

const EXTRACT_FIELD_OPTIONS: { field: ExtractCharacterCardField; label: string }[] = [
  { field: 'internalDescription', label: 'Internal Description' },
  { field: 'externalDescription', label: 'External Description' },
  { field: 'exampleDialogue', label: 'Example Dialogue' },
  { field: 'baseAppearanceTags', label: 'Base Appearance' },
  { field: 'wardrobes', label: 'Wardrobes' },
];

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
    extractFields,
    setExtractFields,
    toggleExtractField,
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
          className='w-full'
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
              <ButtonOptions
                button={
                  <button
                    type="button"
                    onClick={() => {
                      void extractFromDescription();
                    }}
                    disabled={isBusy || extractFields.length === 0}
                    title={extractFields.length === 0 ? 'Select at least one field to extract' : undefined}
                  >
                    {loadingButton === 'extractDescription' ? (
                      <LoadingSpinner label="Extracting..." />
                    ) : (
                      'Extract'
                    )}
                  </button>
                }
                disabled={isBusy}
                ariaLabel="Extract options"
              >
                <div className="w-56 space-y-2 select-none">
                  <div className="flex items-center justify-between pb-1.5 border-b border-border-default">
                    <span className="text-xs font-semibold text-secondary-strong">Populate Fields</span>
                    <div className="flex items-center gap-1">
                      <button
                        type="button"
                        onClick={() => setExtractFields([...ALL_EXTRACT_CHARACTER_CARD_FIELDS])}
                        className="px-1.5 py-0.5 text-[11px] leading-tight"
                      >
                        All
                      </button>
                      <button
                        type="button"
                        onClick={() => setExtractFields([])}
                        className="px-1.5 py-0.5 text-[11px] leading-tight"
                      >
                        None
                      </button>
                    </div>
                  </div>
                  <div className="space-y-1.5 pt-0.5">
                    {EXTRACT_FIELD_OPTIONS.map(({ field, label }) => (
                      <label
                        key={field}
                        className="flex items-center gap-2 cursor-pointer text-xs text-primary hover:text-secondary-strong"
                      >
                        <input
                          type="checkbox"
                          checked={extractFields.includes(field)}
                          onChange={() => toggleExtractField(field)}
                          className="h-4 w-4 rounded cursor-pointer"
                        />
                        <span>{label}</span>
                      </label>
                    ))}
                  </div>
                  {!extractFields.includes('internalDescription') && (
                    <p className="text-[11px] text-muted-soft pt-1 border-t border-border-default leading-normal">
                      Existing internal description will be preserved and used as context.
                    </p>
                  )}
                </div>
              </ButtonOptions>
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
          className='w-full'
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
