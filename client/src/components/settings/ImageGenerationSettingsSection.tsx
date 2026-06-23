import { useSettingsStore } from '../../state/settings_store.js';
import CheckboxSettingRow from './ui/CheckboxSettingRow.js';
import RangeNumberInput from './ui/RangeNumberInput.js';
import SettingFieldLabel from './ui/SettingFieldLabel.js';
import { settingsTooltips } from './settings_tooltips.js';
import CustomScriptSettings from './settingsScripts/CustomScriptSettings.js';
import { IMAGE_SCRIPT_DESCRIPTOR, useImageScriptSelection } from './settingsScripts/imageScriptSection.js';

import { clampUnitRate, toPercent } from '../../util/numeric.js';

export default function ImageGenerationSettingsSection() {
  const imagePromptPrefix = useSettingsStore((s) => s.imagePromptPrefix);
  const editImagePromptsBeforeDispatch = useSettingsStore((s) => s.editImagePromptsBeforeDispatch);
  const autoImageRate = useSettingsStore((s) => s.autoImageRate);
  const autoImageNpcOnly = useSettingsStore((s) => s.autoImageNpcOnly);
  const setSettings = useSettingsStore((s) => s.setSettings);

  const imageSelection = useImageScriptSelection();

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
          <SettingFieldLabel text="Image Generation Provider" htmlFor="image-provider" />
          <select
            id="image-provider"
            value={imageSelection.selectedScriptId}
            onChange={(event) => imageSelection.onSelectScript(event.target.value)}
            className="rounded-input"
          >
            {IMAGE_SCRIPT_DESCRIPTOR.builtinOptions.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>
        </div>

        <div className="text-sm text-warning-text-strong bg-warning-bg border border-warning-border-soft rounded-sm p-2 mt-1">
          Don't see your provider?{' '}
          <a
            href="https://mistval.github.io/yozakura/docs/image-providers"
            target="_blank"
            rel="noreferrer"
            className="underline hover:text-primary"
          >
            Check here
          </a>
          .
        </div>

        <CustomScriptSettings descriptor={IMAGE_SCRIPT_DESCRIPTOR} selection={imageSelection} />
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
