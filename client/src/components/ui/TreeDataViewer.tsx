import { useState, useCallback, useRef, useEffect, useMemo, type ReactNode } from 'react';
import {
  type TreeNode,
  type CheckState,
  computeNodeCheckState,
  collectDescendantIds,
  toggleNodeSelection,
  isTreeAllSelected,
} from './tree_selection.js';

export type { TreeNode, CheckState };

export type TreeSelectionState = {
  selectedIds: Set<string>;
  selectAll: () => Promise<void>;
  clearAll: () => void;
  isAllSelected: boolean;
  hasSelection: boolean;
};

export type TreeDataViewerProps = {
  roots: TreeNode[];
  selectedIds: Set<string>;
  onSelectionChange: (selectedIds: Set<string>) => void;
  renderControls?: (selection: TreeSelectionState) => ReactNode;
  disabled?: boolean;
  className?: string;
};

function TriStateCheckbox({
  state,
  onChange,
  disabled,
  'aria-label': ariaLabel,
}: {
  state: CheckState;
  onChange: () => void;
  disabled?: boolean;
  'aria-label'?: string;
}) {
  const ref = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (ref.current) {
      ref.current.indeterminate = state === 'some';
    }
  }, [state]);

  return (
    <input
      ref={ref}
      type="checkbox"
      checked={state === 'all'}
      onChange={onChange}
      disabled={disabled}
      aria-label={ariaLabel}
      className="cursor-pointer h-4 w-4 rounded border-border-default text-primary focus:ring-focus-ring"
    />
  );
}

