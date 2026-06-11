import { THEMES } from '../../hooks/Theme.js';
import { useSettingsStore, type Settings } from '../../state/settings_store.js';
import SettingFieldLabel from './ui/SettingFieldLabel.js';
import { settingsTooltips } from './settings_tooltips.js';

const THEME_OPTIONS: ReadonlyArray<{ value: Settings['theme']; label: string }> = [
  { value: 'system', label: 'System' },
  ...THEMES.map((entry) => ({
    value: entry.theme,
    label: entry.theme === 'mpk' ? 'MPK' : entry.theme.charAt(0).toUpperCase() + entry.theme.slice(1),
  })),
];

function isThemeOption(value: string): value is Settings['theme'] {
  return THEME_OPTIONS.some((option) => option.value === value);
}

export default function AppearanceSettingsSection() {
  const theme = useSettingsStore((s) => s.theme);
  const setSettings = useSettingsStore((s) => s.setSettings);

  return (
    <div className="space-y-4">
      <div>
        <h2 className="text-2xl font-semibold">Appearance</h2>
        <p className="text-sm text-secondary">Customize the interface theme.</p>
      </div>
      <div className="bordered-section">
        <SettingFieldLabel
          text="Theme"
          htmlFor="appearance-theme"
          tooltipHtml={settingsTooltips['appearance.theme']}
        />
        <select
          id="appearance-theme"
          value={theme || 'system'}
          onChange={(event) => {
            const nextTheme = event.target.value;
            if (!isThemeOption(nextTheme)) {
              return;
            }

            setSettings({ theme: nextTheme });
          }}
          className="rounded-input"
        >
          {THEME_OPTIONS.map((themeOption) => (
            <option key={themeOption.value} value={themeOption.value}>
              {themeOption.label}
            </option>
          ))}
        </select>
      </div>
    </div>
  );
}
