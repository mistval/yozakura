import { useMemo } from 'react';
import { useNavigate } from 'react-router';
import CharacterCard from '../components/CharacterCard';
import BulkImportCharactersModal from '../components/BulkImportCharactersModal';
import { useGlobalCharactersStore } from '../state/global_character_store';
import { useSettingsModal } from '../components/settings/SettingsModalContext.js';
import { useGlobalCharacterEditor } from '../components/character_editor_modal/GlobalCharacterEditorContext.js';
import { useModalQueryParam } from '../hooks/useModalQueryParam.js';

export default function CharacterList() {
  const { installDemoCharactersGlobally, globalCharacters, globalCharactersAreLoaded } =
    useGlobalCharactersStore();
  const navigate = useNavigate();
  const { openSettings } = useSettingsModal();
  const { showCharacterEditor } = useGlobalCharacterEditor();
  const {
    open: bulkImportOpen,
    openModal: openBulkImport,
    closeModal: closeBulkImport,
  } = useModalQueryParam('bulkimport');

  const sortedGlobalCharacters = useMemo(
    () =>
      [...globalCharacters].sort(
        (a, b) => b.updatedAt.localeCompare(a.updatedAt) || a.id.localeCompare(b.id)
      ),
    [globalCharacters]
  );

  return (
    <div className="max-w-6xl mx-auto p-4 sm:p-6">
      <div className="flex flex-wrap gap-2 mb-4">
        <button type="button" onClick={() => navigate('/')}>
          Back
        </button>
        <button type="button" onClick={() => showCharacterEditor()}>
          Create New Character
        </button>
        <button type="button" onClick={openBulkImport}>
          Bulk Import Characters
        </button>
        <button type="button" onClick={() => openSettings()} aria-label="Settings" title="Settings">
          ⚙
        </button>
      </div>

      {sortedGlobalCharacters.length === 0 && globalCharactersAreLoaded ? (
        <div className="text-sm text-secondary">
          You don't have any characters yet.{' '}
          <a
            href="#"
            onClick={(e) => {
              e.preventDefault();
              showCharacterEditor();
            }}
            className="underline text-primary hover:text-primary-strong"
          >
            Create one
          </a>{' '}
          or{' '}
          <a
            href="#"
            onClick={(e) => {
              e.preventDefault();
              installDemoCharactersGlobally();
            }}
            className="underline cursor-pointer text-primary hover:text-primary-strong"
          >
            install the demo characters
          </a>{' '}
          or{' '}
          <a
            href="#"
            onClick={(e) => {
              e.preventDefault();
              openBulkImport();
            }}
            className="underline cursor-pointer text-primary hover:text-primary-strong"
          >
            bulk import characters from Yozakura or SillyTavern character card pngs
          </a>
          .
        </div>
      ) : (
        <div className="grid grid-cols-[repeat(2,minmax(0,210px))] sm:grid-cols-[repeat(auto-fill,minmax(180px,210px))] gap-2.5 sm:gap-3 items-start">
          {sortedGlobalCharacters.map((character) => (
            <CharacterCard
              key={character.id}
              character={character}
              className="w-full p-2 sm:p-3"
              imageClassName="h-44 sm:h-52 object-cover object-top"
              onClick={() => showCharacterEditor(character.id)}
            />
          ))}
        </div>
      )}

      <BulkImportCharactersModal open={bulkImportOpen} onClose={closeBulkImport} />
    </div>
  );
}
