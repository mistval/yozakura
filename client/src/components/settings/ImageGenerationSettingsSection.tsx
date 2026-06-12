import { useMemo, useState } from 'react';
import { imageApiShapes, useSettingsStore, type ImageApiShape } from '../../state/settings_store.js';
import { useImageConnectionTest } from '../../hooks/useImageConnectionTest.js';
import CheckboxSettingRow from './ui/CheckboxSettingRow.js';
import NumericSettingRow from './ui/NumericSettingRow.js';
import RangeNumberInput from './ui/RangeNumberInput.js';
import SettingFieldLabel from './ui/SettingFieldLabel.js';
import { settingsTooltips } from './settings_tooltips.js';

import { clampUnitRate, toPercent } from '../../util/numeric.js';

const OPENROUTER_SIZE_OPTIONS = [
  { label: '0.5K (Gemini Only)', value: '0.5K' },
  { label: '1K (Standard Res)', value: '1K' },
  { label: '2K (High Res)', value: '2K' },
  { label: '4K (Ultra Res)', value: '4K' },
];

const OPENROUTER_ASPECT_OPTIONS = [
  { label: '1:1', value: '1:1' },
  { label: '2:3', value: '2:3' },
  { label: '3:2', value: '3:2' },
  { label: '3:4', value: '3:4' },
  { label: '4:3', value: '4:3' },
  { label: '4:5', value: '4:5' },
  { label: '5:4', value: '5:4' },
  { label: '9:16', value: '9:16' },
  { label: '16:9', value: '16:9' },
  { label: '21:9', value: '21:9' },
  { label: '1:4 (Gemini Only)', value: '1:4' },
  { label: '4:1 (Gemini Only)', value: '4:1' },
  { label: '1:8 (Gemini Only)', value: '1:8' },
  { label: '8:1 (Gemini Only)', value: '8:1' },
];

function OpenRouterSizeSettings() {
  const imageApiShape = useSettingsStore((s) => s.imageApiShape);
  const imageSettingsForShape = useSettingsStore((s) => s.imageSettingsForShape);
  const setSettings = useSettingsStore((s) => s.setSettings);

  const currentSettings = useMemo(() => {
    return (
      imageSettingsForShape.openRouter ||
      imageApiShapes.find((config) => config.shape === 'openRouter')!.defaultSettings
    );
  }, [imageApiShape, imageSettingsForShape]);

  const updateSizeOptions = (partial: Record<string, unknown>) => {
    const nextSize = { ...(currentSettings.sizeOptions || {}), ...partial };

    setSettings({
      imageSettingsForShape: {
        openRouter: {
          sizeOptions: nextSize,
        },
      },
    });
  };

  return (
    <div className="grid grid-cols-1 md:grid-cols-2 gap-3 pt-1">
      <div className="space-y-2">
        <div className="text-xs text-muted flex items-center justify-between gap-3">
          <SettingFieldLabel text="Chat Image Size" htmlFor="openrouter-chat-size" />
          <select
            id="openrouter-chat-size"
            value={currentSettings.sizeOptions.chatImageSize}
            onChange={(e) => updateSizeOptions({ chatImageSize: e.target.value })}
            className="w-36 rounded-input"
          >
            {OPENROUTER_SIZE_OPTIONS.map((opt) => (
              <option key={opt.value} value={opt.value}>
                {opt.label}
              </option>
            ))}
          </select>
        </div>

        <div className="text-xs text-muted flex items-center justify-between gap-3">
          <SettingFieldLabel text="Chat Image Aspect Ratio" htmlFor="openrouter-chat-aspect" />
          <select
            id="openrouter-chat-aspect"
            value={currentSettings.sizeOptions.chatImageAspectRatio}
            onChange={(e) => updateSizeOptions({ chatImageAspectRatio: e.target.value })}
            className="w-32 rounded-input"
          >
            {OPENROUTER_ASPECT_OPTIONS.map((opt) => (
              <option key={opt.value} value={opt.value}>
                {opt.label}
              </option>
            ))}
          </select>
        </div>
      </div>

      <div className="space-y-2">
        <div className="text-xs text-muted flex items-center justify-between gap-3">
          <SettingFieldLabel text="Card Image Size" htmlFor="openrouter-card-size" />
          <select
            id="openrouter-card-size"
            value={currentSettings.sizeOptions.cardImageSize}
            onChange={(e) => updateSizeOptions({ cardImageSize: e.target.value })}
            className="w-36 rounded-input"
          >
            {OPENROUTER_SIZE_OPTIONS.map((opt) => (
              <option key={opt.value} value={opt.value}>
                {opt.label}
              </option>
            ))}
          </select>
        </div>

        <div className="text-xs text-muted flex items-center justify-between gap-3">
          <SettingFieldLabel text="Card Image Aspect Ratio" htmlFor="openrouter-card-aspect" />
          <select
            id="openrouter-card-aspect"
            value={currentSettings.sizeOptions.cardImageAspectRatio}
            onChange={(e) => updateSizeOptions({ cardImageAspectRatio: e.target.value })}
            className="w-32 rounded-input"
          >
            {OPENROUTER_ASPECT_OPTIONS.map((opt) => (
              <option key={opt.value} value={opt.value}>
                {opt.label}
              </option>
            ))}
          </select>
        </div>
      </div>
    </div>
  );
}

