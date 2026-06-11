import type { ReactNode, Ref } from 'react';
import Modal from './Modal';
import { useModalQueryParam, useModalStackZIndex } from '../../hooks/useModalQueryParam.js';

type RoutedModalFrameProps = {
  open?: boolean;
  onClose: () => void;
  onBack?: (() => void) | undefined;
  showBack?: boolean | undefined;
  className?: string | undefined;
  maxWidthClassName?: string | undefined;
  panelClassName?: string | undefined;
  contentRef?: Ref<HTMLDivElement | undefined> | undefined;
  queryParam?: string | undefined;
  children: ReactNode;
};

export default function RoutedModalFrame({
  open: openProp,
  onClose,
  onBack,
  showBack = false,
  className,
  maxWidthClassName = 'max-w-5xl',
  panelClassName = '',
  contentRef,
  queryParam,
  children,
}: RoutedModalFrameProps) {
  const { open: derivedOpen } = useModalQueryParam(queryParam ?? '');
  const derivedZIndex = useModalStackZIndex(queryParam ?? '');

  const open = queryParam !== undefined ? derivedOpen : (openProp ?? true);
  const zIndex = queryParam !== undefined ? derivedZIndex : undefined;

  return (
    <Modal open={open} onClose={onClose} className={className} contentRef={contentRef} zIndex={zIndex}>
      <div className={`mx-auto p-4 md:p-6 ${maxWidthClassName}`}>
        <div className={`bg-emphasized rounded-sm border shadow-xs p-4 md:p-6 space-y-4 ${panelClassName}`}>
          <div className="sticky top-3 z-20 h-0">
            <div className="flex justify-end">
              <div className="inline-flex gap-2 rounded-sm border border-border-default bg-surface-frosted p-1 shadow-xs backdrop-blur-sm">
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
                <button
                  className="button-emphasized"
                  type="button"
                  onClick={onClose}
                  aria-label="Close"
                  title="Close"
                >
                  X
                </button>
              </div>
            </div>
          </div>
          {children}
        </div>
      </div>
    </Modal>
  );
}
