import { useSettingsStore } from '../../state/settings_store.js';
import CheckboxSettingRow from './ui/CheckboxSettingRow.js';
import RangeNumberInput from './ui/RangeNumberInput.js';
import ProportionalWeightSliders from './ui/ProportionalWeightSliders.js';
import SettingFieldLabel from './ui/SettingFieldLabel.js';
import { settingsTooltips } from './settings_tooltips.js';
import CustomScriptSettings from './settingsScripts/CustomScriptSettings.js';
import { IMAGE_SCRIPT_DESCRIPTOR, useImageScriptSelection } from './settingsScripts/imageScriptSection.js';
import { chatSceneImageTemplatesGroup } from '../../engine/prompt_templates/chat/group.js';

import { clampUnitRate, toPercent } from '../../util/numeric.js';

export default function ImageGenerationSettingsSection() {
  const imagePromptPrefix = useSettingsStore((s) => s.imagePromptPrefix);
  const editImagePromptsBeforeDispatch = useSettingsStore((s) => s.editImagePromptsBeforeDispatch);
  const autoImageRate = useSettingsStore((s) => s.autoImageRate);
  const autoImageNpcOnly = useSettingsStore((s) => s.autoImageNpcOnly);
  const autoImageTemplateWeights = useSettingsStore((s) => s.autoImageTemplateWeights);
  const setSettings = useSettingsStore((s) => s.setSettings);

  const sceneImageChains = chatSceneImageTemplatesGroup.useChains();
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

        {sceneImageChains.length > 1 && autoImageRate > 0 && (
          <ProportionalWeightSliders
            idPrefix="image-auto-template-weight"
            label="Auto image template weights"
            tooltipHtml={settingsTooltips['image.autoTemplateWeights']}
            items={sceneImageChains.map((chain) => ({
              id: chain.templateChainId,
              label: chain.settingsBridge.get().title,
            }))}
            weights={autoImageTemplateWeights}
            onChange={(weightsPatch) => setSettings({ autoImageTemplateWeights: weightsPatch })}
          />
        )}

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
