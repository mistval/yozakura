import { useId, useMemo, useState } from 'react';
import {
  autoUpdate,
  flip,
  FloatingPortal,
  offset,
  shift,
  useClick,
  useDismiss,
  useFloating,
  useFocus,
  useHover,
  useInteractions,
  useRole,
} from '@floating-ui/react';
import type { Placement } from '@floating-ui/react';

type InfoTooltipProps = {
  label: string;
  html: string;
  side?: 'top' | 'right' | 'bottom' | 'left';
  align?: 'start' | 'center' | 'end';
};

function sanitizeHtmlTooltip(html: string): string {
  if (typeof document === 'undefined') {
    return html;
  }

  const template = document.createElement('template');
  template.innerHTML = html;
  const anchors = template.content.querySelectorAll('a');
  for (const anchor of anchors) {
    anchor.setAttribute('target', '_blank');
    anchor.setAttribute('rel', 'noopener noreferrer');
  }

  return template.innerHTML;
}

export default function InfoTooltip({ label, html, side = 'top', align = 'start' }: InfoTooltipProps) {
  const [open, setOpen] = useState(false);
  const tooltipId = useId();
  const placement: Placement = align === 'center' ? side : `${side}-${align}`;

  const { refs, floatingStyles, context } = useFloating({
    open,
    onOpenChange: setOpen,
    placement,
    whileElementsMounted: autoUpdate,
    middleware: [offset(10), flip({ padding: 12 }), shift({ padding: 12 })],
  });

  const hover = useHover(context, {
    delay: {
      close: 250,
    },
    move: false,
  });
  const focus = useFocus(context);
  const click = useClick(context, {
    toggle: true,
  });
  const dismiss = useDismiss(context);
  const role = useRole(context, { role: 'dialog' });

  const { getReferenceProps, getFloatingProps } = useInteractions([hover, focus, click, dismiss, role]);

  const sanitizedHtml = useMemo(() => sanitizeHtmlTooltip(html), [html]);

  return (
    <>
      <button
        type="button"
        ref={refs.setReference}
        aria-label={label}
        aria-expanded={open}
        aria-describedby={open ? tooltipId : undefined}
        className="inline-flex h-4 w-4 items-center justify-center rounded-full border border-border-accent text-[10px] font-semibold leading-none text-secondary transition hover:border-border-accent-hover hover:text-primary focus:outline-hidden focus:ring-2 focus:ring-focus-ring"
        {...getReferenceProps()}
      >
        i
      </button>

      {open && (
        <FloatingPortal>
          <div
            id={tooltipId}
            ref={refs.setFloating}
            style={{ ...floatingStyles, zIndex: Number.MAX_SAFE_INTEGER }}
            className="z-80 max-w-sm rounded-md border border-border-default bg-inset px-3 py-2 text-xs text-secondary-strong shadow-lg [&_a]:font-medium [&_a]:underline [&_ul]:ml-4 [&_ul]:list-disc [&_ol]:ml-4 [&_ol]:list-decimal [&_code]:rounded-sm [&_code]:bg-surface-hover-soft [&_code]:px-1 [&_code]:py-0.5"
            {...getFloatingProps()}
            dangerouslySetInnerHTML={{ __html: sanitizedHtml }}
          />
        </FloatingPortal>
      )}
    </>
  );
}
