import { UserAbortSignalException } from '../engine/scenario_loop/flow_control.js';
import { useScenarioLoopStateStore } from '../state/scenario_loop_state_store.js';

export async function withPhaseTransitionGate<T>(
  fn: (signal: AbortSignal) => Promise<T>,
  opts?: { isUserInteraction?: boolean | undefined }
): Promise<T> {
  let { userRequestedPhaseTransition } = useScenarioLoopStateStore.getState();

  // User-initiated generation (e.g. driving an NPC message while a chat is paused) must never be
  // blocked by the pause; only automatic generation waits for the user to resume.
  if (!opts?.isUserInteraction && userRequestedPhaseTransition === 'paused') {
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
