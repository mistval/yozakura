export function breadthFirstSearch<T>(
  start: T,
  getNeighbors: (node: T) => Iterable<T>,
  options?: {
    canEnter?: (node: T) => boolean;
    shouldStop?: (node: T, distance: number) => boolean;
  }
): {
  order: T[];
  distance: Map<T, number>;
  predecessor: Map<T, T>;
} {
  const order: T[] = [];
  const distance = new Map<T, number>([[start, 0]]);
  const predecessor = new Map<T, T>();
  const queue: T[] = [start];

  while (queue.length > 0) {
    const node = queue.shift()!;
    const nodeDistance = distance.get(node)!;

    if (options?.shouldStop?.(node, nodeDistance)) {
      break;
    }

    order.push(node);

    for (const neighbor of getNeighbors(node)) {
      if (distance.has(neighbor)) {
        continue;
      }

      if (options?.canEnter && !options.canEnter(neighbor)) {
        continue;
      }

      distance.set(neighbor, nodeDistance + 1);
      predecessor.set(neighbor, node);
      queue.push(neighbor);
    }
  }

  return { order, distance, predecessor };
}

export function findNearestReachable<T>(
  start: T,
  getNeighbors: (node: T) => Iterable<T>,
  isTarget: (node: T) => boolean,
  canEnter: (node: T) => boolean
): {
  targets: T[];
  firstStepToward: (target: T) => T | undefined;
} {
  let nearestDistance: number | undefined;
  const targets: T[] = [];

  const { predecessor } = breadthFirstSearch(start, getNeighbors, {
    canEnter,
    shouldStop: (node, nodeDistance) => {
      if (nearestDistance !== undefined && nodeDistance > nearestDistance) {
        return true;
      }

      if (isTarget(node)) {
        nearestDistance ??= nodeDistance;
        targets.push(node);
      }

      return false;
    },
  });

  const firstStepToward = (target: T): T | undefined => {
    let node = target;
    let parent = predecessor.get(node);

    while (parent !== undefined && parent !== start) {
      node = parent;
      parent = predecessor.get(node);
    }

    return parent === start ? node : undefined;
  };

  return { targets, firstStepToward };
}
