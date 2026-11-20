import { useEffect, useMemo, useState } from 'react';
import { useStateRef } from '../hooks/useStateRef.js';
import { useDraft } from '../hooks/useDraft.js';
import { useLocation, useNavigate } from 'react-router';
import YozakuraLogo from '../theme/yozakura_logo.js';
import { useSettingsStore, type Settings } from '../state/settings_store.js';
import { useModalPanelClasses } from '../hooks/use_mobile_layout.js';
import { useScenarioStore } from '../state/scenario_store.js';
import Modal from './ui/Modal.js';
import InfoTooltip from './ui/InfoTooltip.js';
import { getErrorMessage } from '../errors/error_util.js';
import { useLlmConnectionTest } from '../hooks/useLlmConnectionTest.js';
import {
  findBaseDefaultsLLMConfig,
  updateLLMConfigsWithBaseDefaultsConnection,
} from '../engine/settings/cascading_llm_configs.js';
import { getBuiltinImageScript } from '../engine/settings/settings_scripts/image/image_scripts.js';
import CustomScriptSettings from './settings/settingsScripts/CustomScriptSettings.js';
import {
  IMAGE_SCRIPT_DESCRIPTOR,
  useImageScriptSelection,
} from './settings/settingsScripts/imageScriptSection.js';

const FTUE_API_URL_TOOLTIP_HTML =
  'Use an OpenAI-compatible completions API endpoint (usually an endpoint that ends in <code>/v1/chat/completions</code>).';

const FTUE_AUTH_TOKEN_TOOLTIP_HTML =
  'A bearer token is often required for cloud providers. Local/self-hosted endpoints may not require one.';

const FTUE_MODEL_TOOLTIP_HTML =
  'If your API accepts a <code>model</code> field in request bodies to specify the model to use, you can set that model here.';

const MOBILE_DEFAULT_COMPLETIONS_URL = 'https://openrouter.ai/api/v1/chat/completions';
const MOBILE_DEFAULT_MODEL = 'deepseek/deepseek-v4.1-flash-1017';

const FTUE_SECTION_CLASS = 'space-y-3 rounded-lg border border-[#31234a]! bg-[#0f0a1c]/90 p-4';
const FTUE_INPUT_CLASS =
  'w-full rounded-sm border border-[#463464]! bg-[#07050d]! px-3 py-2 placeholder:text-[#866ca2] focus:border-[#9668bd]! focus:outline-none';
const FTUE_BUTTON_CLASS = 'border-[#4a3769]! bg-[#161028]! hover:bg-[#22193b]!';

