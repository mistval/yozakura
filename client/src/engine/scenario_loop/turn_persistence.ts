import { z } from 'zod';
import * as Database from '../../backend_bridge/database';
import {
  buildPersistedActiveChat,
  persistedActiveChatSchema,
  useActiveChatStore,
  type PersistedActiveChat,
} from '../../state/active_chat_store';
import { useScenarioStore } from '../../state/scenario_store';
import { TurnState } from './turn_state';

const serializedTurnStateSchema = z.object({
  pendingTurnCharacterIds: z.array(z.string()),
  chatsSoFar: z.record(z.string(), z.array(z.object({ withIds: z.array(z.string()) }))),
});

// A turn and its in-progress chat (if any) live together in a single row so the loop can resume
// exactly where it left off.
const persistedTurnSchema = z.object({
  turnState: serializedTurnStateSchema,
  activeChat: persistedActiveChatSchema.optional(),
});

function turnPersistenceKey(scenarioId: string) {
  return `scenario_${scenarioId}_turn`;
}

export function persistTurn(turnState: TurnState) {
  const scenario = useScenarioStore.getState().activeScenario;
  if (!scenario) {
    return;
  }

  const key = turnPersistenceKey(scenario.id);

  // Snapshot the turn and chat now, at the persist trigger point, so a debounced write reflects this
  // moment rather than whatever the loop has advanced to by the time it flushes.
  const chatState = useActiveChatStore.getState();
  const activeChat =
    chatState.chatState !== 'inactive' && chatState.transcript
      ? buildPersistedActiveChat(chatState)
      : undefined;
  const payload = { turnState: turnState.serialize(), activeChat };

  void Database.doAsDataWrite(
    async () => {
      if (useScenarioStore.getState().activeScenario?.id !== scenario.id) {
        return;
      }

      await Database.storeKeyValue(key, payload, persistedTurnSchema);
    },
    'turn',
    { debouncerKey: key }
  );
}

export async function loadPersistedTurn(
  scenarioId: string
): Promise<{ turnState: TurnState; activeChat: PersistedActiveChat | undefined } | undefined> {
  const key = turnPersistenceKey(scenarioId);

  const restored = await Database.doAsDataRead(
    () => Database.loadKeyValue(key, persistedTurnSchema),
    'turn',
    { debouncerKey: key }
  );

  if (!restored) {
    return undefined;
  }

  return {
    turnState: TurnState.deserialize(restored.turnState),
    activeChat: restored.activeChat,
  };
}

export function clearPersistedTurn(scenarioId: string) {
  const key = turnPersistenceKey(scenarioId);

  void Database.doAsDataWrite(
    async () => {
      await Database.deleteKeyValue(key);
    },
    'turn',
    { debouncerKey: key }
  );
}
