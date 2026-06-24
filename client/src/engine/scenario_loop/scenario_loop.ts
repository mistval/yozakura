import { useTurnMachineStore } from '../../state/turn_machine_store';
import { whenScenarioCharactersLoaded } from '../../state/scenario_character_store';
import { useScenarioLoopStateStore } from '../../state/scenario_loop_state_store';
import { useScenarioStore } from '../../state/scenario_store';
import { showNonRetriableErrorCardIfNeeded } from '../interative_retry';
import {
  abortAllPendingActions,
  doScenarioLoopAsyncAction,
  ScenarioLoopAbortSignalException,
  scenarioLoopPromiseCallbacks,
} from './flow_control';
import { loadPersistedTurn } from './turn_persistence';
import { runTurnLoop } from './turn_loop';

function stopScenarioLoop() {
  abortAllPendingActions();
  scenarioLoopPromiseCallbacks.userTurnAction = undefined;
  scenarioLoopPromiseCallbacks.userChatAction = undefined;
  useScenarioLoopStateStore.getState().resetLoopState();
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
    await doScenarioLoopAsyncAction(() => whenScenarioCharactersLoaded());

    const restored = await doScenarioLoopAsyncAction(() => loadPersistedTurn(activeScenarioId));
    if (restored) {
      useTurnMachineStore.getState().hydrate(restored);
      useScenarioLoopStateStore.getState().setUserRequestedPhaseTransition('paused');
    }

    await runTurnLoop();
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
