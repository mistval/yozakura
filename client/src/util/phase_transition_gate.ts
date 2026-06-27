import {
  ScenarioLoopAbortSignalException,
  UserAbortSignalException,
} from '../engine/scenario_loop/flow_control.js';
import { assertNonNullish } from '../errors/application_error.js';
import { useScenarioLoopStateStore } from '../state/scenario_loop_state_store.js';
import { useScenarioStore } from '../state/scenario_store.js';

export async function withPhaseTransitionGate<T>(
  fn: (signal: AbortSignal) => Promise<T>,
  opts?: { isUserInteraction?: boolean | undefined }
): Promise<T> {
  let { userRequestedPhaseTransition } = useScenarioLoopStateStore.getState();

  // User-initiated generation (e.g. driving an NPC message while a chat is paused) must never be
  // blocked by the pause; only automatic generation waits for the user to resume.
  if (!opts?.isUserInteraction && userRequestedPhaseTransition === 'paused') {
    await new Promise((resolve, reject) => {
      const unsubscribeLoopState = useScenarioLoopStateStore.subscribe((state) => {
        userRequestedPhaseTransition = state.userRequestedPhaseTransition;
        if (userRequestedPhaseTransition !== 'paused') {
          resolve(undefined);
          unsubscribeScenarioState();
          unsubscribeLoopState();
        }
      });

      const unsubscribeScenarioState = useScenarioStore.subscribe((newState, prevState) => {
        if (newState.activeScenario?.id !== prevState.activeScenario?.id) {
          reject(new ScenarioLoopAbortSignalException());
          unsubscribeScenarioState();
          unsubscribeLoopState();
        }
      });
    });
  }

  if (userRequestedPhaseTransition === 'stopped') {
    throw new UserAbortSignalException();
  }

  const abortController = new AbortController();
  let ErrorConstructor: (new () => Error) | undefined;

  const unsubscribeLoopState = useScenarioLoopStateStore.subscribe((state) => {
    if (state.userRequestedPhaseTransition === 'stopped') {
      ErrorConstructor = UserAbortSignalException;
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
