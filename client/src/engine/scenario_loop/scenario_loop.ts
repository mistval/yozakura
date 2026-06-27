import { useTurnMachineStore } from '../../state/turn_machine_store';
import { whenScenarioCharactersLoaded } from '../../state/scenario_character_store';
import { useScenarioLoopStateStore } from '../../state/scenario_loop_state_store';
import { useScenarioStore } from '../../state/scenario_store';
import { showNonRetriableErrorCardIfNeeded } from '../interative_retry';
import { ScenarioLoopAbortSignalException, scenarioLoopPromiseCallbacks } from './flow_control';
import { loadPersistedTurn } from './turn_persistence';
import { runTurnLoop } from './turn_loop';

function stopScenarioLoop() {
  scenarioLoopPromiseCallbacks.userTurnAction = undefined;
  scenarioLoopPromiseCallbacks.userChatAction = undefined;
  useScenarioLoopStateStore.getState().resetLoopState();
}

function shouldPauseOnHydrate(hydratedState: ReturnType<typeof useTurnMachineStore.getState>): boolean {
  if (hydratedState.chatState !== 'inactive' && hydratedState.userIsParticipant()) {
    return false; // Don't pause because user will be prioritized on first turn anyway
  } else if (hydratedState.chatState !== 'inactive') {
    return true; // Do pause because we're launching into a chat without user
  } else if (hydratedState.currentCharacterIsUser()) {
    return false; // Don't pause because it's user turn
  }

  // Pause because it's NPC turn
  return true;
}

export async function startScenarioLoop() {
  const loopState = useScenarioLoopStateStore.getState();
  const activeScenarioId = useScenarioStore.getState().activeScenario?.id;

  if (!activeScenarioId) {
    return;
  }

  if (activeScenarioId === loopState.runningForScenario) {
    return;
  }

  stopScenarioLoop();

  loopState.setRunState('running');
  loopState.setScenario(activeScenarioId);

  try {
    useTurnMachineStore.getState().reset();
    await whenScenarioCharactersLoaded();

    const restored = await loadPersistedTurn(activeScenarioId);

    if (restored) {
      useTurnMachineStore.getState().hydrate(restored);

      if (shouldPauseOnHydrate(useTurnMachineStore.getState())) {
        useScenarioLoopStateStore.getState().setUserRequestedPhaseTransition('paused');
      }
    }

    await runTurnLoop({ prioritizeUserOnFirstIteration: true });
  } catch (err) {
    if (err instanceof ScenarioLoopAbortSignalException) {
      return;
    }

    useScenarioLoopStateStore.getState().setRunState('errored');

    await showNonRetriableErrorCardIfNeeded({
      operationType: 'scenario_loop.run_loop',
      error: err,
      messagePrefix: 'Scenario loop fatal error',
      hint: 'The scenario loop is no longer running. Try restarting the application.',
    });

    throw err;
  } finally {
    if (useScenarioLoopStateStore.getState().runningForScenario === activeScenarioId) {
      loopState.setScenario(undefined);
    }
  }
}
