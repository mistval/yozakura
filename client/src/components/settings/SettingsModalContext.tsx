import type { ReactNode } from 'react';
import { createContext, useCallback, useContext, useMemo } from 'react';
import { useMatch } from 'react-router';
import { useQueryParams } from '../../util/queryParams.js';

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
  const [params, setParams] = useQueryParams();

  const scenarioMatch = useMatch('/scenario/*');
  const includeScenarioSettings = Boolean(scenarioMatch);

  const open = params.has('settings') && params.get('settings') !== 'false';
  const settingsPath = params.get('settingspath') ?? '';

  const openSettings = useCallback((path = '') => {
    setParams({ settings: true, settingspath: path || undefined });
  }, [setParams]);

  const closeSettings = useCallback(() => {
    setParams({ settings: undefined, settingspath: undefined });
  }, [setParams]);

  const setSettingsSection = useCallback((path: string) => {
    setParams({ settingspath: path || undefined });
  }, [setParams]);

  const value = useMemo(
    () => ({ open, settingsPath, includeScenarioSettings, openSettings, closeSettings, setSettingsSection }),
    [open, settingsPath, includeScenarioSettings, params, openSettings, closeSettings, setSettingsSection]
  );

  return <SettingsModalContext.Provider value={value}>{children}</SettingsModalContext.Provider>;
}

export function useSettingsModal() {
  const ctx = useContext(SettingsModalContext);
  if (!ctx) throw new Error('useSettingsModal must be used inside SettingsModalProvider');
  return ctx;
}
