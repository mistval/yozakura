import React, { createContext, useContext, useMemo, useRef } from 'react';
import { useIsMobileLayout } from '../../hooks/use_mobile_layout.js';

type ModalScrollApi = {
  scrollToTop: (behavior?: ScrollBehavior) => void;
  scrollToBottom: (behavior?: ScrollBehavior) => void;
  scrollTo: (top: number, behavior?: ScrollBehavior) => void;
  getContainer: () => HTMLDivElement | null;
};

const ModalScrollContext = createContext<ModalScrollApi | undefined>(undefined);

export function useModalScroll() {
  return useContext(ModalScrollContext);
}

interface ModalProps {
  open: boolean;
  onClose?: () => void;
  children: React.ReactNode;
  className?: string | undefined;
  contentRef?: React.Ref<HTMLDivElement | undefined> | undefined;
  closeOnBackdropClick?: boolean;
  zIndex?: number | undefined;
  fullScreenOnMobile?: boolean | undefined;
}

export default function Modal({
  open,
  onClose,
  children,
  className = '',
  contentRef,
  closeOnBackdropClick = true,
  zIndex,
  fullScreenOnMobile = true,
}: ModalProps) {
  const isMobileLayout = useIsMobileLayout();
  const isFullScreenMobile = isMobileLayout && fullScreenOnMobile;
  const containerRef = useRef<HTMLDivElement | null>(null);
  const mouseDownOutside = useRef<boolean>(false);

  const setContainerRef: React.RefCallback<HTMLDivElement> = (node) => {
    containerRef.current = node;

    if (!contentRef) {
      return;
    }

    if (typeof contentRef === 'function') {
      contentRef(node);
      return;
    }

    (contentRef as React.MutableRefObject<HTMLDivElement | null>).current = node;
  };

  const scrollApi = useMemo<ModalScrollApi>(
    () => ({
      scrollToTop: (behavior = 'auto') => {
        containerRef.current?.scrollTo({ top: 0, behavior });
      },
      scrollToBottom: (behavior = 'auto') => {
        const container = containerRef.current;
        if (!container) {
          return;
        }

        container.scrollTo({ top: container.scrollHeight, behavior });
      },
      scrollTo: (top, behavior = 'auto') => {
        containerRef.current?.scrollTo({ top, behavior });
      },
      getContainer: () => containerRef.current,
    }),
    []
  );

  if (!open) return undefined;

  const handleMouseDown = (e: React.MouseEvent<HTMLDivElement>) => {
    if (e.target !== e.currentTarget) {
      mouseDownOutside.current = true;
    }
  };

  const handleOutsideClick = (e: React.MouseEvent<HTMLDivElement>) => {
    const wasDownOutside = mouseDownOutside.current;
    mouseDownOutside.current = false;

    if (!closeOnBackdropClick || !onClose || wasDownOutside) {
      return;
    }

    // Fire only when clicking empty container space around the modal content.
    if (e.target === e.currentTarget) {
      onClose();
    }
  };

  return (
    <div
      className={`fixed inset-0 z-50 mt-0! mb-0 ${isFullScreenMobile ? 'bg-emphasized' : 'bg-overlay'}`}
      style={zIndex !== undefined ? { zIndex } : undefined}
    >
      <ModalScrollContext.Provider value={scrollApi}>
        <div
          ref={setContainerRef}
          className={
            isFullScreenMobile
              ? 'h-full overflow-y-auto [&>*]:max-w-none! [&>*]:my-0! [&>*]:rounded-none! [&>*]:border-0! [&>*]:shadow-none!'
              : `h-full overflow-y-auto ${className}`
          }
          onClick={handleOutsideClick}
          onMouseDown={handleMouseDown}
        >
          {children}
        </div>
      </ModalScrollContext.Provider>
    </div>
  );
}
