import type { ReactNode } from 'react';
import { createContext, useCallback, useContext, useMemo } from 'react';
import { useMatch } from 'react-router';
import { useModalQueryParam } from '../../hooks/useModalQueryParam.js';

const SETTINGS_MODAL_OWNED_KEYS = ['settingspath', 'llmoptionsid', 'llmoptionsadvanced'] as const;

type SettingsModalContextType = {
  open: boolean;
  settingsPath: string;
  includeScenarioSettings: boolean;
  openSettings: (path?: string) => void;
  closeSettings: () => void;
  setSettingsSection: (path: string) => void;
};

const SettingsModalContext = createContext<SettingsModalContextType | undefined>(undefined);

export function SettingsModalProvider({ children }: { children: ReactNode }) {
  const { open, pushModal, closeModal, updateModalParams, layerParams } = useModalQueryParam(
    'settings',
    SETTINGS_MODAL_OWNED_KEYS
  );

  const scenarioMatch = useMatch('/scenario/*');
  const includeScenarioSettings = Boolean(scenarioMatch);

  const settingsPath = layerParams.get('settingspath') ?? '';

  const openSettings = useCallback(
    (path = '') => {
      pushModal({ settingspath: path || undefined });
    },
    [pushModal]
  );

  const closeSettings = closeModal;

  const setSettingsSection = useCallback(
    (path: string) => {
      updateModalParams({ settingspath: path || undefined });
    },
    [updateModalParams]
  );

  const value = useMemo(
    () => ({ open, settingsPath, includeScenarioSettings, openSettings, closeSettings, setSettingsSection }),
    [open, settingsPath, includeScenarioSettings, openSettings, closeSettings, setSettingsSection]
  );

  return <SettingsModalContext.Provider value={value}>{children}</SettingsModalContext.Provider>;
}

export function useSettingsModal() {
  const ctx = useContext(SettingsModalContext);
  if (!ctx) throw new Error('useSettingsModal must be used inside SettingsModalProvider');
  return ctx;
}
