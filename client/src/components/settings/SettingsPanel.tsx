import { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import AboutSettingsSection from './AboutSettingsSection.js';
import ConfirmDialog from '../ui/ConfirmDialog.js';
import RoutedModalFrame from '../ui/RoutedModalFrame.js';
import AppearanceSettingsSection from './AppearanceSettingsSection.js';
import BehaviorSettingsSection from './BehaviorSettingsSection.js';
import ImageGenerationSettingsSection from './ImageGenerationSettingsSection.js';
import LlmSettingsSection from './LlmSettingsSection.js';
import PromptLogSettingsSection from './PromptLogSettingsSection.js';
import TemplateRenderLogSettingsSection from './ui/TemplateRenderLogSettingsSection.js';
import ScenarioSettingsSection from './ScenarioSettingsSection.js';
import { getPromptTemplatesBackPath } from './promptTemplates/group_path.js';
import PromptTemplatesSettingsSection from './PromptTemplatesSettingsSection.js';
import { settingsStore } from '../../state/settings_store.js';
import { useSettingsModal } from './SettingsModalContext.js';

type SettingsCategory = {
  slug: string;
  title: string;
  description: string;
};

type SettingsSection =
  | 'scenario'
  | 'appearance'
  | 'image-generation'
  | 'behavior'
  | 'prompt-templates'
  | 'llm'
  | 'llm-prompt-log'
  | 'llm-template-render-log'
  | 'about';

export default function SettingsPanel() {
  const navigate = useNavigate();
  const { settingsPath, includeScenarioSettings, closeSettings, setSettingsSection } = useSettingsModal();
  const [resetDialogOpen, setResetDialogOpen] = useState(false);

  const isBaseRoute = settingsPath === '';

  const activeSection: SettingsSection | undefined = useMemo(() => {
    if (settingsPath.startsWith('scenario') && includeScenarioSettings) return 'scenario';
    if (settingsPath.startsWith('appearance')) return 'appearance';
    if (settingsPath.startsWith('image-generation')) return 'image-generation';
    if (settingsPath.startsWith('behavior')) return 'behavior';
    if (settingsPath === 'prompt-templates/template-render-log') return 'llm-template-render-log';
    if (settingsPath.startsWith('prompt-templates')) return 'prompt-templates';
    if (settingsPath === 'llm/promptlog') return 'llm-prompt-log';
    if (settingsPath.startsWith('llm')) return 'llm';
    if (settingsPath.startsWith('about')) return 'about';
    return undefined;
  }, [settingsPath, includeScenarioSettings]);

  const backPath = useMemo<string | undefined>(() => {
    if (isBaseRoute) return undefined;
    if (activeSection === 'llm-prompt-log') return 'llm';
    if (activeSection === 'llm-template-render-log') return 'prompt-templates';
    if (activeSection === 'prompt-templates') {
      return getPromptTemplatesBackPath(settingsPath, 'prompt-templates', '');
    }
    return '';
  }, [activeSection, isBaseRoute, settingsPath]);

  const showBack = typeof backPath === 'string';

  const categories = useMemo<SettingsCategory[]>(() => {
    const next: SettingsCategory[] = [
      {
        slug: 'behavior',
        title: 'Behavior Settings',
        description: 'Control NPC behavior and other functional mechanics.',
      },
      {
        slug: 'image-generation',
        title: 'Image Generation',
        description: 'Prompt prefixes, negatives, and image dimensions.',
      },
      {
        slug: 'llm',
        title: 'LLM Settings',
        description: 'Customize LLM behavior on a context-sensitive basis.',
      },
      {
        slug: 'prompt-templates',
        title: 'Prompt Templates',
        description: 'Edit runtime prompt bodies and JavaScript parser/settings source.',
      },
      {
        slug: 'appearance',
        title: 'Appearance',
        description: 'Theme mode and visual presentation options.',
      },
      {
        slug: 'about',
        title: 'About',
        description: 'Version info and links.',
      },
    ];

    if (includeScenarioSettings) {
      next.unshift({
        slug: 'scenario',
        title: 'Scenario Settings',
        description: 'Scenario-specific options.',
      });
    }

    return next;
  }, [includeScenarioSettings]);

  const renderCategoryList = () => (
    <div className="space-y-4">
      <div>
        <h2 className="text-2xl font-semibold">Settings</h2>
      </div>
      <div className="space-y-3">
        {categories.map((category) => (
          <button
            key={category.slug}
            type="button"
            className="card-button"
            onClick={() => setSettingsSection(category.slug)}
          >
            <p className="text-base font-semibold">{category.title}</p>
            <p className="text-sm text-secondary">{category.description}</p>
          </button>
        ))}
      </div>
    </div>
  );

  const renderNotFound = () => (
    <div className="space-y-3">
      <h2 className="text-2xl font-semibold">Settings</h2>
      <p className="text-sm text-secondary">This settings section does not exist.</p>
      <button type="button" className="px-3 py-1 border rounded-sm" onClick={() => setSettingsSection('')}>
        Return to settings categories
      </button>
    </div>
  );

  let body = renderCategoryList();
  if (!isBaseRoute) {
    if (activeSection === 'scenario') {
      body = <ScenarioSettingsSection />;
    } else if (activeSection === 'appearance') {
      body = <AppearanceSettingsSection />;
    } else if (activeSection === 'image-generation') {
      body = <ImageGenerationSettingsSection />;
    } else if (activeSection === 'behavior') {
      body = <BehaviorSettingsSection />;
    } else if (activeSection === 'prompt-templates') {
      body = <PromptTemplatesSettingsSection />;
    } else if (activeSection === 'llm') {
      body = <LlmSettingsSection />;
    } else if (activeSection === 'llm-prompt-log') {
      body = <PromptLogSettingsSection />;
    } else if (activeSection === 'llm-template-render-log') {
      body = <TemplateRenderLogSettingsSection />;
    } else if (activeSection === 'about') {
      body = <AboutSettingsSection />;
    } else {
      body = renderNotFound();
    }
  }

  const handleConfirmReset = () => {
    settingsStore.resetSettings();
    setResetDialogOpen(false);
    navigate('/');
  };

  return (
    <>
      <ConfirmDialog
        open={resetDialogOpen}
        onClose={() => setResetDialogOpen(false)}
        title="Reset Settings to Default"
        message="Reset settings to default? This will not affect your scenario data. Only your settings will be reset. After resetting your settings, you will be taken back to the main menu and presented with the initial setup flow."
        confirmLabel="Reset Settings"
        onConfirm={handleConfirmReset}
      />
      <RoutedModalFrame
        queryParam="settings"
        onClose={closeSettings}
        showBack={showBack}
        maxWidthClassName="max-w-5xl"
        onBack={showBack ? () => setSettingsSection(backPath) : undefined}
      >
        <div className="space-y-4">
          {body}
          {isBaseRoute && (
            <div className="border-t border-border-default pt-4 flex justify-end">
              <button
                type="button"
                className="px-3 py-1 border rounded-sm"
                onClick={() => setResetDialogOpen(true)}
              >
                Reset to Default
              </button>
            </div>
          )}
        </div>
      </RoutedModalFrame>
    </>
  );
}