function Automatic1111SizeSettings() {
  const imageApiShape = useSettingsStore((s) => s.imageApiShape);
  const imageSettingsForShape = useSettingsStore((s) => s.imageSettingsForShape);
  const setSettings = useSettingsStore((s) => s.setSettings);

  const currentSettings = useMemo(() => {
    return (
      imageSettingsForShape.automatic1111 ||
      imageApiShapes.find((config) => config.shape === 'automatic1111')!.defaultSettings
    );
  }, [imageApiShape, imageSettingsForShape]);

  const updateSizeOptions = (partial: Record<string, unknown>) => {
    const nextSize = { ...(currentSettings.sizeOptions || {}), ...partial };

    setSettings({
      imageSettingsForShape: {
        automatic1111: {
          sizeOptions: nextSize,
        },
      },
    });
  };

  return (
    <div className="grid grid-cols-1 md:grid-cols-2 gap-3 pt-1">
      <NumericSettingRow
        id="image-width"
        label="Chat image width (px)"
        tooltipHtml={settingsTooltips['image.width']}
        min={1}
        value={currentSettings.sizeOptions.chatImageWidth}
        onChange={(nextValue) => updateSizeOptions({ chatImageWidth: Math.max(1, nextValue || 1) })}
        inputClassName="w-28 border rounded-sm px-2 py-1"
      />
      <NumericSettingRow
        id="image-height"
        label="Chat image height (px)"
        tooltipHtml={settingsTooltips['image.height']}
        min={1}
        value={currentSettings.sizeOptions.chatImageHeight}
        onChange={(nextValue) => updateSizeOptions({ chatImageHeight: Math.max(1, nextValue || 1) })}
        inputClassName="w-28 border rounded-sm px-2 py-1"
      />
      <NumericSettingRow
        id="image-card-width"
        label="Character card width (px)"
        tooltipHtml={settingsTooltips['image.cardWidth']}
        min={1}
        value={currentSettings.sizeOptions.cardImageWidth}
        onChange={(nextValue) => updateSizeOptions({ cardImageWidth: Math.max(1, nextValue || 1) })}
        inputClassName="w-28 border rounded-sm px-2 py-1"
      />
      <NumericSettingRow
        id="image-card-height"
        label="Character card height (px)"
        tooltipHtml={settingsTooltips['image.cardHeight']}
        min={1}
        value={currentSettings.sizeOptions.cardImageHeight}
        onChange={(nextValue) => updateSizeOptions({ cardImageHeight: Math.max(1, nextValue || 1) })}
        inputClassName="w-28 border rounded-sm px-2 py-1"
      />
    </div>
  );
}

