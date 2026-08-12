import { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router';
import CharacterSelectionGrid from '../components/CharacterSelectionGrid.js';
import { useSettingsModal } from '../components/settings/SettingsModalContext.js';
import * as Database from '../backend_bridge/database.js';
import type { Character } from '../engine/types';
import { getErrorMessage } from '../errors/error_util.js';
import { useMapStore } from '../state/map_store.js';
import { assertNonNullish } from '../errors/application_error.js';
import { useScenarioCharacterStore } from '../state/scenario_character_store.js';
import { useGlobalCharactersStore } from '../state/global_character_store.js';
import { useScenarioStore } from '../state/scenario_store.js';
import { createDefaultTemporalSectionState } from '../engine/settings/settings_scripts/temporal/temporal_scripts.js';

function sortCharacters(characters: Character[]) {
  return characters.sort((a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime());
}

function StartScenarioButton({ canStart, onClick }: { canStart: boolean; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={!canStart}
      className="w-full h-20 text-4xl font-bold disabled:bg-muted flex justify-center items-center"
    >
      Start Scenario
    </button>
  );
}

export default function ScenarioSetup() {
  const navigate = useNavigate();
  const { openSettings } = useSettingsModal();
  const { globalCharacters, globalCharactersAreLoaded } = useGlobalCharactersStore();
  const maps = useMapStore((s) => s.maps);
  const mapsAreLoaded = useMapStore((s) => s.mapsAreLoaded);
  const [selectedUserCharacterId, setSelectedUserCharacterId] = useState<string | undefined>(undefined);
  const [selectedMapId, setSelectedMapId] = useState<string>('');
  const [selectedCharacterIds, setSelectedCharacterIds] = useState<string[]>([]);
  const [error, setError] = useState<string>('');
  const [installingDemo, setInstallingDemo] = useState(false);

  const sortedCharacters = useMemo(() => sortCharacters(globalCharacters), [globalCharacters]);

  useEffect(() => {
    if (!globalCharactersAreLoaded) {
      return;
    }

    const selectedCharacter = sortCharacters(globalCharacters)[0];
    if (selectedCharacter) {
      setSelectedUserCharacterId(selectedCharacter.id);
      setSelectedCharacterIds([selectedCharacter.id]);
    }
  }, [globalCharactersAreLoaded]);

  useEffect(() => {
    if (!mapsAreLoaded || selectedMapId || !maps[0]) return;
    setSelectedMapId(maps[0].id);
  }, [mapsAreLoaded, maps, selectedMapId]);

  const selectedCharacters = useMemo(() => {
    const selectedSet = new Set(selectedCharacterIds);
    return sortedCharacters.filter((character) => selectedSet.has(character.id));
  }, [sortedCharacters, selectedCharacterIds]);

  const canStart = useMemo(
    () => Boolean(selectedCharacterIds.length > 0 && selectedUserCharacterId && selectedMapId),
    [selectedCharacterIds.length, selectedUserCharacterId, selectedMapId]
  );

  const startScenario = async () => {
    try {
      setError('');
      if (!selectedUserCharacterId) {
        setError('Please select a user character.');
        return;
      }

      const selectedMap = maps.find((map) => map.id === selectedMapId);
      if (!selectedMap) {
        setError('Please select a map.');
        return;
      }

      const scenario = Database.createPersistedObject({
        mapId: selectedMap.id,
        turnNumber: 0,
        userCharacterId: '',
        temporalContext: createDefaultTemporalSectionState(),
      });

      await useScenarioStore.getState().saveImmediateInactiveScenario(scenario, { noSummaryReload: true });

      const scenarioCharacters = await useScenarioCharacterStore
        .getState()
        .copyGlobalCharactersToInactiveScenarioImmediate(selectedCharacters, scenario.id, selectedMap);

      const scenarioUserCharacterId = scenarioCharacters.find(
        (character) => character.globalCharacterId === selectedUserCharacterId
      )?.id;

      assertNonNullish(scenarioUserCharacterId, 'Selected user character not found in scenario characters.');
      await useScenarioStore.getState().saveImmediateInactiveScenario({
        ...scenario,
        userCharacterId: scenarioUserCharacterId,
      });

      navigate(`/scenario/${scenario.id}`);
    } catch (err) {
      setError(getErrorMessage(err));
    }
  };

  const handleInstallDemo = async () => {
    if (installingDemo) return;
    setInstallingDemo(true);
    try {
      await useGlobalCharactersStore.getState().installDemoCharactersGlobally();
      const loadedCharacters = useGlobalCharactersStore.getState().globalCharacters;
      const sortedCharacters = sortCharacters(loadedCharacters);
      const selectedCharacter = sortedCharacters[0];
      if (selectedCharacter && !selectedUserCharacterId) {
        setSelectedUserCharacterId(selectedCharacter.id);
        setSelectedCharacterIds([selectedCharacter.id]);
      }
    } catch (err) {
      setError(getErrorMessage(err));
    } finally {
      setInstallingDemo(false);
    }
  };

  return (
    <div className="max-w-6xl mx-auto p-6 space-y-4">
      <div className="flex justify-between">
        <h1 className="text-2xl font-semibold">Select Characters</h1>
        <div className="flex gap-2">
          <button type="button" onClick={() => navigate('/')}>
            Back
          </button>
          <button type="button" onClick={() => openSettings()} aria-label="Settings" title="Settings">
            ⚙
          </button>
        </div>
      </div>
      {error && <div className="text-danger-text text-sm">{error}</div>}

      {mapsAreLoaded && maps.length === 0 && (
        <div className="text-sm text-secondary">
          You don't have any maps yet.{' '}
          <a
            href="/maps"
            onClick={(e) => {
              e.preventDefault();
              navigate('/maps');
            }}
            className="underline text-primary hover:text-primary-strong"
          >
            Create a map
          </a>{' '}
          to start a scenario.
        </div>
      )}

      {sortedCharacters.length > 0 && maps.length > 0 && (
        <div className="space-y-1">
          <label className="block text-sm font-medium" htmlFor="map-select">
            Map
          </label>
          <select
            id="map-select"
            value={selectedMapId}
            onChange={(event) => setSelectedMapId(event.target.value)}
            className="border rounded-sm px-3 py-2 bg-inset"
          >
            {maps.map((map) => (
              <option key={map.id} value={map.id}>
                {map.name}
              </option>
            ))}
          </select>
        </div>
      )}

      {sortedCharacters.length === 0 && globalCharactersAreLoaded && (
        <div className="text-sm text-secondary">
          You don't have any characters yet.{' '}
          <a
            href="/characters"
            onClick={(e) => {
              e.preventDefault();
              navigate('/characters');
            }}
            className="underline text-primary hover:text-primary-strong"
          >
            Create characters
          </a>{' '}
          or{' '}
          <a
            href="#"
            onClick={(e) => {
              e.preventDefault();
              if (!installingDemo) void handleInstallDemo();
            }}
            className={
              installingDemo
                ? 'underline opacity-60 cursor-default'
                : 'underline cursor-pointer text-primary hover:text-primary-strong'
            }
          >
            {installingDemo ? 'Installing...' : 'install demo characters'}
          </a>
          .
        </div>
      )}

      {sortedCharacters.length > 0 && (
        <>
          <CharacterSelectionGrid
            characters={sortedCharacters}
            selectedCharacterIds={selectedCharacterIds}
            onSelectedCharacterIdsChange={setSelectedCharacterIds}
            userCharacterId={selectedUserCharacterId ?? ''}
            onUserCharacterIdChange={setSelectedUserCharacterId}
            lockedCharacterIds={selectedUserCharacterId ? [selectedUserCharacterId] : []}
            allowChangeUserCharacter={true}
          />
          <StartScenarioButton canStart={canStart} onClick={startScenario} />
        </>
      )}
    </div>
  );
}
