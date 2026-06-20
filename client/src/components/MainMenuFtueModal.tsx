import { useMemo, useState } from 'react';
import { useStateRef } from '../hooks/useStateRef.js';
import { useDraft } from '../hooks/useDraft.js';
import { useLocation, useNavigate } from 'react-router-dom';
import { DEMO_CHARACTERS } from '../engine/demo_characters.js';
import YozakuraLogo from '../theme/yozakura_logo.js';
import { useSettingsStore, type Settings } from '../state/settings_store.js';
import Modal from './ui/Modal.js';
import InfoTooltip from './ui/InfoTooltip.js';
import { getErrorMessage } from '../errors/error_util.js';
import { useLlmConnectionTest } from '../hooks/useLlmConnectionTest.js';
import { useMapStore } from '../state/map_store.js';
import { assertNonNullish } from '../errors/application_error.js';
import { useGlobalCharactersStore } from '../state/global_character_store.js';
import { useScenarioCharacterStore } from '../state/scenario_character_store.js';
import { useScenarioStore } from '../state/scenario_store.js';
import {
  findBaseDefaultsLLMConfig,
  updateLLMConfigsWithBaseDefaultsConnection,
} from '../engine/settings/cascading_llm_configs.js';
import { getRequiredRandomChoice } from '../util/array.js';
import {
  BUILTIN_IMAGE_SCRIPTS,
  getBuiltinImageScript,
  resolveImageScript,
} from '../engine/settings/settings_scripts/image/image_scripts.js';
import { getImageScriptDocumentation } from '../engine/settings/settings_scripts/image/image_script_documentation.js';
import {
  setSelectedScriptId,
  useSettingsScriptSection,
} from '../engine/settings/settings_scripts/settings_scripts_store.js';
import { IMAGE_GENERATION_SECTION_ID } from '../engine/settings/settings_scripts/settings_scripts_state.js';
import CustomScriptSettings from './settings/settingsScripts/CustomScriptSettings.js';

const DEMO_MAP_ID = 'paradise_island';

const FTUE_API_URL_TOOLTIP_HTML =
  'Use an OpenAI-compatible completions API endpoint (usually an endpoint that ends in <code>/v1/chat/completions</code>).';

const FTUE_AUTH_TOKEN_TOOLTIP_HTML =
  'A bearer token is often required for cloud providers. Local/self-hosted endpoints may not require one.';

const FTUE_MODEL_TOOLTIP_HTML =
  'If your API accepts a <code>model</code> field in request bodies to specify the model to use, you can set that model here.';

const FTUE_TOKEN_STREAMING_TOOLTIP_HTML =
  'When enabled, NPC chat responses stream token-by-token while they are being generated. Your API provider must support OpenAI-compatible streaming (SSE). Most providers do support this.';

const API_SHAPE_TOOLTIP_HTML = `The AUTOMATIC1111 shape is supported by most local image generation software (including, of course, <a href="https://github.com/automatic1111/stable-diffusion-webui">AUTOMATIC1111</a>). The OpenRouter shape is for OpenRouter and might work with other providers that have similar APIs. More providers, including fully custom ones, can be configured later in Settings.`;

