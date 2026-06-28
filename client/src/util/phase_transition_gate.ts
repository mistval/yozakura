import {
  ScenarioLoopAbortSignalException,
  UserPauseSignalException,
  UserStopSignalException,
} from '../engine/scenario_loop/flow_control.js';
import { assertNonNullish } from '../errors/application_error.js';
import { useScenarioLoopStateStore } from '../state/scenario_loop_state_store.js';
import { useScenarioStore } from '../state/scenario_store.js';

export type PhaseTransitionGateOptions = { pauseBehavior?: 'abort' | 'ignore' };

export async function withPhaseTransitionGate<T>(
  fn: (signal: AbortSignal) => Promise<T>,
  opts?: PhaseTransitionGateOptions
): Promise<T> {
  const pauseBehavior = opts?.pauseBehavior ?? 'wait';
  let { userRequestedPhaseTransition } = useScenarioLoopStateStore.getState();

  if (userRequestedPhaseTransition === 'paused' && pauseBehavior === 'abort') {
    throw new UserPauseSignalException();
  }

  if (userRequestedPhaseTransition === 'stopped') {
    throw new UserStopSignalException();
  }

  const abortController = new AbortController();
  let ErrorConstructor: (new () => Error) | undefined;

  const unsubscribeLoopState = useScenarioLoopStateStore.subscribe((state) => {
    if (state.userRequestedPhaseTransition === 'stopped') {
      ErrorConstructor = UserStopSignalException;
      abortController.abort();
    }

    if (state.userRequestedPhaseTransition === 'paused' && pauseBehavior === 'abort') {
      ErrorConstructor = UserPauseSignalException;
      abortController.abort();
    }
  });

  const unsubscribeScenarioState = useScenarioStore.subscribe((newState, prevState) => {
    if (newState.activeScenario?.id !== prevState.activeScenario?.id) {
      ErrorConstructor = ScenarioLoopAbortSignalException;
      abortController.abort();
    }
  });

  try {
    return await fn(abortController.signal);
  } catch (error) {
    if (abortController.signal.aborted) {
      assertNonNullish(ErrorConstructor);
      throw new ErrorConstructor();
    }

    throw error;
  } finally {
    unsubscribeLoopState();
    unsubscribeScenarioState();
  }
}
