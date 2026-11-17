import { useEffect, useMemo, useRef } from 'react';
import { useNavigate, useParams } from 'react-router';
import CharacterCard from '../components/CharacterCard';
import ChatPane from '../components/ChatPane';
import LocationPanel, { type MoveSuggestion } from '../components/LocationPanel';
import { useCharacterOverview } from '../components/character_overview/CharacterOverviewContext';
import { useConversationLog } from '../components/conversation_log/ConversationLogContext';
import { useMapModal } from '../components/MapModalContext';
import { useSettingsModal } from '../components/settings/SettingsModalContext';
import { getDirectedRelationship } from '../engine/relationship';
import type { Character, CharacterPair, WorldMapLocation } from '../engine/types';
import { assertNonNullish } from '../errors/application_error';
import {
  useActiveChatParticipants,
  useTurnMachineStore,
  useCurrentTurnCharacterId,
} from '../state/turn_machine_store';
import { useScenarioStore } from '../state/scenario_store.js';
import { useMapStore } from '../state/map_store.js';
import { useScenarioLoopStateStore } from '../state/scenario_loop_state_store';
import { useScenarioCharacterStore } from '../state/scenario_character_store.js';
import { useGlobalCharactersStore } from '../state/global_character_store.js';
import {
  useCachedCharacterRelationships,
  useScenarioCharacterRelationshipStore,
} from '../state/scenario_character_relationship_store.js';
import { useCharacterGroupStore } from '../state/character_group_store.js';
import { useTemporalContextStore } from '../state/temporal_context_store.js';
import { getUserMovementSuggestion } from '../engine/character_schedule/get_scheduled_move';
import { ChatCoordinator } from '../engine/chat/chat_coordinator';
import { startScenarioLoop } from '../engine/scenario_loop/scenario_loop';
import { useSettingsStore, type ChatPaneWidth } from '../state/settings_store';
import { useUserCanInputChat, useIsChatFinalizing } from '../state/chat_state';
import { globalParallelJobManager } from '../engine/parallelization/job_manager';
import { UserStopSignalException } from '../engine/scenario_loop/flow_control';
import ResponsiveDrawerSidebar, { useMobileDrawer } from '../components/ui/ResponsiveDrawerSidebar';

const DESKTOP_CHAT_PANE_WIDTH_CLASSES: Record<Exclude<ChatPaneWidth, 'mobile'>, string> = {
  narrow: 'w-[min(44rem,max(28rem,calc(100vw-22rem)))] shrink-0',
  medium: 'w-[min(54rem,max(28rem,calc(100vw-22rem)))] shrink-0',
  wide: 'w-[min(64rem,max(28rem,calc(100vw-22rem)))] shrink-0',
  extra_wide: 'w-[min(74rem,max(28rem,calc(100vw-22rem)))] shrink-0',
  unconstrained: 'flex-1 min-w-0',
};

