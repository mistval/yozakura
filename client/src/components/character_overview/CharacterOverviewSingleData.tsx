import { useEffect, useMemo } from 'react';
import { useCharacterOverview } from './CharacterOverviewContext.js';
import { useObjectEditor } from '../object_editor/ObjectEditorContext.js';
import type { Character, Scenario, WorldMap } from '../../engine/types.js';
import { useActiveScenarioMap, useScenarioStore } from '../../state/scenario_store.js';
import { useScenarioCharacterStore } from '../../state/scenario_character_store.js';
import { useScenarioCharacterRelationshipStore } from '../../state/scenario_character_relationship_store.js';
import InfoTooltip from '../ui/InfoTooltip.js';
import { SpoilerSection } from '../ui/SpoilerSection.js';
import { useTurnMachineStore } from '../../state/turn_machine_store.js';
import { ChatCoordinator } from '../../engine/chat/chat_coordinator.js';

import ConversationSearchList from '../conversation_log/ConversationSearchList.js';
import { useScenarioLoopStateStore } from '../../state/scenario_loop_state_store.js';
import { assertNonNullish } from '../../errors/application_error.js';
import { useCharacterGroupStore } from '../../state/character_group_store.js';
import { USER_SYNC, useIsEntityLockedForEditing } from '../../state/ephemeral_state_helper.js';
import { AiEditButton } from '../object_editor/AiEditButton.js';
import CharacterLocationSelect from '../CharacterLocationSelect.js';

type CharacterOverviewSingleDataProps = {
  selectedSingleCharacter: Character;
  scenario: Scenario;
  activeMap: WorldMap;
  onShowConversationDetail: (entryId: string) => void;
};

