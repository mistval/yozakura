import { useState } from 'react';
import { useStateRef } from '../../hooks/useStateRef.js';
import SettingFieldLabel from './ui/SettingFieldLabel.js';
import { settingsTooltips } from './settings_tooltips.js';
import { useScenarioStore } from '../../state/scenario_store.js';
import { getErrorMessage } from '../../errors/error_util.js';
import { useMapStore } from '../../state/map_store.js';
import CustomScriptSettings from './settingsScripts/CustomScriptSettings.js';
import {
  TEMPORAL_SCRIPT_DESCRIPTOR,
  useTemporalScriptSelection,
} from './settingsScripts/temporalScriptSection.js';

export default function ScenarioSettingsSection() {
  const scenario = useScenarioStore((state) => state.activeScenario);
  const activeMap = useScenarioStore((state) => state.activeScenarioMap);
  const setScenarioMap = useScenarioStore((state) => state.setScenarioMap);
  const mergeMapOverrides = useScenarioStore((state) => state.mergeMapOverrides);
  const temporalSelection = useTemporalScriptSelection();

  const temporalSection = scenario?.temporalContext;

  const maps = useMapStore((s) => s.maps);
  const mapsAreLoaded = useMapStore((s) => s.mapsAreLoaded);
  const baseMap = maps.find((map) => map.id === scenario?.mapId);

  const [mapsError, setMapsError] = useState('');
  const [mapSaving, setMapSaving, mapSavingRef] = useStateRef(false);

  const scenarioLoaded = Boolean(scenario);
  const currentMapId = scenario?.mapId || activeMap?.id || '';

  const mapOverrides = scenario?.mapOverrides;
  const hasNameOverride = mapOverrides?.name !== undefined;
  const hasDescriptionOverride = mapOverrides?.description !== undefined;

  const nameValue = mapOverrides?.name ?? baseMap?.name ?? '';
  const descriptionValue = mapOverrides?.description ?? baseMap?.description ?? '';

  const handleMapChange = async (nextMapId: string) => {
    if (mapSavingRef.current) return;
    setMapSaving(true);
    setMapsError('');
    try {
      await setScenarioMap(nextMapId);
    } catch (error) {
      setMapsError(getErrorMessage(error));
    } finally {
      setMapSaving(false);
    }
  };

  const handleNameChange = (value: string) => {
    mergeMapOverrides({
      name: value,
    });
  };

  const handleDescriptionChange = (value: string) => {
    mergeMapOverrides({
      description: value,
    });
  };

  const resetNameOverride = () => {
    mergeMapOverrides({
      name: undefined,
    });
  };

  const resetDescriptionOverride = () => {
    mergeMapOverrides({
      description: undefined,
    });
  };

  return (
    <div className="space-y-4">
      <div>
        <h2 className="text-2xl font-semibold">Scenario Settings</h2>
      </div>
      <div className="bordered-section">
        <div className="space-y-1">
          <SettingFieldLabel
            text="Map"
            htmlFor="scenario-active-map"
            tooltipHtml={settingsTooltips['scenario.activeMap']}
            className="text-sm font-medium text-primary"
          />
          <select
            id="scenario-active-map"
            className="mt-1 w-full border rounded-sm px-2 py-2 bg-inset"
            value={currentMapId}
            onChange={(event) => {
              void handleMapChange(event.target.value);
            }}
            disabled={!scenarioLoaded || !mapsAreLoaded || mapSaving || maps.length === 0}
          >
            {maps.length === 0 && (
              <option value="" disabled>
                {!mapsAreLoaded ? 'Loading maps...' : 'No maps available'}
              </option>
            )}
            {maps.map((map) => (
              <option key={map.id} value={map.id}>
                {map.name}
              </option>
            ))}
          </select>
        </div>
        {!scenarioLoaded && <p className="text-sm text-secondary">No active scenario loaded.</p>}
        {mapSaving && <p className="text-sm text-secondary">Updating map...</p>}
        {mapsError && <p className="text-sm text-danger-text">{mapsError}</p>}
      </div>

      <div className="bordered-section space-y-4">
        <div className="space-y-1">
          <div className="flex items-center justify-between">
            <SettingFieldLabel
              text="Map Name"
              htmlFor="scenario-map-name"
              tooltipHtml={settingsTooltips['scenario.activeMapName']}
              className="text-sm font-medium text-primary"
            />
            {hasNameOverride && (
              <button
                type="button"
                className="text-xs text-secondary hover:text-primary"
                onClick={resetNameOverride}
                disabled={!scenarioLoaded}
              >
                Reset to default
              </button>
            )}
          </div>
          <input
            id="scenario-map-name"
            type="text"
            className="mt-1 w-full border rounded-sm px-2 py-2 bg-inset"
            value={nameValue}
            placeholder={baseMap?.name ?? ''}
            onChange={(e) => handleNameChange(e.target.value)}
            disabled={!scenarioLoaded}
          />
        </div>

        <div className="space-y-1">
          <div className="flex items-center justify-between">
            <SettingFieldLabel
              text="Map Description"
              htmlFor="scenario-map-description"
              tooltipHtml={settingsTooltips['scenario.activeMapDescription']}
              className="text-sm font-medium text-primary"
            />
            {hasDescriptionOverride && (
              <button
                type="button"
                className="text-xs text-secondary hover:text-primary"
                onClick={resetDescriptionOverride}
                disabled={!scenarioLoaded}
              >
                Reset to default
              </button>
            )}
          </div>
          <textarea
            id="scenario-map-description"
            className="mt-1 w-full border rounded-sm px-2 py-2 bg-inset resize-y"
            rows={4}
            value={descriptionValue}
            placeholder={baseMap?.description ?? ''}
            onChange={(e) => handleDescriptionChange(e.target.value)}
            disabled={!scenarioLoaded}
          />
        </div>
      </div>

      {temporalSection && (
        <div className="bordered-section space-y-2">
          <SettingFieldLabel
            text="Temporal Context"
            htmlFor="scenario-temporal-context"
            tooltipHtml="Controls the date, time of day, weather, and other environmental context shown in the header and injected into character prompts."
            className="text-sm font-medium text-primary"
          />
          <CustomScriptSettings descriptor={TEMPORAL_SCRIPT_DESCRIPTOR} selection={temporalSelection} />
        </div>
      )}
    </div>
  );
}
