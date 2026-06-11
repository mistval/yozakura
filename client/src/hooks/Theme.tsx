import { useEffect } from 'react';
import { useSettingsStore, type Settings } from '../state/settings_store.js';
import ChristmasBackground from '../theme_backdrops/christmas.js';
import SmokiesBackground from '../theme_backdrops/smokies.js';
import LunarBackground from '../theme_backdrops/lunar.js';
import LittoralBackground from '../theme_backdrops/littoral.js';
import OceanBackground from '../theme_backdrops/ocean.js';
import AgapeBackground from '../theme_backdrops/agape.js';
import SakuraBackground from '../theme_backdrops/sakura.js';
import StormyBackground from '../theme_backdrops/storm.js';
import TempestBackground from '../theme_backdrops/tempest.js';
import WinnipesaukeeBackground from '../theme_backdrops/winnipesaukee.js';
import YozakuraBackground from '../theme_backdrops/yozakura.js';
import MpkBackground from '../theme_backdrops/mpk.js';

type ResolvedTheme = Exclude<Settings['theme'], 'system'>;
type ThemeSetting = Settings['theme'];

export const THEMES: ReadonlyArray<{
  theme: ResolvedTheme;
  classes: readonly string[];
  svg?: React.ReactElement;
}> = [
  { theme: 'yozakura', classes: ['dark', 'yozakura'], svg: <YozakuraBackground /> },
  { theme: 'sakura', classes: ['light', 'sakura'], svg: <SakuraBackground /> },
  { theme: 'stormy', classes: ['light', 'stormy'], svg: <StormyBackground /> },
  { theme: 'tempest', classes: ['dark', 'tempest'], svg: <TempestBackground /> },
  { theme: 'oceanic', classes: ['light', 'oceanic'], svg: <OceanBackground /> },
  { theme: 'littoral', classes: ['light', 'littoral'], svg: <LittoralBackground /> },
  { theme: 'winnipesaukee', classes: ['dark', 'winnipesaukee'], svg: <WinnipesaukeeBackground /> },
  { theme: 'christmas', classes: ['light', 'christmas'], svg: <ChristmasBackground /> },
  { theme: 'firmament', classes: ['dark', 'firmament'], svg: <LunarBackground /> },
  { theme: 'neon', classes: ['dark', 'neon'], svg: <LunarBackground /> },
  { theme: 'smokies', classes: ['light', 'smokies'], svg: <SmokiesBackground /> },
  { theme: 'mercurial', classes: ['dark', 'mercurial'], svg: <LunarBackground /> },
  { theme: 'agape', classes: ['light', 'agape'], svg: <AgapeBackground /> },
  { theme: 'mpk', classes: ['dark', 'mpk'], svg: <MpkBackground /> },
  { theme: 'light', classes: ['light'] },
  { theme: 'dark', classes: ['dark'] },
  { theme: 'black', classes: ['dark', 'black'] },
];

const ALL_THEME_CLASSES = Array.from(new Set(THEMES.flatMap((entry) => entry.classes)));

function resolveTheme(selectedTheme: ThemeSetting, prefersDark: boolean) {
  return selectedTheme === 'system' ? (prefersDark ? 'yozakura' : 'sakura') : selectedTheme;
}

function getThemeClasses(resolvedTheme: ResolvedTheme) {
  return THEMES.find((entry) => entry.theme === resolvedTheme)?.classes || ['light'];
}

function getSystemPrefersDark() {
  return window.matchMedia('(prefers-color-scheme: dark)').matches;
}

export function useResolvedTheme() {
  return resolveTheme(useSettingsStore((s) => s.theme), getSystemPrefersDark());
}

function useThemeClasses() {
  return getThemeClasses(useResolvedTheme());
}

function useThemeSvg() {
  const resolvedTheme = useResolvedTheme();
  return THEMES.find((entry) => entry.theme === resolvedTheme)?.svg || null;
}

export function useApplyTheme() {
  const themeClasses = useThemeClasses();
  const themeSvg = useThemeSvg();

  useEffect(() => {
    const root = document.documentElement;

    root.classList.remove(...ALL_THEME_CLASSES);
    root.classList.add(...themeClasses);
  }, [themeClasses]);

  return { themeSvg };
}
