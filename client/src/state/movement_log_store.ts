import { create } from 'zustand';
import type { MovementPolicy } from '../engine/types.js';
import { newId } from '../util/id.js';
import { useScenarioStore } from './scenario_store.js';

export interface MovementLogEntry {
  id: string;
  characterId: string;
  characterName: string;
  movementPolicy: MovementPolicy | undefined;
  fromLocationName: string;
  toLocationName: string;
}

const MAX_ENTRIES = 500;

type MovementLogStoreState = {
  entries: MovementLogEntry[];
  recordMovement: (entry: Omit<MovementLogEntry, 'id'>) => void;
  clear: () => void;
};

export const useMovementLogStore = create<MovementLogStoreState>((set, get) => ({
  entries: [],
  recordMovement: (entry) => {
    set({ entries: [{ id: newId(), ...entry }, ...get().entries].slice(0, MAX_ENTRIES) });
  },
  clear: () => set({ entries: [] }),
}));

useScenarioStore.subscribe((newState, prevState) => {
  if (newState.activeScenario?.id !== prevState.activeScenario?.id) {
    useMovementLogStore.getState().clear();
  }
});
