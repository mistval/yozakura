import { useState, type ReactElement, type ReactNode } from 'react';
import { cloneElement, isValidElement } from 'react';
import {
  autoUpdate,
  flip,
  FloatingPortal,
  offset,
  shift,
  useClick,
  useDismiss,
  useFloating,
  useInteractions,
  useRole,
  type Placement,
} from '@floating-ui/react';

export type ButtonOptionsProps = {
  button: ReactNode;
  children: ReactNode;
  disabled?: boolean | undefined;
  showDropdown?: boolean | undefined;
  className?: string | undefined;
  dropdownClassName?: string | undefined;
  placement?: Placement | undefined;
  ariaLabel?: string | undefined;
};

export default function ButtonOptions({
  button,
  children,
  disabled = false,
  showDropdown = true,
  className = '',
  dropdownClassName = '',
  placement = 'bottom-start',
  ariaLabel = 'Options',
}: ButtonOptionsProps) {
  const [open, setOpen] = useState(false);

  const { refs, floatingStyles, context } = useFloating({
    open,
    onOpenChange: setOpen,
    placement,
    whileElementsMounted: autoUpdate,
    middleware: [offset(4), flip({ padding: 12 }), shift({ padding: 12 })],
  });

  const click = useClick(context);
  const dismiss = useDismiss(context);
  const role = useRole(context, { role: 'menu' });

  const { getReferenceProps, getFloatingProps } = useInteractions([click, dismiss, role]);

  if (!showDropdown) {
    return <>{button}</>;
  }

  let modifiedButton = button;
  if (isValidElement(button)) {
    const buttonElement = button as ReactElement<{ className?: string }>;
    const originalClassName = buttonElement.props.className ?? '';
    modifiedButton = cloneElement(buttonElement, {
      className: `${originalClassName} rounded-r-none border-r-0 focus:z-10`.trim(),
    });
  }

  return (
    <>
      <div className={`inline-flex items-stretch ${className}`.trim()}>
        {modifiedButton}
        <button
          type="button"
          ref={refs.setReference}
          disabled={disabled}
          aria-label={ariaLabel}
          aria-expanded={open}
          className={`rounded-l-none px-2 py-1 flex items-center justify-center focus:z-10 ${
            open ? 'bg-surface-hover-strong' : ''
          }`.trim()}
          {...getReferenceProps()}
        >
          <svg
            className={`w-3.5 h-3.5 transition-transform duration-150 ${open ? 'rotate-180' : ''}`}
            fill="none"
            viewBox="0 0 24 24"
            strokeWidth="2.5"
            stroke="currentColor"
            aria-hidden="true"
          >
            <path strokeLinecap="round" strokeLinejoin="round" d="M19.5 8.25l-7.5 7.5-7.5-7.5" />
          </svg>
        </button>
      </div>

      {open && (
        <FloatingPortal>
          <div
            ref={refs.setFloating}
            style={{ ...floatingStyles, zIndex: Number.MAX_SAFE_INTEGER }}
            className={`rounded-md border border-border-default bg-inset p-3 shadow-lg ${dropdownClassName}`.trim()}
            {...getFloatingProps()}
          >
            {children}
          </div>
        </FloatingPortal>
      )}
    </>
  );
}