export default function ImageGenerationSettingsSection() {
  const imageApiShape = useSettingsStore((s) => s.imageApiShape);
  const imageSettingsForShape = useSettingsStore((s) => s.imageSettingsForShape);
  const imagePromptPrefix = useSettingsStore((s) => s.imagePromptPrefix);
  const editImagePromptsBeforeDispatch = useSettingsStore((s) => s.editImagePromptsBeforeDispatch);
  const autoImageRate = useSettingsStore((s) => s.autoImageRate);
  const autoImageNpcOnly = useSettingsStore((s) => s.autoImageNpcOnly);
  const setSettings = useSettingsStore((s) => s.setSettings);
  const [showAuthToken, setShowAuthToken] = useState(false);
  const [metaOptionsSource, setMetaOptionsSource] = useState<string | undefined>(undefined);
  const [metaOptionsError, setMetaOptionsError] = useState('');
  const {
    loading: connectionTestLoading,
    error: connectionTestError,
    success: connectionTestSuccess,
    testConnection,
    clearError: clearConnectionTestError,
  } = useImageConnectionTest();

  const currentSettings = useMemo(() => {
    return (
      imageSettingsForShape[imageApiShape] ||
      imageApiShapes.find((config) => config.shape === imageApiShape)!.defaultSettings
    );
  }, [imageApiShape, imageSettingsForShape]);

  const currentShapeConfig = useMemo(() => {
    return imageApiShapes.find((config) => config.shape === imageApiShape)!;
  }, [imageApiShape]);

  const metaOptionsFieldValue = metaOptionsSource ?? currentSettings.metaOptions;

  const updateSettingsForCurrentShape = <T extends keyof typeof currentSettings>(
    fieldName: T,
    nextValue: (typeof currentSettings)[T]
  ) => {
    setSettings((previous) => ({
      imageSettingsForShape: {
        [previous.imageApiShape]: {
          [fieldName]: nextValue,
        },
      },
    }));
  };

  const applyMetaOptionsSource = (source: string) => {
    setMetaOptionsSource(source);
    setMetaOptionsError('');
    let parsed: unknown;
    try {
      parsed = JSON.parse(source);
    } catch {
      setMetaOptionsError('Meta Options must be valid JSON.');
      return;
    }

    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
      setMetaOptionsError('Meta Options must be a JSON object.');
      return;
    }

    updateSettingsForCurrentShape('metaOptions', source);
  };

  const handleShapeChange = (nextShape: ImageApiShape) => {
    setMetaOptionsSource(undefined);
    setMetaOptionsError('');
    clearConnectionTestError();
    setSettings({ imageApiShape: nextShape });
  };

  const resetToDefault = () => {
    const source = currentShapeConfig.defaultSettings.metaOptions;
    setMetaOptionsSource(source);
    setMetaOptionsError('');

    setSettings((previous) => ({
      imageSettingsForShape: {
        [previous.imageApiShape]: currentShapeConfig.defaultSettings,
      },
    }));
  };

  const handleTestConnection = () =>
    testConnection(currentSettings.url, currentSettings.authToken, currentShapeConfig.shape);

  return (
    <div className="space-y-4">
      <div>
        <h2 className="text-2xl font-semibold">Image Generation</h2>
        <p className="text-sm text-secondary">
          Configure image prompts, auto image behavior, and generated image dimensions.
        </p>
      </div>
      <div className="bordered-section">
        <div className="space-y-1">
          <SettingFieldLabel
            text="API Shape"
            htmlFor="image-api-shape"
            tooltipHtml={settingsTooltips['image.apiShape']}
          />
          <select
            id="image-api-shape"
            value={currentShapeConfig.shape}
            onChange={(event) => handleShapeChange(event.target.value as ImageApiShape)}
            className="rounded-input"
          >
            {imageApiShapes.map((shape) => (
              <option key={shape.shape} value={shape.shape}>
                {shape.label}
              </option>
            ))}
          </select>
        </div>

        <SettingFieldLabel
          text="Image API URL"
          htmlFor="image-api-url"
          tooltipHtml={settingsTooltips['image.apiUrl']}
        />
        <input
          id="image-api-url"
          type="url"
          value={currentSettings.url}
          onChange={(event) => updateSettingsForCurrentShape('url', event.target.value)}
          placeholder={currentShapeConfig.defaultSettings.url}
          className="rounded-input"
        />

        <div className="space-y-1">
          <SettingFieldLabel
            text="Bearer Token (optional)"
            htmlFor="image-auth-token"
            tooltipHtml={settingsTooltips['image.authToken']}
          />
          <div className="flex gap-2">
            <input
              id="image-auth-token"
              type={showAuthToken ? 'text' : 'password'}
              value={currentSettings.authToken}
              onChange={(event) => updateSettingsForCurrentShape('authToken', event.target.value)}
              placeholder="Bearer token"
              className="rounded-input"
            />
            <button
              type="button"
              onClick={() => setShowAuthToken((prev) => !prev)}
              className="shrink-0 px-2 py-1 border rounded-sm"
            >
              {showAuthToken ? 'Hide' : 'Show'}
            </button>
          </div>
        </div>

        <div className="space-y-1">
          <SettingFieldLabel
            text={`Meta Options – ${currentShapeConfig.label} (JSON)`}
            htmlFor="image-meta-options"
            tooltipHtml={settingsTooltips['image.metaOptions']}
          />
          <textarea
            id="image-meta-options"
            rows={8}
            value={metaOptionsFieldValue}
            onChange={(event) => applyMetaOptionsSource(event.target.value)}
            className="rounded-input font-mono text-sm"
          />

          {imageApiShape === 'openRouter' ? <OpenRouterSizeSettings /> : <Automatic1111SizeSettings />}

          <div className="flex justify-end gap-2 mt-5">
            <div className="flex items-center justify-end gap-3 pt-1">
              {connectionTestSuccess && <p className="text-sm text-secondary">✓ Connection successful.</p>}
            </div>
            <button
              type="button"
              onClick={() => void handleTestConnection()}
              disabled={connectionTestLoading}
              className="px-3 py-1 border rounded-sm"
            >
              {connectionTestLoading ? 'Testing...' : 'Test Connection'}
            </button>
            <button type="button" onClick={resetToDefault} className="px-3 py-1 border rounded-sm">
              Reset to Default
            </button>
          </div>
        </div>

        {metaOptionsError && <div className="error-card">{metaOptionsError}</div>}
        {connectionTestError && <div className="error-card">{connectionTestError}</div>}
      </div>

      <div className="bordered-section">
        <SettingFieldLabel
          text="Global image prompt prefix"
          htmlFor="image-prompt-prefix"
          tooltipHtml={settingsTooltips['image.promptPrefix']}
        />
        <textarea
          id="image-prompt-prefix"
          rows={3}
          value={imagePromptPrefix || ''}
          onChange={(event) => setSettings({ imagePromptPrefix: event.target.value })}
          className="rounded-input"
        />

        <CheckboxSettingRow
          id="image-edit-prompt-before-dispatch"
          label="Edit image prompts before dispatch"
          tooltipHtml={settingsTooltips['image.editPromptBeforeDispatch']}
          checked={editImagePromptsBeforeDispatch}
          onChange={(nextChecked) => setSettings({ editImagePromptsBeforeDispatch: nextChecked })}
        />

        <div>
          <SettingFieldLabel
            text={`Auto image rate (${toPercent(autoImageRate)}%)`}
            htmlFor="image-auto-rate"
            tooltipHtml={settingsTooltips['image.autoRate']}
          />
          <RangeNumberInput
            id="image-auto-rate"
            min={0}
            max={100}
            step={1}
            value={toPercent(autoImageRate)}
            ariaLabel="Auto image rate value"
            onChange={(next) => {
              setSettings({
                autoImageRate: clampUnitRate(next / 100),
              });
            }}
          />
        </div>

        <CheckboxSettingRow
          id="image-auto-npc-only"
          label="Auto image NPC only"
          tooltipHtml={settingsTooltips['image.autoNpcOnly']}
          checked={autoImageNpcOnly}
          onChange={(nextChecked) => setSettings({ autoImageNpcOnly: nextChecked })}
        />
      </div>
    </div>
  );
}
