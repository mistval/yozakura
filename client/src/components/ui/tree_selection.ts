export type TreeNode = {
  id: string; // Entity ID (can be shared across multiple paths for aliased nodes)
  label: string;
  subtitle?: string;
  badge?:
    | {
        text: string;
        variant?: 'warning' | 'info' | 'default';
      }
    | string
    | undefined;
  getChildren?: () => Promise<TreeNode[]>;
};

export type CheckState = 'none' | 'some' | 'all';

/**
 * Computes the tri-state check state ('none' | 'some' | 'all') of a node based on:
 * - its presence in selectedIds
 * - its children in childrenMap (if loaded)
 */
export function computeNodeCheckState(
  node: TreeNode,
  path: string,
  selectedIds: Set<string>,
  childrenMap: Record<string, TreeNode[]>
): CheckState {
  const children = childrenMap[path];

  // Leaf node or node explicitly without children
  if (!node.getChildren || (children && children.length === 0)) {
    return selectedIds.has(node.id) ? 'all' : 'none';
  }

  // Children not yet loaded
  if (!children) {
    return selectedIds.has(node.id) ? 'all' : 'none';
  }

  let hasAll = false;
  let hasNone = false;
  let hasSome = false;

  for (const child of children) {
    const childPath = `${path}/${child.id}`;
    const childState = computeNodeCheckState(child, childPath, selectedIds, childrenMap);
    if (childState === 'all') hasAll = true;
    else if (childState === 'none') hasNone = true;
    else if (childState === 'some') hasSome = true;
  }

  if (hasSome || (hasAll && hasNone)) {
    return 'some';
  }
  if (hasAll && !hasNone) {
    return 'all';
  }
  return selectedIds.has(node.id) ? 'some' : 'none';
}

/**
 * Recursively collects all descendant IDs for a node (including the node itself),
 * fetching children via the provided loader if they are not already in memory.
 */
export async function collectDescendantIds(
  node: TreeNode,
  path: string,
  getChildren: (node: TreeNode, path: string) => Promise<TreeNode[]>
): Promise<string[]> {
  const ids: string[] = [node.id];
  if (!node.getChildren) {
    return ids;
  }

  const children = await getChildren(node, path);
  for (const child of children) {
    const childPath = `${path}/${child.id}`;
    const subIds = await collectDescendantIds(child, childPath, getChildren);
    for (const subId of subIds) {
      ids.push(subId);
    }
  }

  return ids;
}

/**
 * Toggles selection of a node and all of its descendants.
 * If current state is 'all', unchecks node and all descendants.
 * If current state is 'none' or 'some', checks node and all descendants.
 */
export async function toggleNodeSelection(
  node: TreeNode,
  path: string,
  selectedIds: Set<string>,
  childrenMap: Record<string, TreeNode[]>,
  getChildren: (node: TreeNode, path: string) => Promise<TreeNode[]>
): Promise<Set<string>> {
  const currentState = computeNodeCheckState(node, path, selectedIds, childrenMap);
  const shouldSelect = currentState !== 'all';
  const allIds = await collectDescendantIds(node, path, getChildren);

  const nextSelected = new Set(selectedIds);
  if (shouldSelect) {
    for (const id of allIds) {
      nextSelected.add(id);
    }
  } else {
    for (const id of allIds) {
      nextSelected.delete(id);
    }
  }

  return nextSelected;
}

/**
 * Checks whether all roots and their loaded descendants are selected ('all').
 */
export function isTreeAllSelected(
  roots: TreeNode[],
  selectedIds: Set<string>,
  childrenMap: Record<string, TreeNode[]>
): boolean {
  if (roots.length === 0) return false;
  for (const root of roots) {
    if (computeNodeCheckState(root, root.id, selectedIds, childrenMap) !== 'all') {
      return false;
    }
  }
  return true;
}