export default function ScenarioView() {
  const navigate = useNavigate();
  const { scenarioId } = useParams<{ scenarioId: string }>();
  const scenario = useScenarioStore((state) => state.activeScenario);
  const charactersById = useScenarioCharacterStore((state) => state.scenarioCharactersById);
  const scenarioCharactersAreLoaded = useScenarioCharacterStore((s) => s.scenarioCharactersAreLoaded);
  const scenarioCharacters = useScenarioCharacterStore((s) => s.scenarioCharacters);
  const globalCharactersAreLoaded = useGlobalCharactersStore((s) => s.globalCharactersAreLoaded);
  const globalCharacters = useGlobalCharactersStore((s) => s.globalCharacters);
  const activeMap = useScenarioStore((state) => state.activeScenarioMap);
  const noMapsExist = useMapStore((s) => s.mapsAreLoaded && s.maps.length === 0);
  const loadScenarioState = useScenarioStore((state) => state.refreshScenario);
  const getCharacterRelationships = useScenarioCharacterRelationshipStore(
    (state) => state.getCharacterRelationships
  );
  const ephemeralLocation = useTurnMachineStore((s) => s.ephemeralLocation);
  const schedulesByGroupId = useCharacterGroupStore((state) => state.schedulesByGroupId);
  const temporalDisplayHtml = useTemporalContextStore((state) => state.displayHtml);
  const { showCharacterOverview } = useCharacterOverview();
  const { showConversationLog } = useConversationLog();
  const { showMap } = useMapModal();
  const { openSettings } = useSettingsModal();
  const activeParticipants = useActiveChatParticipants();
  const freedomOfMovement = useSettingsStore((s) => s.freedomOfMovement);
  const chatPaneWidth = useSettingsStore((s) => s.chatPaneWidth);
  const isMobileLayout = chatPaneWidth === 'mobile';
  const activeChatState = useTurnMachineStore((state) => state.chatState);
  const hasActiveChatSession = activeChatState !== 'inactive';
  const currentTurnCharacterId = useCurrentTurnCharacterId();
  const submitUserWait = useScenarioLoopStateStore((state) => state.submitUserWait);
  const submitUserMove = useScenarioLoopStateStore((state) => state.submitUserMove);
  const submitUserChatAction = useScenarioLoopStateStore((state) => state.submitUserChatAction);
  const autoModeEnabled = useScenarioLoopStateStore((state) => state.autoMode);
  const setAutoModeEnabled = useScenarioLoopStateStore((state) => state.setAutoMode);
  const isFinalizingChat = useIsChatFinalizing();
  const isUserTurn =
    currentTurnCharacterId !== undefined && currentTurnCharacterId === scenario?.userCharacterId;
  const npcPhaseBusy =
    currentTurnCharacterId !== undefined && currentTurnCharacterId !== scenario?.userCharacterId;
  const canSubmitUserTurn = isUserTurn && !hasActiveChatSession;
  const canReturnToMainMenu = useUserCanInputChat() || !hasActiveChatSession;
  const previousUserIdRef = useRef<string | null>(null);
  const visibleRelationships = useCachedCharacterRelationships();

  const { openDrawer: openMobileMenu, closeDrawer: closeMobileMenu } = useMobileDrawer(
    'scenariomenu',
    hasActiveChatSession
  );

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
  const canAddChatParticipant = !isFinalizingChat && (hasActiveChatSession || isUserTurn);

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
  const location =
    ephemeralLocation ||
    (perspectiveLocationId ? locationById[perspectiveLocationId] : activeMap?.locations[0]);

  const closeActiveChatSession = () => {
    ChatCoordinator.deactivate();
  };

  const charactersHere = useMemo(() => {
    if (ephemeralLocation) {
      return activeParticipants;
    }

    if (!scenario) return [];
    return Object.values(charactersById)
      .filter((character): character is Character => Boolean(character))
      .filter((character) => character.locationId === perspectiveLocationId)
      .sort((a, b) => (a.id === scenario.userCharacterId ? 1 : b.id === scenario.userCharacterId ? -1 : 0));
  }, [scenario, perspectiveLocationId, charactersById, ephemeralLocation, activeParticipants]);

  useEffect(() => {
    if (!perspectiveCharacter || charactersHere.length === 0) {
      return;
    }

    const pairs: CharacterPair[] = charactersHere.map((npc) => ({
      fromId: npc.id,
      toId: perspectiveCharacter.id,
    }));

    void getCharacterRelationships(pairs);
  }, [perspectiveCharacter?.id, charactersHere, getCharacterRelationships]);

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

  if (noMapsExist) {
    return (
      <div className="max-w-4xl mx-auto p-6 space-y-3">
        <h1 className="text-2xl font-semibold">You need to create a map</h1>
        <div className="text-sm text-secondary">
          There are no maps, and scenarios cannot run without one. Create a map, then come back to this
          scenario.
        </div>
        <div className="flex gap-2">
          <button type="button" onClick={() => navigate('/maps')}>
            Open Map Editor
          </button>
          <button type="button" onClick={() => navigate('/')}>
            Main Menu
          </button>
        </div>
      </div>
    );
  }

  if (
    scenarioCharactersAreLoaded &&
    scenarioCharacters.length === 0 &&
    globalCharactersAreLoaded &&
    globalCharacters.length === 0
  ) {
    return (
      <div className="max-w-4xl mx-auto p-6 space-y-3">
        <h1 className="text-2xl font-semibold text-danger-text">No Characters Available</h1>
        <p className="text-secondary text-sm">
          This scenario contains no characters, and there are no global characters in your library. Please
          create or import a global character first.
        </p>
        <button
          type="button"
          onClick={() => navigate('/')}
          className="px-4 py-2 bg-button-emphasized-bg text-button-emphasized-text rounded cursor-pointer"
        >
          Main Menu
        </button>
      </div>
    );
  }

  if (!scenario || !user || !perspectiveCharacter || !activeMap) {
    return (
      <div className="max-w-4xl mx-auto p-6 space-y-3">
        <h1 className="text-2xl font-semibold">Loading...</h1>
        <button type="button" onClick={() => navigate('/')} disabled={!canReturnToMainMenu}>
          Main Menu
        </button>
      </div>
    );
  }

  const resolvedLocation = location || activeMap.locations[0];
  assertNonNullish(resolvedLocation, 'No valid current location available for user location.');

  const showNpcPhaseControls = npcPhaseBusy && !activeChatIncludesUser;

  const renderNavigationButtons = () => (
    <div className="flex flex-wrap items-center gap-2 justify-center">
      <button type="button" onClick={() => showCharacterOverview()}>
        Character Overview
      </button>
      <button type="button" onClick={() => showConversationLog()}>
        Conversation Log
      </button>
      <button type="button" onClick={() => showMap()}>
        Map
      </button>
      <button type="button" onClick={() => navigate('/')} disabled={!canReturnToMainMenu}>
        Main Menu
      </button>
      <button type="button" onClick={() => openSettings()} aria-label="Settings" title="Settings">
        ⚙
      </button>
    </div>
  );

  const renderScenarioPanel = ({ compact }: { compact: boolean }) => (
    <div className="space-y-4">
      <div className="bg-emphasized/50 border border-border-default rounded-sm p-2.5 w-fit w-full">
        {renderNavigationButtons()}
      </div>

      <div className="font-semibold" dangerouslySetInnerHTML={{ __html: temporalDisplayHtml }} />

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
        canMove={canSubmitUserTurn}
        suggestion={moveSuggestion}
      />

      {showNpcPhaseControls && (
        <div>
          <div className="font-semibold mb-1">
            {!isUserTurn && `${perspectiveCharacter.firstName}'s turn`}
          </div>
          <div className="flex gap-2 flex-wrap">
            <button
              type="button"
              className="border-danger-border-accent bg-danger-solid text-on-accent hover:bg-danger-solid-hover"
              onClick={() => globalParallelJobManager.cancelAllJobs(new UserStopSignalException())}
            >
              ■ Stop
            </button>
          </div>
        </div>
      )}

      <hr className="border-border-default" />

      <div className="@container space-y-2">
        <div className="flex justify-between items-center">
          <h3 className="font-semibold">Characters here</h3>
        </div>
        <div
          className={
            compact
              ? 'grid grid-cols-[repeat(2,minmax(0,230px))] @[560px]:grid-cols-[repeat(auto-fill,minmax(180px,230px))] gap-2.5 items-start'
              : 'flex gap-3 flex-wrap items-start'
          }
        >
          {charactersHere.map((char) => {
            const rel = getDirectedRelationship(visibleRelationships, char.id, perspectiveCharacter.id);
            const isSelected = Boolean(activeParticipants.some((participant) => participant.id === char.id));
            return (
              <CharacterCard
                key={char.id}
                character={char}
                subtitle2={rel.descriptor}
                className={compact ? 'w-full max-w-[230px] p-2' : undefined}
                imageClassName="h-auto"
                onClick={() => {
                  if (hasActiveChatSession) {
                    addCharacterToActiveChat(char.id);
                    return;
                  }
                  submitUserChatAction(char.id);
                }}
                selected={isSelected}
                disabled={!canAddChatParticipant || char.id === scenario.userCharacterId}
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
  );

  if (!hasActiveChatSession) {
    return (
      <div className={isMobileLayout ? 'w-full min-h-dvh p-3' : 'w-full min-h-dvh p-4 sm:p-6'}>
        {renderScenarioPanel({ compact: isMobileLayout })}
      </div>
    );
  }

  const desktopChatPaneWidthClass =
    chatPaneWidth === 'mobile' ? '' : DESKTOP_CHAT_PANE_WIDTH_CLASSES[chatPaneWidth];
  const desktopRightPanelWidthClass =
    chatPaneWidth === 'unconstrained' ? 'w-[min(31rem,40vw)] shrink-0' : 'flex-1 min-w-[20rem]';

  return (
    <div
      className={
        isMobileLayout
          ? 'w-full h-dvh overflow-hidden'
          : 'w-full h-dvh flex overflow-x-auto overflow-y-hidden'
      }
    >
      <div
        className={isMobileLayout ? 'h-full w-full min-h-0' : `h-full min-h-0 ${desktopChatPaneWidthClass}`}
      >
        <ChatPane onOpenScenarioMenu={isMobileLayout ? openMobileMenu : undefined} />
      </div>
      <ResponsiveDrawerSidebar
        isDrawer={isMobileLayout}
        queryParam="scenariomenu"
        onClose={closeMobileMenu}
        drawerSide="right"
        zIndex={40}
        inlineClassName={`h-full overflow-y-auto p-4 ${desktopRightPanelWidthClass}`}
      >
        {renderScenarioPanel({ compact: true })}
      </ResponsiveDrawerSidebar>
    </div>
  );
}
