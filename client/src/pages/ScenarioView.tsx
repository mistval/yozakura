import { useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import CharacterCard from '../components/CharacterCard';
import ChatPane from '../components/ChatPane';
import LocationPanel, { type MoveSuggestion } from '../components/LocationPanel';
import { useCharacterOverview } from '../components/character_overview/CharacterOverviewContext';
import { useConversationLog } from '../components/conversation_log/ConversationLogContext';
import { useMapModal } from '../components/MapModalContext';
import { useSettingsModal } from '../components/settings/SettingsModalContext';
import { getDirectedRelationship } from '../engine/relationship';
import type { Character, CharacterPair, CharacterRelationships, WorldMapLocation } from '../engine/types';
import { assertNonNullish } from '../errors/application_error';
import {
  useActiveChatParticipants,
  useTurnMachineStore,
  useCurrentTurnCharacterId,
} from '../state/turn_machine_store';
import { useScenarioStore } from '../state/scenario_store.js';
import { useScenarioLoopStateStore } from '../state/scenario_loop_state_store';
import { useScenarioCharacterStore } from '../state/scenario_character_store.js';
import { useScenarioCharacterRelationshipStore } from '../state/scenario_character_relationship_store.js';
import { useCharacterGroupStore } from '../state/character_group_store.js';
import { useTemporalContextStore } from '../state/temporal_context_store.js';
import { getUserMovementSuggestion } from '../engine/character_schedule/get_scheduled_move';
import { ChatCoordinator } from '../engine/chat/chat_coordinator';
import { startScenarioLoop } from '../engine/scenario_loop/scenario_loop';
import { useSettingsStore } from '../state/settings_store';

export default function ScenarioView() {
  const navigate = useNavigate();
  const { scenarioId } = useParams<{ scenarioId: string }>();
  const scenario = useScenarioStore((state) => state.activeScenario);
  const charactersById = useScenarioCharacterStore((state) => state.scenarioCharactersById);
  const activeMap = useScenarioStore((state) => state.activeScenarioMap);
  const loadScenarioState = useScenarioStore((state) => state.refreshScenario);
  const getCharacterRelationships = useScenarioCharacterRelationshipStore(
    (state) => state.getCharacterRelationships
  );
  const schedulesByGroupId = useCharacterGroupStore((state) => state.schedulesByGroupId);
  const temporalDisplayHtml = useTemporalContextStore((state) => state.displayHtml);
  const { showCharacterOverview } = useCharacterOverview();
  const { showConversationLog } = useConversationLog();
  const { showMap } = useMapModal();
  const { openSettings } = useSettingsModal();
  const activeParticipants = useActiveChatParticipants();
  const freedomOfMovement = useSettingsStore((s) => s.freedomOfMovement);
  const hasActiveChatSession = useTurnMachineStore((state) => state.chatState !== 'inactive');
  const currentTurnCharacterId = useCurrentTurnCharacterId();
  const submitUserWait = useScenarioLoopStateStore((state) => state.submitUserWait);
  const submitUserMove = useScenarioLoopStateStore((state) => state.submitUserMove);
  const submitUserChatAction = useScenarioLoopStateStore((state) => state.submitUserChatAction);
  const autoModeEnabled = useScenarioLoopStateStore((state) => state.autoMode);
  const setAutoModeEnabled = useScenarioLoopStateStore((state) => state.setAutoMode);
  const setUserRequestedPhaseTransition = useScenarioLoopStateStore(
    (state) => state.setUserRequestedPhaseTransition
  );
  const isUserTurn =
    currentTurnCharacterId !== undefined && currentTurnCharacterId === scenario?.userCharacterId;
  const npcPhaseBusy =
    currentTurnCharacterId !== undefined && currentTurnCharacterId !== scenario?.userCharacterId;
  const canSubmitUserTurn = isUserTurn && !hasActiveChatSession;
  const previousUserIdRef = useRef<string | null>(null);
  const [visibleRelationships, setVisibleRelationships] = useState<CharacterRelationships>({});

  useEffect(() => {
    if (!scenarioId) {
      return;
    }

    const run = async () => {
      await loadScenarioState(scenarioId);
    };

    void run();
  }, [scenarioId, loadScenarioState]);

  useEffect(() => {
    if (scenario) {
      void startScenarioLoop();
    }
  }, [scenario?.id]);

  useEffect(() => {
    if (!scenario) {
      previousUserIdRef.current = null;
      return;
    }

    if (!previousUserIdRef.current) {
      previousUserIdRef.current = scenario.userCharacterId;
      return;
    }

    if (previousUserIdRef.current !== scenario.userCharacterId) {
      closeActiveChatSession();
      previousUserIdRef.current = scenario.userCharacterId;
    }
  }, [scenario?.userCharacterId]);

  const user: Character | undefined = scenario
    ? (charactersById[scenario.userCharacterId] ?? undefined)
    : undefined;
  const activeChatIncludesUser = scenario
    ? activeParticipants.some((participant) => participant.id === scenario.userCharacterId)
    : false;
  const perspectiveCharacterId =
    hasActiveChatSession && !activeChatIncludesUser
      ? activeParticipants[0]?.id || scenario?.userCharacterId
      : scenario?.userCharacterId;
  const perspectiveCharacter: Character | undefined = perspectiveCharacterId
    ? (charactersById[perspectiveCharacterId] ?? user)
    : user;
  const perspectiveLocationId: string | undefined = perspectiveCharacter
    ? charactersById[perspectiveCharacter.id]?.locationId
    : undefined;
  const locationById = useMemo(
    () =>
      Object.fromEntries((activeMap?.locations || []).map((location) => [location.id, location] as const)),
    [activeMap]
  );
  const locationAdjacenyById = useMemo(
    () =>
      Object.fromEntries(
        (activeMap?.locations || []).map(
          (location) => [location.id, [...new Set(location.adjacency || [])]] as const
        )
      ) as Record<string, string[]>,
    [activeMap]
  );
  const location = perspectiveLocationId ? locationById[perspectiveLocationId] : activeMap?.locations[0];

  const closeActiveChatSession = () => {
    ChatCoordinator.deactivate();
  };

  const charactersHere = useMemo(() => {
    if (!scenario) return [];
    return Object.values(charactersById)
      .filter((character): character is Character => Boolean(character))
      .filter((character) => character.locationId === perspectiveLocationId)
      .sort((a, b) => (a.id === scenario.userCharacterId ? 1 : b.id === scenario.userCharacterId ? -1 : 0));
  }, [scenario, perspectiveLocationId, charactersById]);

  useEffect(() => {
    if (!scenario || !perspectiveCharacter || charactersHere.length === 0) {
      setVisibleRelationships({});
      return;
    }

    const pairs: CharacterPair[] = charactersHere.map((npc) => ({
      fromId: npc.id,
      toId: perspectiveCharacter.id,
    }));

    let cancelled = false;
    const run = async () => {
      const loaded = await getCharacterRelationships(pairs);
      if (cancelled) {
        return;
      }

      setVisibleRelationships(loaded);
    };

    void run();

    return () => {
      cancelled = true;
    };
  }, [
    scenario?.id,
    scenario?.turnNumber,
    perspectiveCharacter?.id,
    charactersHere,
    getCharacterRelationships,
  ]);

  const adjacentLocations = useMemo(() => {
    const ids: string[] = perspectiveLocationId ? locationAdjacenyById[perspectiveLocationId] || [] : [];
    return ids
      .map((id) => {
        const location = locationById[id];
        return location;
      })
      .filter((l): l is WorldMapLocation => Boolean(l));
  }, [perspectiveLocationId, locationAdjacenyById, locationById]);

  const moveSuggestion = useMemo<MoveSuggestion | undefined>(() => {
    if (!canSubmitUserTurn || !user || !activeMap) {
      return undefined;
    }
    const raw = getUserMovementSuggestion(user);
    if (!raw) {
      return undefined;
    }
    const suggestedLocations = raw.suggestedLocationIds
      .map((id) => locationById[id])
      .filter((entry): entry is WorldMapLocation => Boolean(entry));
    return { ...raw, suggestedLocations };
  }, [canSubmitUserTurn, user, activeMap, scenario?.turnNumber, schedulesByGroupId, locationById]);

  const addCharacterToActiveChat = (npcId: string) => {
    if (!hasActiveChatSession || !scenario) {
      return;
    }

    const npc = charactersById[npcId];
    assertNonNullish(npc, `addCharacterToActiveChat called with unknown npcId: ${npcId}`);

    if (activeParticipants.length > 2 && activeParticipants.some((participant) => participant.id === npcId)) {
      ChatCoordinator.removeParticipant(npcId);
      return;
    }

    ChatCoordinator.addParticipant(npcId);
  };

  const toggleAutoMode = () => {
    if (autoModeEnabled) {
      setAutoModeEnabled(false);
      return;
    }

    setAutoModeEnabled(true);
    submitUserWait();
  };

  if (!scenario || !user || !perspectiveCharacter || !activeMap) {
    return (
      <div className="max-w-4xl mx-auto p-6 space-y-3">
        <h1 className="text-2xl font-semibold">Loading...</h1>
        <button type="button" onClick={() => navigate('/')} disabled={!canSubmitUserTurn}>
          Main Menu
        </button>
      </div>
    );
  }

  const resolvedLocation = location || activeMap.locations[0];
  assertNonNullish(resolvedLocation, 'No valid current location available for user location.');

  const showNpcPhaseControls = npcPhaseBusy && !activeChatIncludesUser;

  const renderSessionHeader = ({ includeMenu = false }: { includeMenu?: boolean } = {}) => (
    <div className="flex justify-between items-center">
      <div className="font-semibold" dangerouslySetInnerHTML={{ __html: temporalDisplayHtml }} />
      <div className="flex gap-2">
        <button type="button" onClick={() => showCharacterOverview()}>
          Character Overview
        </button>
        <button type="button" onClick={() => showConversationLog()}>
          Conversation Log
        </button>
        <button type="button" onClick={() => showMap()}>
          Map
        </button>
        {includeMenu && (
          <button type="button" onClick={() => navigate('/')} disabled={!canSubmitUserTurn}>
            Main Menu
          </button>
        )}
        <button type="button" onClick={() => openSettings()} aria-label="Settings" title="Settings">
          ⚙
        </button>
      </div>
    </div>
  );

  return (
    <div className="max-w-6xl mx-auto p-6 space-y-4">
      {renderSessionHeader({ includeMenu: true })}
      <div className="flex gap-3 min-h-0">
        <div className="flex-1 min-w-0 space-y-4">
          <LocationPanel
            location={resolvedLocation}
            adjacentLocationIds={adjacentLocations}
            onMove={(locationId) => {
              submitUserMove(
                locationId,
                moveSuggestion?.consumesTurnByLocationId[locationId] ?? !freedomOfMovement
              );
            }}
            onWait={() => {
              submitUserWait();
            }}
            disabled={!canSubmitUserTurn}
            canMove={!showNpcPhaseControls}
            suggestion={moveSuggestion}
          />

          {showNpcPhaseControls && (
            <div>
              <div className="font-semibold mb-1">NPC turn</div>
              <div className="flex gap-2 flex-wrap">
                <button
                  type="button"
                  className="border-danger-border-accent bg-danger-solid text-on-accent hover:bg-danger-solid-hover"
                  onClick={() => setUserRequestedPhaseTransition('stopped')}
                >
                  ■ Stop
                </button>
              </div>
            </div>
          )}

          {hasActiveChatSession && (
            <div className="mx-auto py-6 space-y-3">
              <ChatPane />
            </div>
          )}

          <div className="space-y-2">
            <div className="flex justify-between items-center">
              <h3 className="font-semibold">Characters here</h3>
            </div>
            <div className="flex gap-3 flex-wrap">
              {charactersHere.map((char) => {
                const rel = getDirectedRelationship(visibleRelationships, char.id, perspectiveCharacter.id);
                const isSelected = Boolean(
                  activeParticipants.some((participant) => participant.id === char.id)
                );
                return (
                  <CharacterCard
                    key={char.id}
                    character={char}
                    subtitle={rel.descriptor}
                    onClick={() => {
                      if (hasActiveChatSession) {
                        addCharacterToActiveChat(char.id);
                        return;
                      }
                      submitUserChatAction(char.id);
                    }}
                    selected={isSelected}
                    disabled={
                      (!hasActiveChatSession && !canSubmitUserTurn) || char.id === scenario.userCharacterId
                    }
                  />
                );
              })}
            </div>

            <div className="space-y-2 pt-1">
              <div className="flex gap-2 flex-wrap">
                <button
                  type="button"
                  onClick={toggleAutoMode}
                  className={
                    autoModeEnabled
                      ? 'border-danger-border-accent bg-danger-solid text-on-accent hover:bg-danger-solid-hover'
                      : undefined
                  }
                >
                  {autoModeEnabled ? '■ Stop Auto Mode' : '▶ Auto Mode'}
                </button>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
