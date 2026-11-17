import { useEffect, type ReactNode } from 'react';
import { useModalQueryParam } from '../../hooks/useModalQueryParam.js';
import { useIsMobileLayout } from '../../hooks/use_mobile_layout.js';
import RoutedModalFrame from './RoutedModalFrame.js';

export function useMobileDrawer(queryParam: string, enabled = true) {
  const isMobileLayout = useIsMobileLayout();
  const { open, openModal, closeModal } = useModalQueryParam(queryParam);

  useEffect(() => {
    if ((!isMobileLayout || !enabled) && open) {
      closeModal();
    }
  }, [isMobileLayout, enabled, open, closeModal]);

  return {
    isMobileLayout,
    drawerOpen: open,
    openDrawer: openModal,
    closeDrawer: closeModal,
  };
}

export function ParticipantsDrawerButton({
  onClick,
  ariaLabel = 'Open participants',
  title = 'Participants',
}: {
  onClick: () => void;
  ariaLabel?: string | undefined;
  title?: string | undefined;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={ariaLabel}
      title={title}
      className="p-1.5! flex items-center justify-center shrink-0"
    >
      <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}>
        <path
          strokeLinecap="round"
          strokeLinejoin="round"
          d="M15.75 6a3.75 3.75 0 1 1-7.5 0 3.75 3.75 0 0 1 7.5 0ZM4.501 20.118a7.5 7.5 0 0 1 14.998 0A17.933 17.933 0 0 1 12 21.75c-2.676 0-5.216-.584-7.499-1.632Z"
        />
      </svg>
    </button>
  );
}

type ResponsiveDrawerSidebarProps = {
  isDrawer: boolean;
  queryParam: string;
  onClose: () => void;
  drawerSide?: 'left' | 'right' | undefined;
  zIndex?: number | undefined;
  headerActions?: ReactNode | undefined;
  inlineClassName?: string | undefined;
  children: ReactNode;
};

export default function ResponsiveDrawerSidebar({
  isDrawer,
  queryParam,
  onClose,
  drawerSide = 'left',
  zIndex,
  headerActions,
  inlineClassName = '',
  children,
}: ResponsiveDrawerSidebarProps) {
  if (!isDrawer) {
    return <div className={inlineClassName}>{children}</div>;
  }

  return (
    <RoutedModalFrame
      queryParam={queryParam}
      onClose={onClose}
      drawerSide={drawerSide}
      zIndex={zIndex}
      headerActions={headerActions}
    >
      <div className="@container">{children}</div>
    </RoutedModalFrame>
  );
}