export default function TreeDataViewer({
  roots,
  selectedIds,
  onSelectionChange,
  renderControls,
  disabled = false,
  className = '',
}: TreeDataViewerProps) {
  const [expandedPaths, setExpandedPaths] = useState<Set<string>>(() => new Set());
  const [childrenMap, setChildrenMap] = useState<Record<string, TreeNode[]>>({});
  const [loadingPaths, setLoadingPaths] = useState<Set<string>>(() => new Set());

  const childrenMapRef = useRef(childrenMap);
  childrenMapRef.current = childrenMap;

  useEffect(() => {
    setChildrenMap({});
  }, [roots]);

  // Load children for a given node at path
  const loadChildren = useCallback(async (node: TreeNode, path: string): Promise<TreeNode[]> => {
    if (childrenMapRef.current[path]) {
      return childrenMapRef.current[path];
    }
    if (!node.getChildren) {
      return [];
    }

    setLoadingPaths((prev) => new Set(prev).add(path));
    try {
      const children = await node.getChildren();
      setChildrenMap((prev) => ({ ...prev, [path]: children }));
      return children;
    } finally {
      setLoadingPaths((prev) => {
        const next = new Set(prev);
        next.delete(path);
        return next;
      });
    }
  }, []);

  const getNodeCheckState = useCallback(
    (node: TreeNode, path: string): CheckState => {
      return computeNodeCheckState(node, path, selectedIds, childrenMap);
    },
    [childrenMap, selectedIds]
  );

  // Toggle node expansion
  const toggleExpand = useCallback(
    async (node: TreeNode, path: string) => {
      if (disabled || !node.getChildren) return;

      const isExpanded = expandedPaths.has(path);
      if (isExpanded) {
        setExpandedPaths((prev) => {
          const next = new Set(prev);
          next.delete(path);
          return next;
        });
      } else {
        setExpandedPaths((prev) => new Set(prev).add(path));
        await loadChildren(node, path);
      }
    },
    [disabled, expandedPaths, loadChildren]
  );

  // Toggle checkbox for a node at path
  const handleToggleCheck = useCallback(
    async (node: TreeNode, path: string) => {
      if (disabled) return;
      const next = await toggleNodeSelection(node, path, selectedIds, childrenMap, loadChildren);
      onSelectionChange(next);
    },
    [childrenMap, disabled, loadChildren, onSelectionChange, selectedIds]
  );

  // Select all across all roots
  const selectAll = useCallback(async () => {
    if (disabled) return;
    const nextSelected = new Set(selectedIds);
    for (const root of roots) {
      const ids = await collectDescendantIds(root, root.id, loadChildren);
      for (const id of ids) {
        nextSelected.add(id);
      }
    }
    onSelectionChange(nextSelected);
  }, [disabled, loadChildren, onSelectionChange, roots, selectedIds]);

  // Clear all selections
  const clearAll = useCallback(() => {
    if (disabled) return;
    onSelectionChange(new Set());
  }, [disabled, onSelectionChange]);

  const hasSelection = useMemo(() => selectedIds.size > 0, [selectedIds]);

  const isAllSelected = useMemo(() => {
    return isTreeAllSelected(roots, selectedIds, childrenMap);
  }, [childrenMap, roots, selectedIds]);

  const renderNode = (node: TreeNode, path: string, depth = 0): ReactNode => {
    const isExpanded = expandedPaths.has(path);
    const isLoading = loadingPaths.has(path);
    const checkState = getNodeCheckState(node, path);
    const children = childrenMap[path];
    const canExpand = Boolean(node.getChildren);

    const badgeText = typeof node.badge === 'string' ? node.badge : node.badge?.text;
    const badgeVariant = typeof node.badge === 'string' ? 'default' : (node.badge?.variant ?? 'default');

    return (
      <div key={path} className="flex flex-col select-none">
        <div
          className="flex items-center gap-2 py-1.5 px-2 hover:bg-surface-hover rounded text-sm transition-colors"
          style={{ paddingLeft: `${depth * 1.25 + 0.5}rem` }}
        >
          {canExpand ? (
            <button
              type="button"
              onClick={() => toggleExpand(node, path)}
              disabled={disabled || isLoading}
              className={`w-5 h-5 flex items-center justify-center text-secondary transition-transform ${
                disabled ? 'cursor-not-allowed opacity-50' : 'hover:text-primary cursor-pointer'
              }`}
              aria-label={isExpanded ? 'Collapse' : 'Expand'}
            >
              {isLoading ? (
                <span className="text-xs animate-spin">⟳</span>
              ) : (
                <span className={`text-xs inline-block transform ${isExpanded ? 'rotate-90' : ''}`}>▶</span>
              )}
            </button>
          ) : (
            <span className="w-5 h-5" />
          )}

          <TriStateCheckbox
            state={checkState}
            onChange={() => handleToggleCheck(node, path)}
            disabled={disabled}
            aria-label={`Select ${node.label}`}
          />

          <div
            className={`flex flex-1 items-baseline gap-2 min-w-0 ${
              disabled ? 'cursor-not-allowed opacity-60' : 'cursor-pointer'
            }`}
            onClick={() => {
              if (disabled) return;
              if (canExpand) {
                toggleExpand(node, path);
              } else {
                handleToggleCheck(node, path);
              }
            }}
          >
            <span className="font-medium text-primary truncate">{node.label}</span>
            {node.subtitle && <span className="text-xs text-muted truncate">{node.subtitle}</span>}
          </div>

          {badgeText && (
            <span
              className={`text-xs px-2 py-0.5 rounded border whitespace-nowrap ${
                badgeVariant === 'warning'
                  ? 'bg-warning-bg text-warning-text border-warning-border'
                  : badgeVariant === 'info'
                    ? 'bg-surface-soft text-secondary border-border-default'
                    : 'bg-surface-subtle text-primary border-border-default'
              }`}
            >
              {badgeText}
            </span>
          )}
        </div>

        {canExpand && isExpanded && children && (
          <div className="flex flex-col">
            {children.map((child) => renderNode(child, `${path}/${child.id}`, depth + 1))}
          </div>
        )}
      </div>
    );
  };

  const selectionState: TreeSelectionState = {
    selectedIds,
    selectAll,
    clearAll,
    isAllSelected,
    hasSelection,
  };

  return (
    <div className={`flex flex-col ${className}`}>
      {renderControls && <div className="mb-3">{renderControls(selectionState)}</div>}
      <div
        role="tree"
        className={`border border-border-default rounded-sm bg-surface-soft p-2 overflow-y-auto max-h-96 ${
          disabled ? 'opacity-60 cursor-not-allowed select-none' : ''
        }`}
      >
        {roots.length === 0 ? (
          <div className="p-4 text-center text-sm text-secondary">No items available</div>
        ) : (
          roots.map((root) => renderNode(root, root.id, 0))
        )}
      </div>
    </div>
  );
}