export default function CharacterOverviewSingleData({
  selectedSingleCharacter,
  onShowConversationDetail,
}: CharacterOverviewSingleDataProps) {
  const scenario = useScenarioStore((state) => state.activeScenario);
  const activeMap = useActiveScenarioMap();
  const characters = useScenarioCharacterStore((state) => state.scenarioCharacters);
  const saveScenarioCharacterFields = useScenarioCharacterStore((state) => state.saveScenarioCharacterFields);
  const setUserCharacter = useScenarioStore((state) => state.setUserCharacter);
  const getCharacterRelationship = useScenarioCharacterRelationshipStore(
    (state) => state.getCharacterRelationship
  );
  const requestDirectNpcChat = useScenarioLoopStateStore((state) => state.submitUserChatAction);
  const chatSessionIsActive = useTurnMachineStore((state) => state.chatState !== 'inactive');
  const { closeCharacterOverview, openCharacterOverviewEditor, openCharacterOverviewGroup } =
    useCharacterOverview();
  const { open: objectEditorOpen, openScenarioCharacterObjectEditor } = useObjectEditor();
  const groups = useCharacterGroupStore((state) => state.groups);

  assertNonNullish(scenario, 'CharacterOverviewSingleData rendered without active scenario');
  assertNonNullish(activeMap, 'CharacterOverviewSingleData rendered without active map');

  const isUser = selectedSingleCharacter.id === scenario.userCharacterId;
  const isCharacterSyncing = useIsEntityLockedForEditing(selectedSingleCharacter.id);
  const saveCharacterFields = (fields: Partial<Character>) =>
    saveScenarioCharacterFields(selectedSingleCharacter.id, fields, USER_SYNC);

  const memberGroups = useMemo(
    () =>
      selectedSingleCharacter.groupIds
        .map((groupId) => groups.find((group) => group.id === groupId))
        .filter((group): group is NonNullable<typeof group> => Boolean(group))
        .map((group) => ({ id: group.id, name: group.name || 'Untitled Group' })),
    [selectedSingleCharacter.groupIds, groups]
  );

  const otherCharactersArr = useMemo(
    () => characters.filter((c) => c.id !== selectedSingleCharacter.id),
    [selectedSingleCharacter]
  );

  useEffect(() => {
    async function run() {
      assertNonNullish(scenario, 'CharacterOverviewSingleData rendered without active scenario');
      if (isUser) {
        return;
      }

      await getCharacterRelationship(selectedSingleCharacter.id, scenario.userCharacterId);
    }

    void run();
  }, [selectedSingleCharacter?.id, scenario, isUser, getCharacterRelationship]);

  if (!selectedSingleCharacter) {
    return undefined;
  }

  return (
    <div className="space-y-3">
      {selectedSingleCharacter.externalDescription && (
        <div className={`border rounded-sm p-3`}>{selectedSingleCharacter.externalDescription}</div>
      )}
      {memberGroups.length > 0 && (
        <div className="border rounded-sm p-3">
          <span className="font-medium">Groups:</span>{' '}
          {memberGroups.map((group, index) => (
            <span key={group.id}>
              {index > 0 && ', '}
              <a
                href={`#`}
                onClick={(event) => {
                  event.preventDefault();
                  openCharacterOverviewGroup(group.id);
                }}
                className="underline hover:text-primary"
              >
                {group.name}
              </a>
            </span>
          ))}
        </div>
      )}
      <div className="flex gap-2 flex-wrap">
        {!isUser && (
          <button
            type="button"
            disabled={chatSessionIsActive || objectEditorOpen}
            onClick={() => {
              void setUserCharacter(selectedSingleCharacter.id);
            }}
          >
            Make {selectedSingleCharacter.firstName} User Character
          </button>
        )}
        <button
          type="button"
          disabled={objectEditorOpen}
          onClick={() => {
            if (chatSessionIsActive) {
              ChatCoordinator.addParticipant(selectedSingleCharacter.id);
            } else {
              requestDirectNpcChat(selectedSingleCharacter.id);
            }

            closeCharacterOverview();
          }}
        >
          Add to Chat
        </button>

        <button
          type="button"
          onClick={() => {
            openCharacterOverviewEditor(selectedSingleCharacter.id);
          }}
          disabled={!selectedSingleCharacter || isCharacterSyncing}
        >
          Edit {selectedSingleCharacter.firstName}
        </button>
        <AiEditButton
          disabled={!selectedSingleCharacter}
          onClick={() => openScenarioCharacterObjectEditor(selectedSingleCharacter.id)}
        />
        <label className="flex flex-col items-center gap-2 text-sm">
          <span>Location</span>
          <CharacterLocationSelect characterId={selectedSingleCharacter.id} />
        </label>
        <label className="flex flex-col items-center gap-2 text-sm">
          {!isUser && (
            <>
              <div className="flex items-center gap-2">
                <span>Next conversation with</span>
                <InfoTooltip
                  label="Next conversation with"
                  value="If this is set, this character will speak with the specified other character at the next opportunity, and it will be a rich interaction."
                />
              </div>
              <select
                value={selectedSingleCharacter.nextConversationWithCharacterId || ''}
                disabled={isCharacterSyncing}
                onChange={(event) => {
                  void saveCharacterFields({
                    nextConversationWithCharacterId: event.target.value.trim(),
                  });
                }}
                className="border rounded-sm px-2 py-1 bg-inset"
              >
                <option value="">Automatic</option>
                {otherCharactersArr
                  .toSorted(
                    (a, b) => a.firstName.localeCompare(b.firstName) || a.lastName.localeCompare(b.lastName)
                  )
                  .map((character) => (
                    <option key={character.id} value={character.id}>
                      {character.firstName} {character.lastName}
                    </option>
                  ))}
              </select>
            </>
          )}
        </label>
      </div>
      {!isUser && (
        <div className="space-y-2">
          <SpoilerSection
            title="Global Memory"
            disabled={isCharacterSyncing}
            initialValue={selectedSingleCharacter.globalMemories || ''}
            onSave={(newValue: string) =>
              saveCharacterFields({
                globalMemories: newValue.trim(),
              })
            }
          >
            {selectedSingleCharacter.globalMemories || '(none)'}
          </SpoilerSection>
          <SpoilerSection title="Past conversation summaries">
            {selectedSingleCharacter.rollingConversationSummaries.length === 0 ? (
              <div className="text-sm text-muted">No past conversation summaries yet.</div>
            ) : (
              <div className="space-y-2">
                {selectedSingleCharacter.rollingConversationSummaries.map((summary, index) => (
                  <SpoilerSection
                    key={`${summary.conversationId}-${index}`}
                    title={`Summary ${index + 1} (Turn ${summary.turnNumber})`}
                    disabled={isCharacterSyncing}
                    initialValue={summary.summary || ''}
                    onSave={(newValue: string) => {
                      const updatedSummaries = selectedSingleCharacter.rollingConversationSummaries.map(
                        (entry, entryIndex) =>
                          entryIndex === index
                            ? {
                                ...entry,
                                summary: newValue,
                              }
                            : entry
                      );

                      return saveCharacterFields({
                        rollingConversationSummaries: updatedSummaries,
                      });
                    }}
                    onDelete={() => {
                      const updatedSummaries = selectedSingleCharacter.rollingConversationSummaries.filter(
                        (_, entryIndex) => entryIndex !== index
                      );

                      return saveCharacterFields({
                        rollingConversationSummaries: updatedSummaries,
                      });
                    }}
                  >
                    {summary.summary || '(none)'}
                  </SpoilerSection>
                ))}
              </div>
            )}
          </SpoilerSection>
        </div>
      )}
      <ConversationSearchList
        open={true}
        scenarioId={scenario.id}
        participantIds={[selectedSingleCharacter.id]}
        onSelectConversation={onShowConversationDetail}
      />
    </div>
  );
}
