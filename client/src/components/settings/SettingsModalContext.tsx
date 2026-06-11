import type { ReactNode } from 'react';
import { createContext, useContext, useMemo } from 'react';
import { useMatch } from 'react-router-dom';
import { StringParam, useQueryParams } from 'use-query-params';
import { FlagParam } from '../../hooks/useModalQueryParam.js';

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
  const [params, setParams] = useQueryParams({
    settings: FlagParam,
    settingspath: StringParam,
  });

  const scenarioMatch = useMatch('/scenario/*');
  const includeScenarioSettings = Boolean(scenarioMatch);

  const open = params.settings ?? false;
  const settingsPath = params.settingspath ?? '';

  const openSettings = (path = '') => {
    setParams({ settings: true, settingspath: path || undefined });
  };

  const closeSettings = () => {
    setParams({ settings: undefined as unknown as boolean, settingspath: undefined });
  };

  const setSettingsSection = (path: string) => {
    setParams({ settingspath: path || undefined });
  };

  const value = useMemo(
    () => ({ open, settingsPath, includeScenarioSettings, openSettings, closeSettings, setSettingsSection }),
    [open, settingsPath, includeScenarioSettings]
  );

  return <SettingsModalContext.Provider value={value}>{children}</SettingsModalContext.Provider>;
}

export function useSettingsModal() {
  const ctx = useContext(SettingsModalContext);
  if (!ctx) throw new Error('useSettingsModal must be used inside SettingsModalProvider');
  return ctx;
}
