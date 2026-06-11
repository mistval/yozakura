import Modal from '../ui/Modal.js';
import ImplicitWardrobeEditor from '../wardrobe/ImplicitWardrobeEditor.js';
import type { Character } from '../../engine/types.js';
import { useScenarioCharacterStore } from '../../state/scenario_character_store.js';
import { useActiveChatParticipants } from '../../state/active_chat_store.js';
import { ChatCoordinator } from '../../engine/chat/chat_coordinator.js';
import { useScenarioStore } from '../../state/scenario_store.js';
import { useCharacterOverview } from '../character_overview/CharacterOverviewContext.js';

interface CharacterChatSettingsProps {
  open: boolean;
  onClose: () => void;
  settingsCharacterId: string | undefined;
}

export default function CharacterChatSettings({
  open,
  onClose,
  settingsCharacterId,
}: CharacterChatSettingsProps) {
  const scenario = useScenarioStore((state) => state.activeScenario);
  const charactersById = useScenarioCharacterStore((state) => state.scenarioCharactersById);
  const saveScenarioCharacterFields = useScenarioCharacterStore((state) => state.saveScenarioCharacterFields);
  const participants = useActiveChatParticipants();
  const { showCharacterOverview } = useCharacterOverview();

  if (!settingsCharacterId || !scenario) {
    return undefined;
  }

  const character = charactersById[settingsCharacterId];
  if (!character) {
    return undefined;
  }

  const persistWardrobes = (updatedWardrobes: Character['wardrobes']) => {
    saveScenarioCharacterFields(character.id, {
      wardrobes: updatedWardrobes,
    });
  };

  return (
    <Modal open={open} onClose={onClose}>
      <div className="max-w-2xl mx-auto p-6">
        <div className="bg-emphasized rounded-sm p-4 space-y-4">
          <>
            <div className="flex justify-between items-center">
              <h3 className="text-lg font-semibold">
                {character.firstName} {character.lastName}
              </h3>
              <div className="flex gap-2">
                {participants.length > 2 && (
                  <button
                    type="button"
                    onClick={() => ChatCoordinator.removeParticipant(settingsCharacterId)}
                  >
                    Remove from Chat
                  </button>
                )}
                <button type="button" onClick={onClose}>
                  Close
                </button>
              </div>
            </div>

            {character.externalDescription && (
              <div className={`border rounded-sm p-3`}>{character.externalDescription}</div>
            )}

            <ImplicitWardrobeEditor
              wardrobes={character.wardrobes}
              onChange={persistWardrobes}
              showEnabledToggle
            />

            <button
              onClick={() =>
                showCharacterOverview({
                  selectedIds: [settingsCharacterId],
                  scrolldown: true,
                })
              }
            >
              Character Overview
            </button>
            <button
              className="ml-3"
              onClick={() =>
                showCharacterOverview({
                  selectedIds: [settingsCharacterId, scenario.userCharacterId],
                  scrolldown: true,
                })
              }
            >
              Relationship Overview
            </button>
          </>
        </div>
      </div>
    </Modal>
  );
}