export default function MainMenuFtueModal() {
  const navigate = useNavigate();
  const location = useLocation();
  const llmConfigs = useSettingsStore((s) => s.llmConfigs);
  const tokenStreamingEnabled = useSettingsStore((s) => s.tokenStreamingEnabled);
  const mainMenuFtueSeen = useSettingsStore((s) => s.mainMenuFtueSeen);
  const setSettings = useSettingsStore((s) => s.setSettings);

  const imageSection = useSettingsScriptSection(IMAGE_GENERATION_SECTION_ID);

  const globalCharactersAreLoaded = useGlobalCharactersStore((s) => s.globalCharactersAreLoaded);
  const maps = useMapStore((s) => s.maps);
  const [demoStartLoading, setDemoStartLoading, demoStartLoadingRef] = useStateRef(false);
  const [demoStartError, setDemoStartError] = useState('');
  const {
    loading: llmConnectionTestLoading,
    error: llmConnectionTestError,
    success: llmConnectionTestSuccess,
    testConnection: testLlmConnectionFromHook,
  } = useLlmConnectionTest();

  const baseDefaultsConfig = useMemo(() => findBaseDefaultsLLMConfig(llmConfigs), [llmConfigs]);
  const llmModelSource = useMemo(() => {
    const meta = baseDefaultsConfig
      ? (JSON.parse(baseDefaultsConfig.llmMetaOptions) as Record<string, unknown>)
      : {};
    const model = meta.model;
    return typeof model === 'string' ? model : '';
  }, [baseDefaultsConfig?.llmMetaOptions]);

  const ftueImageControlIds = getBuiltinImageScript(imageSection.selectedScriptId)?.ftueControlIds;

  const [llmUrlDraft, setLlmUrlDraft] = useDraft(baseDefaultsConfig?.llmUrl ?? '');
  const [llmAuthTokenDraft, setLlmAuthTokenDraft] = useDraft(baseDefaultsConfig?.llmAuthToken ?? '');
  const [llmModelDraft, setLlmModelDraft] = useDraft(llmModelSource);

  const shouldRenderOnThisRoute = location.pathname === '/';
  const open = shouldRenderOnThisRoute && !mainMenuFtueSeen;

  const markFtueSeen = () => {
    setSettings(() => ({ mainMenuFtueSeen: true }));
  };

  const saveConnectionDetails = () => {
    setSettings((previous: Settings) => ({
      llmConfigs: updateLLMConfigsWithBaseDefaultsConnection(
        previous.llmConfigs,
        llmUrlDraft,
        llmAuthTokenDraft,
        llmModelDraft
      ),
    }));
  };

  const closeModal = () => {
    markFtueSeen();
    setDemoStartError('');
  };

  const startDemoSimulation = async () => {
    if (demoStartLoadingRef.current) return;
    setDemoStartLoading(true);
    setDemoStartError('');

    try {
      const { installDemoCharactersGlobally, globalCharactersById } = useGlobalCharactersStore.getState();
      const { copyGlobalCharactersToInactiveScenarioImmediate, saveInactiveScenarioCharacterImmediate } =
        useScenarioCharacterStore.getState();
      const { saveImmediateInactiveScenario, saveImmediateBlankInactiveScenario } =
        useScenarioStore.getState();

      await installDemoCharactersGlobally();

      const demoMap = maps.find((m) => m.id === DEMO_MAP_ID) || maps[0];
      assertNonNullish(demoMap, 'No maps are available.');
      const scenario = await saveImmediateBlankInactiveScenario(demoMap.id);

      const scenarioCharacters = await copyGlobalCharactersToInactiveScenarioImmediate(
        DEMO_CHARACTERS.map((demoCharacter) => globalCharactersById[demoCharacter.id] || demoCharacter),
        scenario.id,
        demoMap
      );

      let userCharacter = getRequiredRandomChoice(scenarioCharacters);
      const otherCharacter = getRequiredRandomChoice(
        scenarioCharacters.filter((c) => c.id !== userCharacter.id)
      );

      // Ensure user character spawns in same location as at least one other character
      userCharacter = {
        ...userCharacter,
        locationId: otherCharacter.locationId,
      };

      await Promise.all([
        saveInactiveScenarioCharacterImmediate(userCharacter),
        saveImmediateInactiveScenario({
          ...scenario,
          userCharacterId: userCharacter.id,
        }),
      ]);

      markFtueSeen();
      navigate(`/scenario/${scenario.id}`);
    } catch (error) {
      setDemoStartError(getErrorMessage(error));
    } finally {
      setDemoStartLoading(false);
    }
  };

  const goToCharacterManager = () => {
    markFtueSeen();
    navigate('/characters');
  };

  const handleTestConnection = () => testLlmConnectionFromHook(llmUrlDraft, llmAuthTokenDraft);

  return (
    <Modal
      open={open}
      onClose={closeModal}
      className="h-full overflow-y-auto p-4 sm:p-8"
      closeOnBackdropClick={false}
    >
      <div className="mx-auto my-4 w-full max-w-3xl rounded-xl border border-border-default bg-inset shadow-xl">
        <div className="space-y-6 p-5 sm:p-7">
          <header className="space-y-2">
            <YozakuraLogo showWordmark={false} className="mx-auto" />
            <h2 className="text-2xl font-semibold text-center">Welcome to Yozakura</h2>
            <p className="text-sm text-secondary text-center">
              Configure your AI provider connection details to get started. You can change these details later
              in Settings.
            </p>
          </header>

          <section className="space-y-3 rounded-lg border border-border-default p-4">
            <h3 className="text-lg font-semibold">Completions API Setup</h3>

            <div className="space-y-1">
              <div className="flex items-center gap-3">
                <label className="block text-sm font-medium" htmlFor="ftue-llm-url">
                  Completions API URL
                </label>
                <InfoTooltip
                  label="About Completions API URL"
                  html={FTUE_API_URL_TOOLTIP_HTML}
                  align="center"
                />
              </div>
              <input
                id="ftue-llm-url"
                value={llmUrlDraft}
                onChange={(event) => setLlmUrlDraft(event.target.value)}
                onBlur={saveConnectionDetails}
                placeholder="http://localhost:5001/v1/chat/completions"
                className="w-full rounded-sm border px-3 py-2"
              />
            </div>

            <div className="space-y-1">
              <div className="flex items-center gap-3">
                <label className="block text-sm font-medium" htmlFor="ftue-llm-token">
                  Bearer/Auth Token (optional)
                </label>
                <InfoTooltip
                  label="About Bearer/Auth Token"
                  html={FTUE_AUTH_TOKEN_TOOLTIP_HTML}
                  align="center"
                />
              </div>
              <input
                id="ftue-llm-token"
                type="password"
                value={llmAuthTokenDraft}
                onChange={(event) => setLlmAuthTokenDraft(event.target.value)}
                onBlur={saveConnectionDetails}
                placeholder="Bearer token"
                className="w-full rounded-sm border px-3 py-2"
              />
            </div>

            <div className="space-y-1">
              <div className="flex items-center gap-3">
                <label className="block text-sm font-medium" htmlFor="ftue-llm-model">
                  Model (Optional)
                </label>
                <InfoTooltip label="About Model" html={FTUE_MODEL_TOOLTIP_HTML} align="center" />
              </div>
              <input
                id="ftue-llm-model"
                value={llmModelDraft}
                onChange={(event) => setLlmModelDraft(event.target.value)}
                onBlur={saveConnectionDetails}
                placeholder="deepseek/deepseek-chat"
                className="w-full rounded-sm border px-3 py-2"
              />
            </div>

            <div className="flex items-center gap-3">
              <label className="text-sm font-medium" htmlFor="ftue-token-streaming-enabled">
                Token streaming
              </label>
              <input
                id="ftue-token-streaming-enabled"
                type="checkbox"
                checked={tokenStreamingEnabled}
                onChange={(event) => setSettings({ tokenStreamingEnabled: event.target.checked })}
                className="h-4 w-4!"
              />
              <InfoTooltip
                label="About token streaming"
                html={FTUE_TOKEN_STREAMING_TOOLTIP_HTML}
                align="center"
              />
            </div>

            <div className="flex items-center justify-end gap-3 pt-1">
              {llmConnectionTestSuccess && <p className="text-sm text-secondary">✓ Connection successful.</p>}
              <button
                type="button"
                onClick={() => void handleTestConnection()}
                disabled={llmConnectionTestLoading}
                className="px-3 py-1 border rounded-sm"
              >
                {llmConnectionTestLoading ? 'Testing...' : 'Test Connection'}
              </button>
            </div>
            {llmConnectionTestError && <div className="error-card">{llmConnectionTestError}</div>}
          </section>

          <section className="space-y-3 rounded-lg border border-border-default p-4">
            <h3 className="text-lg font-semibold">Image Generation Setup (optional)</h3>
            <p className="text-sm text-secondary">
              Configure an image generation API if you wish to use image generation features.
            </p>

            <div className="space-y-1">
              <div className="flex items-center gap-3">
                <label className="block text-sm font-medium" htmlFor="ftue-image-api-shape">
                  Provider
                </label>

                <InfoTooltip html={API_SHAPE_TOOLTIP_HTML} label="About provider" align="center" />
              </div>
              <select
                id="ftue-image-api-shape"
                value={imageSection.selectedScriptId}
                onChange={(event) => setSelectedScriptId(IMAGE_GENERATION_SECTION_ID, event.target.value)}
                className="w-full rounded-sm border px-3 py-2"
              >
                {BUILTIN_IMAGE_SCRIPTS.map((script) => (
                  <option key={script.id} value={script.id}>
                    {script.name}
                  </option>
                ))}
              </select>
            </div>

            <CustomScriptSettings
              sectionId={IMAGE_GENERATION_SECTION_ID}
              resolveScript={resolveImageScript}
              getDocumentation={getImageScriptDocumentation}
              documentationTitle="Custom Image Generation Script Documentation"
              visibleControlIds={ftueImageControlIds}
            />
          </section>

          <section className="space-y-3 rounded-lg border border-border-default p-4">
            <h3 className="text-lg font-semibold">
              Want to try Yozakura right away? Start a scenario with demo characters.
            </h3>
            <button
              type="button"
              onClick={() => void startDemoSimulation()}
              disabled={demoStartLoading || !globalCharactersAreLoaded}
            >
              {demoStartLoading ? 'Starting...' : 'Start'}
            </button>
            {demoStartError && <div className="error-card">{demoStartError}</div>}
          </section>

          <section className="space-y-3 rounded-lg border border-border-default p-4">
            <h3 className="text-lg font-semibold">Or add your own characters.</h3>
            <p>
              If you have Yozakura or SillyTavern style character card images, you can upload them here, or
              create new characters from scratch.
            </p>
            <button type="button" onClick={goToCharacterManager}>
              Go to Character Manager
            </button>
          </section>

          <footer className="flex justify-end border-t border-border-default pt-4">
            <button type="button" onClick={closeModal}>
              Close
            </button>
          </footer>
        </div>
      </div>
    </Modal>
  );
}
