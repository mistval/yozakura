import { THEMES } from '../../hooks/Theme.js';
import {
  useSettingsStore,
  type ChatPaneWidth,
  type ConversationLogWidth,
  type Settings,
} from '../../state/settings_store.js';
import SettingFieldLabel from './ui/SettingFieldLabel.js';
import { settingsDangerousHtmlTooltips, settingsTooltips } from './settings_tooltips.js';

const THEME_OPTIONS: ReadonlyArray<{ value: Settings['theme']; label: string }> = [
  { value: 'system', label: 'System' },
  ...THEMES.map((entry) => ({
    value: entry.theme,
    label: entry.theme === 'mpk' ? 'MPK' : entry.theme.charAt(0).toUpperCase() + entry.theme.slice(1),
  })),
];

const LAYOUT_OPTIONS: ReadonlyArray<{ value: ChatPaneWidth; label: string }> = [
  { value: 'mobile', label: 'Mobile' },
  { value: 'narrow', label: 'Desktop Narrow' },
  { value: 'medium', label: 'Desktop Medium' },
  { value: 'wide', label: 'Desktop Wide' },
  { value: 'extra_wide', label: 'Desktop Extra Wide' },
  { value: 'unconstrained', label: 'Desktop Limit Breaker' },
];

const CONVERSATION_LOG_WIDTH_OPTIONS: ReadonlyArray<{ value: ConversationLogWidth; label: string }> = [
  { value: 'narrow', label: 'Narrow' },
  { value: 'medium', label: 'Medium' },
  { value: 'wide', label: 'Wide' },
  { value: 'extra_wide', label: 'Extra Wide' },
  { value: 'unconstrained', label: 'Limit Breaker' },
];

type AppearanceSelectFieldProps<T extends string> = {
  id: string;
  label: string;
  tooltip?: string | undefined;
  tooltipDangerousHtml?: string | undefined;
  value: T;
  options: ReadonlyArray<{ value: T; label: string }>;
  onChange: (nextValue: T) => void;
};

function AppearanceSelectField<T extends string>({
  id,
  label,
  tooltip,
  tooltipDangerousHtml,
  value,
  options,
  onChange,
}: AppearanceSelectFieldProps<T>) {
  return (
    <div className="bordered-section">
      <SettingFieldLabel
        text={label}
        htmlFor={id}
        tooltip={tooltip}
        tooltipDangerousHtml={tooltipDangerousHtml}
      />
      <select
        id={id}
        value={value}
        onChange={(event) => {
          const match = options.find((option) => option.value === event.target.value);
          if (!match) {
            return;
          }

          onChange(match.value);
        }}
        className="rounded-input"
      >
        {options.map((option) => (
          <option key={option.value} value={option.value}>
            {option.label}
          </option>
        ))}
      </select>
    </div>
  );
}

export default function AppearanceSettingsSection() {
  const theme = useSettingsStore((s) => s.theme);
  const chatPaneWidth = useSettingsStore((s) => s.chatPaneWidth);
  const conversationLogWidth = useSettingsStore((s) => s.conversationLogWidth);
  const setSettings = useSettingsStore((s) => s.setSettings);

  return (
    <div className="space-y-4">
      <div>
        <h2 className="text-2xl font-semibold">Appearance</h2>
        <p className="text-sm text-secondary">Customize the interface theme and layout.</p>
      </div>

      <AppearanceSelectField
        id="appearance-theme"
        label="Theme"
        tooltipDangerousHtml={settingsDangerousHtmlTooltips['appearance.theme']}
        value={theme || 'system'}
        options={THEME_OPTIONS}
        onChange={(nextTheme) => setSettings({ theme: nextTheme })}
      />

      <AppearanceSelectField
        id="appearance-layout"
        label="Layout"
        tooltip={settingsTooltips['chat.paneWidth']}
        value={chatPaneWidth}
        options={LAYOUT_OPTIONS}
        onChange={(nextLayout) => setSettings({ chatPaneWidth: nextLayout })}
      />

      <AppearanceSelectField
        id="appearance-conversation-log-width"
        label="Conversation Log Width"
        tooltip={settingsTooltips['appearance.conversationLogWidth']}
        value={conversationLogWidth}
        options={CONVERSATION_LOG_WIDTH_OPTIONS}
        onChange={(nextWidth) => setSettings({ conversationLogWidth: nextWidth })}
      />
    </div>
  );
}
