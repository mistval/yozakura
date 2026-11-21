import { useState } from 'react';
import { useStateRef } from '../../hooks/useStateRef.js';
import SettingFieldLabel from './ui/SettingFieldLabel.js';
import { settingsDangerousHtmlTooltips, settingsTooltips } from './settings_tooltips.js';
import { useActiveScenarioMap, useScenarioStore } from '../../state/scenario_store.js';
import { DEFAULT_REMOTE_CHAT_MEDIUM } from '../../engine/types.js';
import { getErrorMessage } from '../../errors/error_util.js';
import { useMapStore } from '../../state/map_store.js';
import CustomScriptSettings from './settingsScripts/CustomScriptSettings.js';
import {
  TEMPORAL_SCRIPT_DESCRIPTOR,
  useTemporalScriptSelection,
} from './settingsScripts/temporalScriptSection.js';

function ResettableTextField({
  id,
  label,
  tooltip,
  tooltipDangerousHtml,
  value,
  placeholder,
  disabled,
  canReset,
  onChange,
  onReset,
  rows,
  className = 'space-y-1',
}: {
  id: string;
  label: string;
  tooltip?: string | undefined;
  tooltipDangerousHtml?: string | undefined;
  value: string;
  placeholder: string;
  disabled: boolean;
  canReset: boolean;
  onChange: (value: string) => void;
  onReset: () => void;
  rows?: number;
  className?: string;
}) {
  return (
    <div className={className}>
      <div className="flex items-center justify-between">
        <SettingFieldLabel
          text={label}
          htmlFor={id}
          tooltip={tooltip}
          tooltipDangerousHtml={tooltipDangerousHtml}
          className="text-sm font-medium text-primary"
        />
        {canReset && (
          <button
            type="button"
            className="text-xs text-secondary hover:text-primary"
            onClick={onReset}
            disabled={disabled}
          >
            Reset to default
          </button>
        )}
      </div>
      {rows !== undefined ? (
        <textarea
          id={id}
          className="mt-1 w-full border rounded-sm px-2 py-2 bg-inset resize-y"
          rows={rows}
          value={value}
          placeholder={placeholder}
          onChange={(e) => onChange(e.target.value)}
          disabled={disabled}
        />
      ) : (
        <input
          id={id}
          type="text"
          className="mt-1 w-full border rounded-sm px-2 py-2 bg-inset"
          value={value}
          placeholder={placeholder}
          onChange={(e) => onChange(e.target.value)}
          disabled={disabled}
        />
      )}
    </div>
  );
}

export default function ScenarioSettingsSection() {
  const scenario = useScenarioStore((state) => state.activeScenario);
  const activeMap = useActiveScenarioMap();
  const setScenarioMap = useScenarioStore((state) => state.setScenarioMap);
  const mergeMapOverrides = useScenarioStore((state) => state.mergeMapOverrides);
  const setSaveName = useScenarioStore((state) => state.setSaveName);
  const setRemoteChatMedium = useScenarioStore((state) => state.setRemoteChatMedium);
  const temporalSelection = useTemporalScriptSelection();

  const temporalSection = scenario?.temporalContext;
  const saveNameValue = scenario?.saveName ?? '';
  const hasSaveName = scenario !== undefined && scenario.saveName !== '';
  const remoteChatMediumValue = scenario?.remoteChatMedium ?? DEFAULT_REMOTE_CHAT_MEDIUM;
  const hasCustomRemoteChatMedium =
    scenario !== undefined && scenario.remoteChatMedium !== DEFAULT_REMOTE_CHAT_MEDIUM;

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

  if (!scenario) {
    return (
      <div className="space-y-4">
        <div>
          <h2 className="text-2xl font-semibold">Scenario Settings</h2>
        </div>
        <p>To change scenario settings, you must enter a scenario first.</p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div>
        <h2 className="text-2xl font-semibold">Scenario Settings</h2>
      </div>
      <ResettableTextField
        id="scenario-save-name"
        label="Save Name"
        tooltip={settingsTooltips['scenario.saveName']}
        value={saveNameValue}
        placeholder="Leave blank to show User and Map"
        disabled={!scenarioLoaded}
        canReset={hasSaveName}
        onChange={setSaveName}
        onReset={() => setSaveName('')}
        className="bordered-section space-y-1"
      />
      <div className="bordered-section">
        <div className="space-y-1">
          <SettingFieldLabel
            text="Map"
            htmlFor="scenario-active-map"
            tooltip={settingsTooltips['scenario.activeMap']}
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
        <ResettableTextField
          id="scenario-map-name"
          label="Map Name"
          tooltip={settingsTooltips['scenario.activeMapName']}
          value={nameValue}
          placeholder={baseMap?.name ?? ''}
          disabled={!scenarioLoaded}
          canReset={hasNameOverride}
          onChange={handleNameChange}
          onReset={resetNameOverride}
        />

        <ResettableTextField
          id="scenario-map-description"
          label="Map Description"
          tooltip={settingsTooltips['scenario.activeMapDescription']}
          value={descriptionValue}
          placeholder={baseMap?.description ?? ''}
          disabled={!scenarioLoaded}
          canReset={hasDescriptionOverride}
          onChange={handleDescriptionChange}
          onReset={resetDescriptionOverride}
          rows={4}
        />
      </div>

      <ResettableTextField
        id="scenario-remote-chat-medium"
        label="Remote Chat Medium"
        tooltipDangerousHtml={settingsDangerousHtmlTooltips['scenario.remoteChatMedium']}
        value={remoteChatMediumValue}
        placeholder={DEFAULT_REMOTE_CHAT_MEDIUM}
        disabled={!scenarioLoaded}
        canReset={hasCustomRemoteChatMedium}
        onChange={setRemoteChatMedium}
        onReset={() => setRemoteChatMedium(DEFAULT_REMOTE_CHAT_MEDIUM)}
        className="bordered-section space-y-1"
      />

      {temporalSection && (
        <div className="bordered-section space-y-2">
          <SettingFieldLabel
            text="Temporal Context"
            htmlFor="scenario-temporal-context"
            tooltip="Controls the date, time of day, weather, and other environmental context shown in the header and injected into character prompts."
            className="text-sm font-medium text-primary"
          />
          <CustomScriptSettings descriptor={TEMPORAL_SCRIPT_DESCRIPTOR} selection={temporalSelection} />
        </div>
      )}
    </div>
  );
}
