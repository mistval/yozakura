import { UserAbortSignalException } from '../engine/scenario_loop/flow_control.js';
import { useScenarioLoopStateStore } from '../state/scenario_loop_state_store.js';

export async function withPhaseTransitionGate<T>(fn: (signal: AbortSignal) => Promise<T>): Promise<T> {
  let { userRequestedPhaseTransition } = useScenarioLoopStateStore.getState();

  if (userRequestedPhaseTransition === 'paused') {
    await new Promise((resolve) => {
      const unsubscribe = useScenarioLoopStateStore.subscribe((state) => {
        userRequestedPhaseTransition = state.userRequestedPhaseTransition;
        if (userRequestedPhaseTransition !== 'paused') {
          unsubscribe();
          resolve(undefined);
        }
      });
    });
  }

  if (userRequestedPhaseTransition === 'stopped') {
    throw new UserAbortSignalException();
  }

  const abortController = new AbortController();

  const unsubscribe = useScenarioLoopStateStore.subscribe((state) => {
    if (state.userRequestedPhaseTransition === 'stopped') {
      abortController.abort();
    }
  });

  try {
    return await fn(abortController.signal);
  } catch (error) {
    if (abortController.signal.aborted) {
      throw new UserAbortSignalException();
    }
    throw error;
  } finally {
    unsubscribe();
  }
}
