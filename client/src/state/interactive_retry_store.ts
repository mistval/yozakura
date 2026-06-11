import { create } from 'zustand';

export type InteractiveRetryOperationId = number;

type InteractiveRetryMode = 'retry_enabled' | 'retry_disabled';

type InteractiveRetryStatus =
  | 'waiting_for_retry'
  | 'retrying'
  | 'waiting_for_user_ack'
  | 'waiting_for_user_cancel_or_retry';

export type InteractiveRetryAction = 'retry_now' | 'cancel' | 'confirm';

export type InteractiveRetryCard = {
  id: InteractiveRetryOperationId;
  operationType: string;
  attempt: number;
  mode: InteractiveRetryMode;
  status: InteractiveRetryStatus;
  createdAt: number;
  retryAt?: number;
  retryDelayMs?: number;
  errorMessage: string;
  errorStack?: string;
  hint?: string;
};

type InteractiveRetryActionHandler = (
  id: InteractiveRetryOperationId,
  action: InteractiveRetryAction
) => void;

let interactiveRetryActionHandler: InteractiveRetryActionHandler | undefined = undefined;

export function registerInteractiveRetryActionHandler(handler: InteractiveRetryActionHandler) {
  interactiveRetryActionHandler = handler;
}

type InteractiveRetryStoreState = {
  operationsById: Record<number, InteractiveRetryCard>;
  orderedIds: InteractiveRetryOperationId[];
  upsertOperation: (card: InteractiveRetryCard) => void;
  removeOperation: (id: InteractiveRetryOperationId) => void;
  dispatchAction: (id: InteractiveRetryOperationId, action: InteractiveRetryAction) => void;
};

export const useInteractiveRetryStore = create<InteractiveRetryStoreState>((set, get) => ({
  operationsById: {},
  orderedIds: [],

  upsertOperation: (card) => {
    set((state) => {
      const alreadyExists = Boolean(state.operationsById[card.id]);
      return {
        operationsById: {
          ...state.operationsById,
          [card.id]: card,
        },
        orderedIds: alreadyExists ? state.orderedIds : state.orderedIds.concat(card.id),
      };
    });
  },

  removeOperation: (id) => {
    set((state) => {
      if (!state.operationsById[id]) {
        return state;
      }

      const nextOperations = { ...state.operationsById };
      delete nextOperations[id];

      return {
        operationsById: nextOperations,
        orderedIds: state.orderedIds.filter((existingId) => existingId !== id),
      };
    });
  },

  dispatchAction: (id, action) => {
    const operation = get().operationsById[id];
    if (!operation) {
      return;
    }

    if (operation.status === 'retrying') {
      return;
    }

    interactiveRetryActionHandler?.(id, action);
  },
}));
