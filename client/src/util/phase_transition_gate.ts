import {
  UserAbortCurrentGenerationSignalException,
  ScenarioLoopAbortSignalException,
  UserPauseSignalException,
  UserStopSignalException,
} from '../engine/scenario_loop/flow_control.js';
import { useScenarioLoopStateStore } from '../state/scenario_loop_state_store.js';
import { useScenarioStore } from '../state/scenario_store.js';

export type PhaseTransitionGateOptions = { pauseBehavior?: 'abort' | 'ignore' };

export async function withPhaseTransitionGate<T>(
  fn: (signal: AbortSignal) => Promise<T>,
  opts?: PhaseTransitionGateOptions
): Promise<T> {
  const pauseBehavior = opts?.pauseBehavior ?? 'wait';
  const loopState = useScenarioLoopStateStore.getState();

  if (loopState.userRequestedPhaseTransition === 'paused' && pauseBehavior === 'abort') {
    throw new UserPauseSignalException();
  }

  if (loopState.userRequestedPhaseTransition === 'stopped') {
    throw new UserStopSignalException();
  }

  if (loopState.userRequestedGenerationAbort) {
    loopState.setUserRequestedGenerationAbort(false);
    throw new UserAbortCurrentGenerationSignalException();
  }

  const abortController = new AbortController();

  let onCatch = () => {};

  const unsubscribeLoopState = useScenarioLoopStateStore.subscribe((state) => {
    if (state.userRequestedPhaseTransition === 'stopped') {
      onCatch = () => {
        throw new UserStopSignalException();
      };
      abortController.abort();
    }

    if (state.userRequestedPhaseTransition === 'paused' && pauseBehavior === 'abort') {
      onCatch = () => {
        throw new UserPauseSignalException();
      };
      abortController.abort();
    }

    if (state.userRequestedGenerationAbort) {
      onCatch = () => {
        useScenarioLoopStateStore.getState().setUserRequestedGenerationAbort(false);
        throw new UserAbortCurrentGenerationSignalException();
      };
      abortController.abort();
    }
  });

  const unsubscribeScenarioState = useScenarioStore.subscribe((newState, prevState) => {
    if (newState.activeScenario?.id !== prevState.activeScenario?.id) {
      onCatch = () => {
        throw new ScenarioLoopAbortSignalException();
      };
      abortController.abort();
    }
  });

  try {
    return await fn(abortController.signal);
  } catch (error) {
    if (abortController.signal.aborted) {
      onCatch();
    }

    throw error;
  } finally {
    unsubscribeLoopState();
    unsubscribeScenarioState();
  }
}
