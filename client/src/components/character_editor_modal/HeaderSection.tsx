import { useState } from 'react';
import { useCharacterEditorModal } from './CharacterEditorModalContext';
import ConfirmDialog from '../ui/ConfirmDialog';
import { useTurnMachineStore, useCurrentTurnCharacterId } from '../../state/active_chat_store';
import { useScenarioStore } from '../../state/scenario_store';

export default function HeaderSection() {
  const [confirmOpen, setConfirmOpen] = useState(false);
  const { canDelete, isBusy, deleteConfirmationMessage, closeEditor, remove, isNew, isGlobalMode, error } =
    useCharacterEditorModal();
  const activeChatStatus = useTurnMachineStore((state) => state.chatState !== 'inactive');
  const currentTurnCharacterId = useCurrentTurnCharacterId();
  const userCharacterId = useScenarioStore((state) => state.activeScenario?.userCharacterId);
  const npcPhaseBusy = currentTurnCharacterId !== undefined && currentTurnCharacterId !== userCharacterId;

  return (
    <>
      <div className="flex items-center">
        <h1 className="w-full text-2xl font-semibold m-0">{isNew ? 'Create Character' : 'Edit Character'}</h1>
        <div className="w-full flex items-center justify-end gap-3">
          {canDelete && (
            <button
              type="button"
              onClick={() => {
                setConfirmOpen(true);
              }}
              disabled={isBusy || activeChatStatus || npcPhaseBusy}
              title={
                isBusy || activeChatStatus || npcPhaseBusy
                  ? "Cannot delete characters right now. Make sure it's your turn and you do not have a chat open."
                  : ''
              }
            >
              {isGlobalMode ? 'Delete' : 'Remove From Scenario'}
            </button>
          )}
          <button type="button" onClick={closeEditor} className="button-emphasized ">
            X
          </button>
        </div>
      </div>

      {!isGlobalMode && (
        <div className="text-sm border rounded-sm p-2 bg-warning-bg text-warning-text border-warning-border-soft">
          You are editing this character only for the active scenario. Global character data is unchanged.
        </div>
      )}

      {error && (
        <div className="rounded-sm border border-danger-border bg-danger-bg px-2 py-1 text-sm text-danger-text">
          {error || 'Unknown error'}
        </div>
      )}

      <ConfirmDialog
        open={confirmOpen}
        onClose={() => setConfirmOpen(false)}
        title={`Confirm ${isGlobalMode ? 'Delete' : 'Removal'}`}
        message={deleteConfirmationMessage}
        confirmLabel={isGlobalMode ? 'Delete' : 'Remove'}
        onConfirm={() => {
          setConfirmOpen(false);
          void remove();
        }}
        confirmDisabled={isBusy}
      />
    </>
  );
}
