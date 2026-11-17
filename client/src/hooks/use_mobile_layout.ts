import { useSettingsStore } from '../state/settings_store.js';

/** Returns whether the client layout is currently set to mobile mode. */
export function useIsMobileLayout(): boolean {
  return useSettingsStore((state) => state.chatPaneWidth === 'mobile');
}

type ModalPanelClassOptions = {
  maxWidthClassName?: string | undefined;
  surfaceClassName?: string | undefined;
  mobilePanelClassName?: string | undefined;
  desktopPanelClassName?: string | undefined;
};

/** Returns single-sourced modal outer/panel classes that collapse margins and card chrome in mobile mode. */
export function useModalPanelClasses({
  maxWidthClassName = 'max-w-5xl',
  surfaceClassName = 'bg-emphasized',
  mobilePanelClassName = 'p-3 space-y-4',
  desktopPanelClassName = 'rounded-sm border shadow-xs p-4 md:p-6 space-y-4',
}: ModalPanelClassOptions = {}) {
  const isMobileLayout = useIsMobileLayout();

  const outerClassName = isMobileLayout
    ? 'w-full min-h-full'
    : `mx-auto w-full p-4 md:p-6 ${maxWidthClassName}`;

  const panelClassName = isMobileLayout
    ? `${surfaceClassName} min-h-full w-full ${mobilePanelClassName}`.trim()
    : `${surfaceClassName} w-full ${desktopPanelClassName}`.trim();

  return {
    isMobileLayout,
    outerClassName,
    panelClassName,
  };
}
