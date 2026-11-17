import type { ReactNode, Ref } from 'react';
import Modal from './Modal';
import { useModalQueryParam, useModalStackZIndex } from '../../hooks/useModalQueryParam.js';
import { useModalPanelClasses } from '../../hooks/use_mobile_layout.js';

type RoutedModalFrameProps = {
  open?: boolean;
  onClose: () => void;
  onBack?: (() => void) | undefined;
  showBack?: boolean | undefined;
  showClose?: boolean | undefined;
  drawerSide?: 'left' | 'right' | undefined;
  zIndex?: number | undefined;
  className?: string | undefined;
  maxWidthClassName?: string | undefined;
  panelClassName?: string | undefined;
  contentRef?: Ref<HTMLDivElement | undefined> | undefined;
  queryParam?: string | undefined;
  headerActions?: ReactNode | undefined;
  children: ReactNode;
};

export default function RoutedModalFrame({
  open: openProp,
  onClose,
  onBack,
  showBack = false,
  showClose = true,
  drawerSide,
  zIndex: zIndexProp,
  className,
  maxWidthClassName = 'max-w-5xl',
  panelClassName = '',
  contentRef,
  queryParam,
  headerActions,
  children,
}: RoutedModalFrameProps) {
  const { open: derivedOpen } = useModalQueryParam(queryParam ?? '');
  const derivedZIndex = useModalStackZIndex(queryParam ?? '');

  const open = queryParam !== undefined ? derivedOpen : (openProp ?? true);
  const zIndex = zIndexProp ?? (queryParam !== undefined ? derivedZIndex : undefined);

  const {
    isMobileLayout,
    outerClassName: standardOuterClassName,
    panelClassName: standardPanelClassName,
  } = useModalPanelClasses({
    maxWidthClassName,
    mobilePanelClassName: 'p-2 space-y-3',
  });
  const isDrawer = Boolean(drawerSide);
  const modalClassName = isDrawer
    ? `flex! overflow-y-hidden! ${drawerSide === 'right' ? 'justify-end' : 'justify-start'} ${className ?? ''}`.trim()
    : className;
  const outerContainerClassName = isDrawer
    ? 'w-[80vw] max-w-[800px] h-full shrink-0'
    : standardOuterClassName;
  const innerPanelClassName = isDrawer
    ? `bg-emphasized h-full overflow-y-auto shadow-xl p-3 space-y-3 ${
        drawerSide === 'right' ? 'border-l border-border-default' : 'border-r border-border-default'
      } ${panelClassName}`
    : `${standardPanelClassName} ${panelClassName}`.trim();
  const stickyBarPositionClassName = isDrawer || isMobileLayout ? 'top-0' : 'top-3';

  return (
    <Modal
      open={open}
      onClose={onClose}
      className={modalClassName}
      contentRef={contentRef}
      zIndex={zIndex}
      fullScreenOnMobile={!isDrawer}
    >
      <div className={outerContainerClassName}>
        <div className={innerPanelClassName}>
          {(showClose || (showBack && onBack) || headerActions) && (
            <div
              className={`sticky ${stickyBarPositionClassName} z-20 flex shrink-0 flex-wrap items-center justify-between gap-2`}
            >
              {headerActions && (
                <div className="inline-flex flex-wrap gap-2 rounded-sm border border-border-default bg-surface-frosted p-1 shadow-xs backdrop-blur-sm">
                  {headerActions}
                </div>
              )}
              {(showClose || (showBack && onBack)) && (
                <div className="inline-flex gap-2 rounded-sm border border-border-default bg-surface-frosted p-1 shadow-xs backdrop-blur-sm ml-auto">
                  {showBack && onBack && (
                    <button
                      className="button-emphasized"
                      type="button"
                      onClick={onBack}
                      aria-label="Back"
                      title="Back"
                    >
                      ←
                    </button>
                  )}
                  {showClose && (
                    <button
                      className="button-emphasized"
                      type="button"
                      onClick={onClose}
                      aria-label="Close"
                      title="Close"
                    >
                      X
                    </button>
                  )}
                </div>
              )}
            </div>
          )}
          {children}
        </div>
      </div>
    </Modal>
  );
}