export default function MainMenuFtueModal() {
  const navigate = useNavigate();
  const location = useLocation();
  const llmConfigs = useSettingsStore((s) => s.llmConfigs);
  const mainMenuFtueSeen = useSettingsStore((s) => s.mainMenuFtueSeen);
  const setSettings = useSettingsStore((s) => s.setSettings);
  const { outerClassName, panelClassName } = useModalPanelClasses({
    maxWidthClassName: 'max-w-3xl',
    surfaceClassName: 'bg-[#090612]!',
    desktopPanelClassName: 'rounded-xl border border-[#3a2a54]! shadow-xl p-5 sm:p-7 space-y-6',
  });

  const imageSelection = useImageScriptSelection();

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

  const ftueImageControlIds = getBuiltinImageScript(imageSelection.selectedScriptId)?.ftueControlIds;

  const [llmUrlDraft, setLlmUrlDraft] = useDraft(baseDefaultsConfig?.llmUrl ?? '');
  const [llmAuthTokenDraft, setLlmAuthTokenDraft] = useDraft(baseDefaultsConfig?.llmAuthToken ?? '');
  const [llmModelDraft, setLlmModelDraft] = useDraft(llmModelSource);

  const shouldRenderOnThisRoute = location.pathname === '/';
  const open = shouldRenderOnThisRoute && !mainMenuFtueSeen;

  useEffect(() => {
    if (!open) {
      return;
    }

    const isMobile = window.innerWidth < 768;

    if (isMobile) {
      setSettings((previous: Settings) => ({
        chatPaneWidth: 'mobile',
        llmConfigs: updateLLMConfigsWithBaseDefaultsConnection(
          previous.llmConfigs,
          MOBILE_DEFAULT_COMPLETIONS_URL,
          findBaseDefaultsLLMConfig(previous.llmConfigs)?.llmAuthToken ?? '',
          MOBILE_DEFAULT_MODEL
        ),
      }));
    }
  }, [open, setSettings]);

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
      const { newScenarioId } = await useScenarioStore.getState().importDemoScenario();
      markFtueSeen();
      navigate(`/scenario/${newScenarioId}`);
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
    <Modal open={open} onClose={closeModal} closeOnBackdropClick={false}>
      <div className={outerClassName}>
        <div className={panelClassName}>
          <header className="space-y-2">
            <YozakuraLogo showWordmark={false} className="mx-auto" />
            <h2 className="text-2xl font-semibold text-center">Welcome to Yozakura</h2>
            <p className="text-sm text-secondary text-center">
              Configure your AI provider connection details to get started. You can change these details later
              in Settings.
            </p>
          </header>

          <section className={FTUE_SECTION_CLASS}>
            <h3 className="text-lg font-semibold">Completions API Setup</h3>

            <div className="space-y-1">
              <div className="flex items-center gap-3">
                <label className="block text-sm font-medium" htmlFor="ftue-llm-url">
                  Completions API URL
                </label>
                <InfoTooltip
                  label="About Completions API URL"
                  dangerouslySetHtml={FTUE_API_URL_TOOLTIP_HTML}
                  align="center"
                />
              </div>
              <input
                id="ftue-llm-url"
                value={llmUrlDraft}
                onChange={(event) => setLlmUrlDraft(event.target.value)}
                onBlur={saveConnectionDetails}
                placeholder="http://localhost:5001/v1/chat/completions"
                className={FTUE_INPUT_CLASS}
              />
            </div>

            <div className="space-y-1">
              <div className="flex items-center gap-3">
                <label className="block text-sm font-medium" htmlFor="ftue-llm-token">
                  Bearer/Auth Token (optional)
                </label>
                <InfoTooltip
                  label="About Bearer/Auth Token"
                  value={FTUE_AUTH_TOKEN_TOOLTIP_HTML}
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
                className={FTUE_INPUT_CLASS}
              />
            </div>

            <div className="space-y-1">
              <div className="flex items-center gap-3">
                <label className="block text-sm font-medium" htmlFor="ftue-llm-model">
                  Model (Optional)
                </label>
                <InfoTooltip
                  label="About Model"
                  dangerouslySetHtml={FTUE_MODEL_TOOLTIP_HTML}
                  align="center"
                />
              </div>
              <input
                id="ftue-llm-model"
                value={llmModelDraft}
                onChange={(event) => setLlmModelDraft(event.target.value)}
                onBlur={saveConnectionDetails}
                placeholder="deepseek/deepseek-v4.1-flash-1017"
                className={FTUE_INPUT_CLASS}
              />
            </div>

            <div className="flex items-center justify-end gap-3 pt-1">
              {llmConnectionTestSuccess && <p className="text-sm text-secondary">✓ Connection successful.</p>}
              <button
                type="button"
                onClick={() => void handleTestConnection()}
                disabled={llmConnectionTestLoading}
                className={`px-3 py-1 border rounded-sm ${FTUE_BUTTON_CLASS}`}
              >
                {llmConnectionTestLoading ? 'Testing...' : 'Test Connection'}
              </button>
            </div>
            {llmConnectionTestError && <div className="error-card">{llmConnectionTestError}</div>}
          </section>

          <section className={FTUE_SECTION_CLASS}>
            <h3 className="text-lg font-semibold">Image Generation Setup (optional)</h3>
            <p className="text-sm text-secondary">
              Configure an image generation API if you wish to use image generation features.
            </p>

            <div className="[&_input:not([type='checkbox'])]:border-[#463464]! [&_input:not([type='checkbox'])]:bg-[#07050d]! [&_input:not([type='checkbox'])]:placeholder:text-[#866ca2] [&_select]:border-[#463464]! [&_select]:bg-[#07050d]!">
              <CustomScriptSettings
                descriptor={IMAGE_SCRIPT_DESCRIPTOR}
                selection={imageSelection}
                visibleControlIds={ftueImageControlIds}
              />
            </div>
          </section>

          <section className={FTUE_SECTION_CLASS}>
            <h3 className="text-lg font-semibold">
              Want to try Yozakura right away? Start a scenario with demo characters.
            </h3>
            <button
              type="button"
              onClick={() => void startDemoSimulation()}
              disabled={demoStartLoading}
              className={FTUE_BUTTON_CLASS}
            >
              {demoStartLoading ? 'Starting...' : 'Start'}
            </button>
            {demoStartError && <div className="error-card">{demoStartError}</div>}
          </section>

          <section className={FTUE_SECTION_CLASS}>
            <h3 className="text-lg font-semibold">Or add your own characters.</h3>
            <p>
              If you have Yozakura or SillyTavern style character card images, you can upload them here, or
              create new characters from scratch.
            </p>
            <button type="button" onClick={goToCharacterManager} className={FTUE_BUTTON_CLASS}>
              Go to Character Manager
            </button>
          </section>

          <footer className="flex justify-end border-t border-[#31234a]! pt-4">
            <button type="button" onClick={closeModal} className={FTUE_BUTTON_CLASS}>
              Close
            </button>
          </footer>
        </div>
      </div>
    </Modal>
  );
}
