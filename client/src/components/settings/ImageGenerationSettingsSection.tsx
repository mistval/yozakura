import { useSettingsStore } from '../../state/settings_store.js';
import CheckboxSettingRow from './ui/CheckboxSettingRow.js';
import RangeNumberInput from './ui/RangeNumberInput.js';
import SettingFieldLabel from './ui/SettingFieldLabel.js';
import { settingsTooltips } from './settings_tooltips.js';
import CustomScriptSettings from './settingsScripts/CustomScriptSettings.js';
import {
  getImageScriptOptions,
  resolveImageScript,
} from '../../engine/settings/settings_scripts/image/image_scripts.js';
import { getImageScriptDocumentation } from '../../engine/settings/settings_scripts/image/image_script_documentation.js';
import {
  setSelectedScriptId,
  useSettingsScriptSection,
} from '../../engine/settings/settings_scripts/settings_scripts_store.js';
import { IMAGE_GENERATION_SECTION_ID } from '../../engine/settings/settings_scripts/settings_scripts_state.js';

import { clampUnitRate, toPercent } from '../../util/numeric.js';

const CUSTOM_SCRIPT_TOOLTIP_HTML =
  'Paste a JavaScript settings script describing a custom image provider. Use the AI Assistant Instructions button to generate one. Any controls it declares are rendered below.';

const imageScriptOptions = getImageScriptOptions();

export default function ImageGenerationSettingsSection() {
  const imagePromptPrefix = useSettingsStore((s) => s.imagePromptPrefix);
  const editImagePromptsBeforeDispatch = useSettingsStore((s) => s.editImagePromptsBeforeDispatch);
  const autoImageRate = useSettingsStore((s) => s.autoImageRate);
  const autoImageNpcOnly = useSettingsStore((s) => s.autoImageNpcOnly);
  const setSettings = useSettingsStore((s) => s.setSettings);

  const imageSection = useSettingsScriptSection(IMAGE_GENERATION_SECTION_ID);

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
            value={imageSection.selectedScriptId}
            onChange={(event) => setSelectedScriptId(IMAGE_GENERATION_SECTION_ID, event.target.value)}
            className="rounded-input"
          >
            {imageScriptOptions.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>
        </div>

        <CustomScriptSettings
          sectionId={IMAGE_GENERATION_SECTION_ID}
          resolveScript={resolveImageScript}
          getDocumentation={getImageScriptDocumentation}
          documentationTitle="Custom Image Generation Script Documentation"
          customSourceTooltipHtml={CUSTOM_SCRIPT_TOOLTIP_HTML}
        />
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
