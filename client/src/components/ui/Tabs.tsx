import type { ReactNode } from 'react';

export type TabDefinition = {
  id: string;
  label: ReactNode;
};

export default function Tabs({
  tabs,
  activeId,
  onChange,
  children,
  className,
}: {
  tabs: TabDefinition[];
  activeId: string;
  onChange: (id: string) => void;
  children: ReactNode;
  className?: string | undefined;
}) {
  return (
    <div className={`flex flex-col ${className ?? ''}`}>
      <div role="tablist" className="flex">
        {tabs.map((tab) => {
          const active = tab.id === activeId;
          return (
            <button
              key={tab.id}
              type="button"
              role="tab"
              aria-selected={active}
              onClick={() => onChange(tab.id)}
              className={`-mr-px -mb-px rounded-t-sm border border-border-default px-4 py-2 text-sm ${
                active
                  ? 'relative z-10 border-b-transparent! bg-surface-hover-strong! font-medium text-primary'
                  : 'bg-surface-soft! text-muted hover:text-primary'
              }`}
            >
              {tab.label}
            </button>
          );
        })}
      </div>
      <div role="tabpanel" className="rounded-b-sm border border-border-default bg-inset p-4">
        {children}
      </div>
    </div>
  );
}
