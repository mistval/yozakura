import { describe, it, expect, vi } from 'vitest';
import {
  type TreeNode,
  computeNodeCheckState,
  collectDescendantIds,
  toggleNodeSelection,
  isTreeAllSelected,
} from './tree_selection.js';

describe('tree_selection', () => {
  describe('computeNodeCheckState', () => {
    it('computes check state for leaf nodes correctly', () => {
      const leaf: TreeNode = { id: 'leaf-1', label: 'Leaf 1' };
      const selected = new Set<string>();

      expect(computeNodeCheckState(leaf, selected, {})).toBe('none');

      selected.add('leaf-1');
      expect(computeNodeCheckState(leaf, selected, {})).toBe('all');
    });

    it('computes parent tri-state (none, some, all) based on loaded children', () => {
      const child1: TreeNode = { id: 'c1', label: 'Child 1' };
      const child2: TreeNode = { id: 'c2', label: 'Child 2' };
      const parent: TreeNode = {
        id: 'p1',
        label: 'Parent',
        getChildren: async () => [child1, child2],
      };

      const childrenMap = {
        p1: [child1, child2],
      };

      const selected = new Set<string>();
      expect(computeNodeCheckState(parent, selected, childrenMap)).toBe('none');

      selected.add('c1');
      expect(computeNodeCheckState(parent, selected, childrenMap)).toBe('some');

      selected.add('c2');
      expect(computeNodeCheckState(parent, selected, childrenMap)).toBe('all');
    });

    it('handles nested parent states with 3 levels', () => {
      const leaf1: TreeNode = { id: 'l1', label: 'Leaf 1' };
      const leaf2: TreeNode = { id: 'l2', label: 'Leaf 2' };
      const mid: TreeNode = {
        id: 'mid',
        label: 'Middle',
        getChildren: async () => [leaf1, leaf2],
      };
      const root: TreeNode = {
        id: 'root',
        label: 'Root',
        getChildren: async () => [mid],
      };

      const childrenMap = {
        root: [mid],
        mid: [leaf1, leaf2],
      };

      const selected = new Set<string>();
      expect(computeNodeCheckState(root, selected, childrenMap)).toBe('none');

      selected.add('l1');
      expect(computeNodeCheckState(mid, selected, childrenMap)).toBe('some');
      expect(computeNodeCheckState(root, selected, childrenMap)).toBe('some');

      selected.add('l2');
      expect(computeNodeCheckState(mid, selected, childrenMap)).toBe('all');
      expect(computeNodeCheckState(root, selected, childrenMap)).toBe('all');
    });
  });

  describe('collectDescendantIds and toggleNodeSelection', () => {
    it('recursively resolves and collects all descendant IDs for a collapsed parent', async () => {
      const leaf1: TreeNode = { id: 'leaf-1', label: 'Leaf 1' };
      const leaf2: TreeNode = { id: 'leaf-2', label: 'Leaf 2' };
      const getChildrenMock = vi.fn(async () => [leaf1, leaf2]);
      const parent: TreeNode = {
        id: 'parent',
        label: 'Parent',
        getChildren: getChildrenMock,
      };

      const ids = await collectDescendantIds(parent, async (n) => (n.getChildren ? n.getChildren() : []));
      expect(ids).toEqual(['parent', 'leaf-1', 'leaf-2']);
      expect(getChildrenMock).toHaveBeenCalledTimes(1);
    });

    it('toggles selection of parent and all lazy descendants', async () => {
      const leaf1: TreeNode = { id: 'leaf-1', label: 'Leaf 1' };
      const leaf2: TreeNode = { id: 'leaf-2', label: 'Leaf 2' };
      const parent: TreeNode = {
        id: 'parent',
        label: 'Parent',
        getChildren: async () => [leaf1, leaf2],
      };

      const loader = async (n: TreeNode) => (n.getChildren ? n.getChildren() : []);

      // Selecting from empty
      const initialSelected = new Set<string>();
      const afterSelect = await toggleNodeSelection(parent, initialSelected, {}, loader);

      expect(afterSelect.has('parent')).toBe(true);
      expect(afterSelect.has('leaf-1')).toBe(true);
      expect(afterSelect.has('leaf-2')).toBe(true);

      // Deselecting when already 'all'
      const childrenMap = { parent: [leaf1, leaf2] };
      const afterDeselect = await toggleNodeSelection(parent, afterSelect, childrenMap, loader);

      expect(afterDeselect.has('parent')).toBe(false);
      expect(afterDeselect.has('leaf-1')).toBe(false);
      expect(afterDeselect.has('leaf-2')).toBe(false);
    });
  });

  describe('aliased nodes synchronization', () => {
    it('synchronizes checked state across multiple parents sharing the same entity ID', async () => {
      const aliasedMapNode1: TreeNode = { id: 'map:map_001', label: 'Paradise Island' };
      const aliasedMapNode2: TreeNode = { id: 'map:map_001', label: 'Paradise Island' };

      const scenarioNode: TreeNode = {
        id: 'scenario:scen_001',
        label: 'Beach Vacation',
        getChildren: async () => [aliasedMapNode1],
      };

      const mapsRoot: TreeNode = {
        id: 'root:maps',
        label: 'All Maps',
        getChildren: async () => [aliasedMapNode2],
      };

      const childrenMap = {
        'scenario:scen_001': [aliasedMapNode1],
        'root:maps': [aliasedMapNode2],
      };

      let selected = new Set<string>();

      // Initially neither is checked
      expect(scenarioNode.id).toBe('scenario:scen_001');
      expect(computeNodeCheckState(aliasedMapNode1, selected, childrenMap)).toBe('none');
      expect(computeNodeCheckState(aliasedMapNode2, selected, childrenMap)).toBe('none');
      expect(computeNodeCheckState(mapsRoot, selected, childrenMap)).toBe('none');

      // Check map node under scenario
      selected = await toggleNodeSelection(
        aliasedMapNode1,
        selected,
        childrenMap,
        async () => []
      );

      // Both map references are now checked, and root:maps shows 'all'
      expect(selected.has('map:map_001')).toBe(true);
      expect(computeNodeCheckState(aliasedMapNode1, selected, childrenMap)).toBe('all');
      expect(computeNodeCheckState(aliasedMapNode2, selected, childrenMap)).toBe('all');
      expect(computeNodeCheckState(mapsRoot, selected, childrenMap)).toBe('all');
    });
  });

  describe('ancestor synchronization on child toggle', () => {
    it('automatically adds ancestor IDs when selecting a child node, and removes them when all children are unselected', async () => {
      const child1: TreeNode = { id: 'c1', label: 'Child 1' };
      const child2: TreeNode = { id: 'c2', label: 'Child 2' };
      const parent: TreeNode = {
        id: 'parent',
        label: 'Parent',
        getChildren: async () => [child1, child2],
      };

      const childrenMap = {
        root: [parent],
        parent: [child1, child2],
      };

      let selected = new Set<string>();

      // Select child1
      selected = await toggleNodeSelection(child1, selected, childrenMap, async () => []);
      expect(selected.has('c1')).toBe(true);
      expect(selected.has('parent')).toBe(true);
      expect(selected.has('root')).toBe(true);

      // Select child2
      selected = await toggleNodeSelection(child2, selected, childrenMap, async () => []);
      expect(selected.has('c2')).toBe(true);
      expect(selected.has('parent')).toBe(true);
      expect(selected.has('root')).toBe(true);

      // Unselect child1 -> parent and root remain selected because child2 is still selected
      selected = await toggleNodeSelection(child1, selected, childrenMap, async () => []);
      expect(selected.has('c1')).toBe(false);
      expect(selected.has('c2')).toBe(true);
      expect(selected.has('parent')).toBe(true);
      expect(selected.has('root')).toBe(true);

      // Unselect child2 -> parent and root are removed because no children remain
      selected = await toggleNodeSelection(child2, selected, childrenMap, async () => []);
      expect(selected.has('c2')).toBe(false);
      expect(selected.has('parent')).toBe(false);
      expect(selected.has('root')).toBe(false);
    });

    it('auto-checks required sibling nodes transitively when checking a dependent node', async () => {
      const characters: TreeNode = { id: 'chars', label: 'Characters' };
      const groups: TreeNode = {
        id: 'groups',
        label: 'Groups',
        requiredSiblingNodeIds: ['chars'],
      };
      const schedules: TreeNode = {
        id: 'schedules',
        label: 'Schedules',
        requiredSiblingNodeIds: ['groups'],
      };

      const childrenMap = {
        scenario: [characters, groups, schedules],
      };

      // Select schedules -> should auto-select groups and characters, plus ancestor scenario
      const selected = await toggleNodeSelection(
        schedules,
        new Set<string>(),
        childrenMap,
        async () => []
      );

      expect(selected.has('schedules')).toBe(true);
      expect(selected.has('groups')).toBe(true);
      expect(selected.has('chars')).toBe(true);
      expect(selected.has('scenario')).toBe(true);
    });

    it('auto-unchecks dependent nodes transitively when unchecking a required node', async () => {
      const characters: TreeNode = { id: 'chars', label: 'Characters' };
      const groups: TreeNode = {
        id: 'groups',
        label: 'Groups',
        requiredSiblingNodeIds: ['chars'],
      };
      const schedules: TreeNode = {
        id: 'schedules',
        label: 'Schedules',
        requiredSiblingNodeIds: ['groups'],
      };
      const memories: TreeNode = {
        id: 'memories',
        label: 'Memories',
        requiredSiblingNodeIds: ['chars'],
      };

      const childrenMap = {
        scenario: [characters, groups, schedules, memories],
      };

      const initialSelected = new Set<string>(['scenario', 'chars', 'groups', 'schedules', 'memories']);

      // Unchecking groups should uncheck schedules, but preserve characters and memories
      const afterUncheckGroups = await toggleNodeSelection(
        groups,
        initialSelected,
        childrenMap,
        async () => []
      );

      expect(afterUncheckGroups.has('groups')).toBe(false);
      expect(afterUncheckGroups.has('schedules')).toBe(false);
      expect(afterUncheckGroups.has('chars')).toBe(true);
      expect(afterUncheckGroups.has('memories')).toBe(true);

      // Unchecking characters should uncheck all dependent nodes (groups, schedules, memories)
      const afterUncheckChars = await toggleNodeSelection(
        characters,
        initialSelected,
        childrenMap,
        async () => []
      );

      expect(afterUncheckChars.has('chars')).toBe(false);
      expect(afterUncheckChars.has('groups')).toBe(false);
      expect(afterUncheckChars.has('schedules')).toBe(false);
      expect(afterUncheckChars.has('memories')).toBe(false);
    });
  });

  describe('isTreeAllSelected', () => {
    it('returns true when all roots and children are selected', () => {
      const item1: TreeNode = { id: 'item1', label: 'Item 1' };
      const item2: TreeNode = { id: 'item2', label: 'Item 2' };
      const roots = [item1, item2];

      const selected = new Set<string>(['item1', 'item2']);
      expect(isTreeAllSelected(roots, selected, {})).toBe(true);

      selected.delete('item1');
      expect(isTreeAllSelected(roots, selected, {})).toBe(false);
    });
  });
});
