import { useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
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
    <div className="max-w-6xl mx-auto p-6">
      <div className="flex justify-between mb-4">
        <h1 className="text-2xl font-semibold">Characters</h1>
        <div className="flex gap-2">
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
      </div>

      <div className="flex flex-wrap gap-3">
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
              {'install the demo characters'}
            </a>
            .
          </div>
        ) : (
          sortedGlobalCharacters.map((character) => (
            <CharacterCard
              key={character.id}
              character={character}
              onClick={() => showCharacterEditor(character.id)}
            />
          ))
        )}
      </div>

      <BulkImportCharactersModal open={bulkImportOpen} onClose={closeBulkImport} />
    </div>
  );
}
