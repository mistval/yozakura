import { useEffect, useMemo, useRef, useState } from 'react';
import { useCharacterOverview } from './CharacterOverviewContext.js';
import type { Character, CharacterRelationships } from '../../engine/types.js';
import { useScenarioStore } from '../../state/scenario_store.js';
import { useScenarioCharacterStore } from '../../state/scenario_character_store.js';
import { useScenarioCharacterRelationshipStore } from '../../state/scenario_character_relationship_store.js';
import CharacterOverviewAddCharactersModal from './CharacterOverviewAddCharactersModal.js';
import CharacterOverviewPairData from './CharacterOverviewPairData.js';
import CharacterOverviewSelectionStrip from './CharacterOverviewSelectionStrip.js';
import CharacterOverviewSingleData from './CharacterOverviewSingleData.js';
import CharacterGroupsTab from './CharacterGroupsTab.js';
import RoutedModalFrame from '../ui/RoutedModalFrame.js';
import CharacterEditorModal from '../character_editor_modal/CharacterEditorModal.js';
import { assertNonNullish } from '../../errors/application_error.js';
import { StringParam, useQueryParam } from 'use-query-params';
import { useConversationLog } from '../conversation_log/ConversationLogContext.js';

function CharacterOverviewInner() {
  const [scrollDown, setScrollDown] = useQueryParam('scrolldown', StringParam);
  const scenario = useScenarioStore((state) => state.activeScenario);
  const activeMap = useScenarioStore((state) => state.activeScenarioMap);
  const charactersById = useScenarioCharacterStore((state) => state.scenarioCharactersById);
  const getCharacterRelationships = useScenarioCharacterRelationshipStore(
    (state) => state.getCharacterRelationships
  );
  const { showConversationLog } = useConversationLog();

  const {
    open,
    closeCharacterOverview,
    routeEditingCharacterId,
    backToCharacterOverview,
    setSelectedIds,
    validSelectedIds,
  } = useCharacterOverview();

  const userId = scenario?.userCharacterId || '';
  const [tabParam, setTabParam] = useQueryParam('cotab', StringParam);
  const [, setGroupParam] = useQueryParam('cogroup', StringParam);
  const tab = tabParam === 'groups' ? 'groups' : 'overview';
  const setTab = (next: 'overview' | 'groups') => setTabParam(next === 'overview' ? undefined : next);
  const [relationships, setRelationships] = useState<CharacterRelationships>({});
  const contentRef = useRef<HTMLDivElement>(undefined);

  useEffect(() => {
    if (scrollDown === 'true') {
      requestAnimationFrame(() => {
        contentRef.current?.scrollTo({ top: contentRef.current.scrollHeight });
        setScrollDown('');
      });
    }
  }, [scrollDown]);

  useEffect(() => {
    if (!open) {
      setSelectedIds([]);
      setRelationships({});
      setTabParam(undefined);
      setGroupParam(undefined);
    }
  }, [open]);

  useEffect(() => {
    let cancelled = false;

    async function run() {
      if (validSelectedIds.length === 1) {
        const selectedId = validSelectedIds[0];
        assertNonNullish(selectedId);
        const pairs = Object.values(charactersById)
          .filter((character) => character.id !== selectedId)
          .map((character) => ({ fromId: character.id, toId: selectedId }))
          .concat(
            selectedId !== userId
              ? [
                  { fromId: selectedId, toId: userId },
                  { fromId: userId, toId: selectedId },
                ]
              : []
          );

        const loaded = await getCharacterRelationships(pairs);
        if (!cancelled) {
          setRelationships((prev) => ({ ...prev, ...loaded }));
        }
      }
    }

    void run();
    return () => {
      cancelled = true;
    };
  }, [validSelectedIds]);

  const orderedCharacters = useMemo(() => {
    if (!scenario) return [];
    const characters = Object.values(charactersById);
    const npcs = characters
      .filter((character) => character.id !== scenario.userCharacterId)
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt) || a.id.localeCompare(b.id));
    const userCharacter = charactersById[scenario.userCharacterId];
    return [userCharacter].concat(npcs).filter((entry): entry is Character => Boolean(entry));
  }, [scenario, charactersById]);

  const selectedPair =
    validSelectedIds.length === 2
      ? ([validSelectedIds[0], validSelectedIds[1]] as [string, string])
      : undefined;
  const selectedSingleId = validSelectedIds.length === 1 ? validSelectedIds[0] : undefined;
  const selectedSingleCharacter = selectedSingleId ? charactersById[selectedSingleId] : undefined;

  const toggleSelect = (id: string) => {
    if (validSelectedIds.includes(id)) {
      setSelectedIds(validSelectedIds.filter((entry) => entry !== id));
    } else if (validSelectedIds.length >= 2) {
      assertNonNullish(validSelectedIds[0]);
      setSelectedIds([validSelectedIds[0], id]);
    } else {
      setSelectedIds(validSelectedIds.concat(id));
    }
  };

  if (!scenario || !activeMap) {
    return undefined;
  }

  return (
    <>
      <RoutedModalFrame
        queryParam="characteroverview"
        onClose={closeCharacterOverview}
        maxWidthClassName="max-w-6xl"
        contentRef={contentRef}
        headerActions={
          <>
            <button
              type="button"
              className={tab === 'overview' ? 'button-emphasized' : ''}
              onClick={() => setTab('overview')}
            >
              Overview
            </button>
            <button
              type="button"
              className={tab === 'groups' ? 'button-emphasized' : ''}
              onClick={() => setTab('groups')}
            >
              Character Groups
            </button>
          </>
        }
      >
        <>
          <h2 className="text-xl font-semibold">Character Overview</h2>

          {tab === 'overview' && (
            <>
              <CharacterOverviewSelectionStrip
                characters={orderedCharacters}
                selectedIds={validSelectedIds}
                activeMap={activeMap}
                relationshipLogs={relationships}
                onToggleSelect={toggleSelect}
              />

              {!selectedPair && selectedSingleCharacter && (
                <div className="space-y-2">
                  <div className="text-sm text-muted">Select two characters to view their relationship.</div>
                  <CharacterOverviewSingleData
                    selectedSingleCharacter={selectedSingleCharacter}
                    scenario={scenario}
                    activeMap={activeMap}
                    onShowConversationDetail={(entryId) => {
                      showConversationLog({ conversationId: entryId });
                    }}
                  />
                </div>
              )}

              {selectedPair && (
                <CharacterOverviewPairData
                  selectedCharacterIds={selectedPair}
                  onShowConversationDetail={(entryId) => {
                    showConversationLog({ conversationId: entryId });
                  }}
                />
              )}
            </>
          )}

          {tab === 'groups' && <CharacterGroupsTab />}
        </>
      </RoutedModalFrame>

      <CharacterEditorModal
        queryParam="co_character"
        open={Boolean(routeEditingCharacterId)}
        characterId={routeEditingCharacterId}
        scenarioId={scenario.id}
        onClose={() => {
          backToCharacterOverview();
        }}
      />

      <CharacterOverviewAddCharactersModal />
    </>
  );
}

export default function CharacterOverview() {
  const { open } = useCharacterOverview();

  if (!open) {
    return;
  }

  // Optimization so this isn't rendering when not open
  return <CharacterOverviewInner />;
}
