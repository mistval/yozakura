export type TreeNode = {
  id: string;
  label: string;
  subtitle?: string;
  requiredSiblingNodeIds?: string[];
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
  selectedIds: Set<string>,
  childrenMap: Record<string, TreeNode[]>
): CheckState {
  const children = childrenMap[node.id];

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
    const childState = computeNodeCheckState(child, selectedIds, childrenMap);
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
  getChildren: (node: TreeNode) => Promise<TreeNode[]>
): Promise<string[]> {
  const ids: string[] = [node.id];
  if (!node.getChildren) {
    return ids;
  }

  const children = await getChildren(node);
  for (const child of children) {
    const subIds = await collectDescendantIds(child, getChildren);
    for (const subId of subIds) {
      ids.push(subId);
    }
  }

  return ids;
}

/**
 * Finds all ancestor IDs above the given nodeId by traversing parents recorded in childrenMap.
 */
export function getAncestorIds(nodeId: string, childrenMap: Record<string, TreeNode[]>): string[] {
  const ancestors = new Set<string>();
  const queue = [nodeId];
  while (queue.length > 0) {
    const currentId = queue.shift()!;
    for (const [parentId, children] of Object.entries(childrenMap)) {
      if (children.some((c) => c.id === currentId)) {
        if (!ancestors.has(parentId)) {
          ancestors.add(parentId);
          queue.push(parentId);
        }
      }
    }
  }
  return Array.from(ancestors);
}

/**
 * Transitively finds and returns all required prerequisite IDs defined by
 * `requiredSiblingNodeIds` for the given node IDs.
 */
export function resolveRequiredNodeIds(
  nodeIdsToAdd: Iterable<string>,
  knownNodesById: Map<string, TreeNode>
): Set<string> {
  const result = new Set<string>();
  const queue = Array.from(nodeIdsToAdd);
  while (queue.length > 0) {
    const currentId = queue.pop()!;
    const node = knownNodesById.get(currentId);
    if (node?.requiredSiblingNodeIds) {
      for (const reqId of node.requiredSiblingNodeIds) {
        if (!result.has(reqId)) {
          result.add(reqId);
          queue.push(reqId);
        }
      }
    }
  }
  return result;
}

/**
 * Transitively finds and returns all dependent node IDs that require any of the
 * deselected nodes via `requiredSiblingNodeIds`.
 */
export function resolveDependentNodeIds(
  deselectedIds: Iterable<string>,
  knownNodesById: Map<string, TreeNode>,
  currentlySelected: Set<string>
): Set<string> {
  const result = new Set<string>();
  const queue = Array.from(deselectedIds);
  const allNodes = Array.from(knownNodesById.values());
  while (queue.length > 0) {
    const currentRemovedId = queue.pop()!;
    for (const n of allNodes) {
      if (
        !result.has(n.id) &&
        currentlySelected.has(n.id) &&
        n.requiredSiblingNodeIds?.includes(currentRemovedId)
      ) {
        result.add(n.id);
        queue.push(n.id);
      }
    }
  }
  return result;
}

/**
 * Toggles selection of a node and all of its descendants, resolving prerequisite
 * dependencies on check, and cascading removals to dependents on uncheck.
 */
export async function toggleNodeSelection(
  node: TreeNode,
  selectedIds: Set<string>,
  childrenMap: Record<string, TreeNode[]>,
  getChildren: (node: TreeNode) => Promise<TreeNode[]>,
  roots?: TreeNode[]
): Promise<Set<string>> {
  const currentState = computeNodeCheckState(node, selectedIds, childrenMap);
  const shouldSelect = currentState !== 'all';
  const allIds = await collectDescendantIds(node, getChildren);

  const knownNodesById = new Map<string, TreeNode>();
  if (roots) {
    for (const r of roots) knownNodesById.set(r.id, r);
  }
  for (const list of Object.values(childrenMap)) {
    for (const n of list) knownNodesById.set(n.id, n);
  }
  knownNodesById.set(node.id, node);

  const nextSelected = new Set(selectedIds);
  if (shouldSelect) {
    for (const id of allIds) {
      nextSelected.add(id);
    }
    // Auto-select required prerequisites (and their prerequisites transitively)
    const required = resolveRequiredNodeIds(allIds, knownNodesById);
    for (const reqId of required) {
      nextSelected.add(reqId);
    }
    // Auto-select ancestors
    for (const ancestorId of getAncestorIds(node.id, childrenMap)) {
      nextSelected.add(ancestorId);
    }
  } else {
    // Deselect node and all descendants
    for (const id of allIds) {
      nextSelected.delete(id);
    }
    // Auto-deselect any dependent nodes that require any of the deselected nodes
    const dependents = resolveDependentNodeIds(allIds, knownNodesById, nextSelected);
    for (const depId of dependents) {
      nextSelected.delete(depId);
    }
    // Deselect ancestors whose loaded children now evaluate to 'none'
    for (const ancestorId of getAncestorIds(node.id, childrenMap)) {
      const children = childrenMap[ancestorId];
      if (children && children.length > 0) {
        const anyChildChecked = children.some(
          (c) => computeNodeCheckState(c, nextSelected, childrenMap) !== 'none'
        );
        if (!anyChildChecked) {
          nextSelected.delete(ancestorId);
        }
      }
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
    if (computeNodeCheckState(root, selectedIds, childrenMap) !== 'all') {
      return false;
    }
  }
  return true;
}
