import * as Database from '../../backend_bridge/database';
import {
  serializedTurnSchema,
  useTurnMachineStore,
  type SerializedTurn,
} from '../../state/active_chat_store';
import { useScenarioStore } from '../../state/scenario_store';

function turnPersistenceKey(scenarioId: string) {
  return `scenario_${scenarioId}_turn`;
}

export function persistTurn() {
  const scenario = useScenarioStore.getState().activeScenario;
  if (!scenario) {
    return;
  }

  const snapshot = useTurnMachineStore.getState().serialize();
  const key = turnPersistenceKey(scenario.id);

  void Database.doAsDataWrite(
    async () => {
      if (useScenarioStore.getState().activeScenario?.id !== scenario.id) {
        return;
      }

      if (snapshot === undefined) {
        await Database.deleteKeyValue(key);
      } else {
        await Database.storeKeyValue(key, snapshot, serializedTurnSchema);
      }
    },
    'turn',
    { debouncerKey: key }
  );
}

export async function loadPersistedTurn(scenarioId: string): Promise<SerializedTurn | undefined> {
  const key = turnPersistenceKey(scenarioId);

  return Database.doAsDataRead(() => Database.loadKeyValue(key, serializedTurnSchema), 'turn', {
    debouncerKey: key,
  });
}
